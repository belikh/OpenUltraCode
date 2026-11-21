import type { DegradationNotice, DegradationSeverity, WorkflowPhase } from "./types.js"

/**
 * Degradation notices: what the workflow could not do, why, and the safe next step. Each notice
 * has a stable ID, so a repeated problem replaces its earlier notice instead of piling up.
 */

interface NoticeContext {
  readonly reason: string
  readonly occurredAt?: string
  readonly phase?: WorkflowPhase
}

export function createUnsupportedCapabilityNotice(input: NoticeContext & { readonly capability: string }): DegradationNotice {
  return createNotice(input, {
    id: `unsupported-${slugify(input.capability)}`,
    capability: input.capability,
    severity: "warning",
    userVisibleMessage: `OpenUltraCode cannot use ${input.capability}: ${input.reason}.`,
    safeNextAction: "Continue without this capability and use the visible workflow phases to track progress."
  })
}

export function createFailedPhaseNotice(input: NoticeContext & { readonly phase: WorkflowPhase }): DegradationNotice {
  return createNotice(input, {
    id: `phase-${input.phase}-failed`,
    capability: `workflow phase ${input.phase}`,
    severity: "blocked",
    userVisibleMessage: `The ${input.phase} phase failed: ${input.reason}.`,
    safeNextAction: `Stop the workflow at ${input.phase}, fix or explicitly accept the issue, then rerun the phase before reporting completion.`
  })
}

/** An ordinary tool error (a failed search, read, or MCP call): worth noting, not a workflow gate. */
export function createToolErrorNotice(input: NoticeContext & { readonly tool: string; readonly phase: WorkflowPhase }): DegradationNotice {
  return createNotice(input, {
    id: `tool-error-${slugify(input.tool)}`,
    capability: `tool ${input.tool}`,
    severity: "warning",
    userVisibleMessage: `${input.tool} failed during ${input.phase}: ${input.reason}.`,
    safeNextAction: `Check whether the ${input.tool} failure affects the result; record a blocked check if required evidence could not be produced.`
  })
}

export function createPermissionDeniedNotice(input: NoticeContext & { readonly operation: string }): DegradationNotice {
  return createNotice(input, {
    id: `permission-denied-${slugify(input.operation)}`,
    capability: `permission for ${input.operation}`,
    severity: "blocked",
    userVisibleMessage: `OpenUltraCode cannot perform ${input.operation}: ${input.reason}.`,
    safeNextAction: `Respect the permission denial; ask the user to approve ${input.operation} or choose a permitted alternative before retrying.`
  })
}

export function createCorruptStateNotice(input: NoticeContext): DegradationNotice {
  return createNotice(input, {
    id: "workflow-state-corrupt",
    capability: "workflow state persistence",
    severity: "warning",
    userVisibleMessage: "The OpenUltraCode workflow state file was corrupt and has been ignored for safety.",
    safeNextAction: "Continue with a new workflow state; inspect workflow-state.json.bak if prior context is needed."
  })
}

/** Adds a notice, replacing an earlier one with the same ID. */
export function withNotice(notices: readonly DegradationNotice[], notice: DegradationNotice): readonly DegradationNotice[] {
  return [...notices.filter((existing) => existing.id !== notice.id), notice]
}

interface NoticeText {
  readonly id: string
  readonly capability: string
  readonly severity: DegradationSeverity
  readonly userVisibleMessage: string
  readonly safeNextAction: string
}

function createNotice(context: NoticeContext, text: NoticeText): DegradationNotice {
  return {
    ...text,
    reason: context.reason,
    occurredAt: context.occurredAt ?? new Date().toISOString(),
    ...(context.phase === undefined ? {} : { phase: context.phase })
  }
}

/** Lowercase ASCII letters and digits joined by single hyphens; "unknown" when nothing is left. */
function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((part) => part.length > 0)
    .join("-")
  return slug.length === 0 ? "unknown" : slug
}
