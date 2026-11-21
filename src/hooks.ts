import { continuityHeading, createCompactionContext } from "./continuity.js"
import { configureFusionModels } from "./fusion-config.js"
import { describeFusionModelIssue, fusionRoleLabel } from "./fusion-models.js"
import { createFusionTools, findFusionModelIssues } from "./fusion-tools.js"
import { applyHighEffortRequestBehavior } from "./high-effort.js"
import { createModelCatalog, type ModelCatalog } from "./model-catalog.js"
import {
  createFailedPhaseNotice,
  createPermissionDeniedNotice,
  createToolErrorNotice,
  createUnsupportedCapabilityNotice,
  withNotice
} from "./notices.js"
import type { OpenCodePluginContext, SessionPromptEvent, ToolExecuteAfterEvent } from "./opencode-v2.js"
import type { WorkflowStateStore } from "./state.js"
import { createWorkflowTools } from "./tools.js"
import type { DegradationNotice, OpenUltraCodeOptions, WorkflowState } from "./types.js"
import { isActiveWorkflow, readWorkflowCommand, startWorkflow } from "./workflow.js"

const activationMarker = "OpenUltraCode mode active:"
const fusionCheckMarker = "OpenUltraCode fusion check:"

// OpenCode can load the same plugin more than once in one process (a global entry plus a
// project entry). Hooks must run once per project, or prompts and compactions get duplicated.
const activeProjects: Set<string> = ((globalThis as Record<symbol, unknown>)[Symbol.for("open-ultracode.active-projects")] ??= new Set<string>()) as Set<string>

/**
 * Registers OpenUltraCode on the OpenCode 2 plugin context and returns a cleanup function.
 * Every registration is awaited so failures surface when the plugin loads, and every hook
 * callback is guarded: a plugin bug is logged instead of failing the user's prompt, tool
 * call, permission check, or compaction.
 */
export async function registerOpenUltraCode(
  ctx: OpenCodePluginContext,
  config: OpenUltraCodeOptions,
  stateStore: WorkflowStateStore,
  projectDirectory: string
): Promise<() => void> {
  if (!config.enabled) {
    return () => {}
  }
  if (activeProjects.has(projectDirectory)) {
    console.warn(`OpenUltraCode: already active for ${projectDirectory}; skipping a duplicate plugin entry.`)
    return () => {}
  }
  activeProjects.add(projectDirectory)

  const controller = new AbortController()
  const catalog = createModelCatalog(ctx)
  const tools = [...createWorkflowTools(config, stateStore), ...createFusionTools(ctx, catalog, projectDirectory)]

  /** Changes the workflow only while one is in progress; a finished or absent workflow is left alone. */
  const whileActive = (change: (state: WorkflowState) => WorkflowState) =>
    stateStore.mutate((state) => (isActiveWorkflow(state) ? change(state) : undefined))
  const block = (notice: (state: WorkflowState) => DegradationNotice) =>
    whileActive((state) => withStateNotice({ ...state, phase: "blocked" }, notice(state)))
  const blockOnDeniedPermission = (operation: string, reason: string) =>
    block((state) => createPermissionDeniedNotice({ operation, reason, phase: state.phase }))

  const registrations = await Promise.all([
    ctx.session.hook("context", guarded("context hook", async (event) => {
      // High-effort hints belong to a workflow; ordinary requests in the project are left as they are.
      if (!config.highEffort.enabled || !(await hasActiveWorkflow(stateStore))) return
      applyHighEffortRequestBehavior(config.highEffort, event.options, await catalog.limits(event.model))
    })),
    ctx.session.hook("prompt", guarded("prompt hook", async (event: SessionPromptEvent) => {
      await activateWorkflow(stateStore, event)
      await checkFusionModels(catalog, stateStore, projectDirectory, event)
    })),
    ctx.session.hook("compaction", guarded("compaction hook", async (event) => {
      const context = createCompactionContext(await stateStore.load())
      if (context.length === 0 || event.system.some((part) => part.text.startsWith(continuityHeading))) return
      // System parts are plain structs; synthetic messages would have to satisfy the LLM.Message schema.
      event.system.push({ type: "text", text: context })
    })),
    ctx.permission.hook("evaluate", guarded("permission hook", async (event) => {
      // Only denials of real tool calls block the workflow; rules evaluated while building an
      // agent's tool list (for example fusion agents denying the configure tool) do not.
      if (event.effect !== "deny" || (event.source !== undefined && event.source.type !== "tool")) return
      const operation = event.resources.length > 0 ? `${event.action} ${event.resources.join(" ")}` : event.action
      await blockOnDeniedPermission(operation, event.message ?? "permission was denied by opencode rules")
    })),
    ctx.tool.hook("execute.after", guarded("tool hook", async (event: ToolExecuteAfterEvent) => {
      if (event.status !== "error") return
      const reason = event.error.message
      // Only failures of the workflow's own gate tools block it. Ordinary tool errors (a failed
      // search, a missing file, an MCP hiccup) are part of normal work and are only noted.
      if (event.tool.startsWith("open_ultracode_")) {
        await block((state) => createFailedPhaseNotice({ phase: state.phase, reason: `${event.tool} failed: ${reason}` }))
      } else {
        await whileActive((state) => withStateNotice(state, createToolErrorNotice({ tool: event.tool, phase: state.phase, reason })))
      }
    })),
    ctx.tool.transform((editor) => {
      for (const tool of tools) editor.add(tool)
    })
  ])

  void observePermissionRejections(ctx, controller.signal, blockOnDeniedPermission).catch((error: unknown) => {
    if (!controller.signal.aborted) logFailure("permission reply listener", error)
  })

  return () => {
    controller.abort()
    activeProjects.delete(projectDirectory)
    for (const registration of registrations) void registration.dispose().catch(() => {})
  }
}

function guarded<T>(label: string, callback: (event: T) => void | Promise<void>): (event: T) => Promise<void> {
  return async (event) => {
    try {
      await callback(event)
    } catch (error) {
      logFailure(label, error)
    }
  }
}

function logFailure(label: string, error: unknown): void {
  console.error(`OpenUltraCode: ${label} failed: ${error instanceof Error ? error.message : String(error)}`)
}

async function hasActiveWorkflow(stateStore: WorkflowStateStore): Promise<boolean> {
  const { state } = await stateStore.load()
  return state !== undefined && isActiveWorkflow(state)
}

function withStateNotice(state: WorkflowState, notice: DegradationNotice): WorkflowState {
  return { ...state, updatedAt: notice.occurredAt, degradations: withNotice(state.degradations, notice) }
}

/** Starts or continues the workflow for an OpenUltraCode command and marks the prompt once. */
async function activateWorkflow(stateStore: WorkflowStateStore, event: SessionPromptEvent): Promise<void> {
  const command = readWorkflowCommand(event.prompt.text)
  if (command === undefined) return

  await startWorkflow(stateStore, command, event.sessionID)

  if (!event.prompt.text.includes(activationMarker)) {
    // Put the marker into the admitted prompt so users and the model see it without a TUI hook.
    event.prompt.text =
      `${event.prompt.text}\n\n${activationMarker} ${command.label}. The active selected opencode model is preserved. ` +
      "Record intake with open_ultracode_record_intake, findings with open_ultracode_record_finding, " +
      "evidence with open_ultracode_record_verification, and finish with open_ultracode_completion_report."
  }
}

/** How the coordinator recovers: propose a valid fallback, let the user decide, then fix it. */
const fusionFallbackInstruction =
  "Before dispatching any affected fusion agent: tell the user about each problem, propose the suggested fallback " +
  "(or another valid model of the same provider from open_ultracode_list_models), and ask the user to confirm it or name another model. " +
  "Wait for the answer. Then call open_ultracode_configure_fusion with the model the user chose (it asks for permission); " +
  "opencode applies the change to the next agent dispatch without a restart, so continue the fusion run afterwards. " +
  "If the user declines, do not dispatch the affected agents; continue with the remaining valid roles only if the user agrees, otherwise stop and report the configuration problem. " +
  "If the user cannot be asked in this session (no question tool, non-interactive run), use the suggested fallback for this run only by passing it as the dispatch's explicit model, " +
  "do not change the fusion configuration, and disclose the fallback and the persistent fix command in the final report."

/**
 * Before a fusion workflow dispatches its panels, checks each fusion agent's provider, model,
 * and variant against opencode's live model list. Problems are shown in the prompt together
 * with a valid fallback from the same provider and instructions for the coordinator to ask
 * the user, and recorded as degradation notices. Nothing is changed without the user.
 */
async function checkFusionModels(
  catalog: ModelCatalog,
  stateStore: WorkflowStateStore,
  projectDirectory: string,
  event: SessionPromptEvent
): Promise<void> {
  const text = event.prompt.text
  if (readWorkflowCommand(text) === undefined || !/ultracode-fusion-(?:panel|arbiter)/u.test(text) || text.includes(fusionCheckMarker)) {
    return
  }

  const configured = await configureFusionModels(projectDirectory, {})
  const issues = await findFusionModelIssues(catalog, { ...configured.models })
  if (issues.length === 0) return

  event.prompt.text = `${text}\n\n${fusionCheckMarker} ${issues.map(describeFusionModelIssue).join(" ")} ${fusionFallbackInstruction}`
  await stateStore.mutate((state) =>
    issues.reduce(
      (next, issue) =>
        withStateNotice(
          next,
          createUnsupportedCapabilityNotice({
            capability: `${fusionRoleLabel(issue.role)} model`,
            reason: describeFusionModelIssue(issue),
            phase: state.phase
          })
        ),
      state
    )
  )
}

/** A user who rejects a permission request blocks the workflow, the same as a denying rule. */
async function observePermissionRejections(
  ctx: OpenCodePluginContext,
  signal: AbortSignal,
  blockOnDeniedPermission: (operation: string, reason: string) => Promise<unknown>
): Promise<void> {
  for await (const event of ctx.event.subscribe({ types: ["permission.replied"], signal })) {
    if (event.type !== "permission.replied" || event.data.reply !== "reject") continue

    try {
      const { operation, reason } = await describeRejectedRequest(ctx, event.data)
      await blockOnDeniedPermission(operation, reason)
    } catch (error) {
      logFailure("permission reply handling", error)
    }
  }
}

async function describeRejectedRequest(
  ctx: OpenCodePluginContext,
  data: Record<string, unknown>
): Promise<{ readonly operation: string; readonly reason: string }> {
  const requestID = typeof data.requestID === "string" ? data.requestID : undefined
  const generic = { operation: `permission request ${requestID ?? "unknown"}`, reason: "permission was rejected by the user" }
  if (typeof data.sessionID !== "string" || requestID === undefined) return generic

  try {
    const request = await ctx.permission.get({ sessionID: data.sessionID, requestID })
    return {
      operation: request.resources.length > 0 ? `${request.action} ${request.resources.join(" ")}` : request.action,
      reason: typeof request.message === "string" && request.message.length > 0 ? request.message : generic.reason
    }
  } catch {
    // The request may already be gone once it was answered; record the generic rejection.
    return generic
  }
}
