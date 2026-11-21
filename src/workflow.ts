import type { WorkflowStateStore } from "./state.js"
import type { WorkflowMode, WorkflowState } from "./types.js"

/** `Workflow mode:` labels used by the bundled commands, mapped to persisted workflow modes. */
const commandWorkflowModes: Readonly<Record<string, WorkflowMode>> = {
  comprehensive: "build",
  debug: "debug",
  "spec-audit": "spec-audit",
  "adversarial-research": "adversarial-research",
  verify: "verify",
  // Problem solving without implementation changes completes as research-only.
  ultrathink: "adversarial-research",
  "ultrathink-fusion": "adversarial-research"
}

export interface WorkflowCommand {
  /** The command's own mode label, for example "comprehensive". */
  readonly label: string
  readonly mode: WorkflowMode
  /** The user's task text, when the command was given one. */
  readonly goal?: string
}

/** Recognizes an expanded OpenUltraCode command prompt ("Workflow mode: <label>" on its own line). */
export function readWorkflowCommand(text: string): WorkflowCommand | undefined {
  // Every bundled workflow command starts by loading the skill; a bare "Workflow mode:" line
  // in an ordinary user prompt must not start a workflow.
  if (!text.includes("Use the `open-ultracode` skill")) return undefined
  const label = /^Workflow mode:[ \t]*([a-z-]+)[ \t]*$/imu.exec(text)?.[1]?.toLowerCase()
  const mode = label === undefined ? undefined : commandWorkflowModes[label]
  if (label === undefined || mode === undefined) return undefined

  // The bundled commands put the user's task into the first ```text block.
  const goal = /```text\r?\n([\s\S]*?)\r?\n```/u.exec(text)?.[1]?.trim()
  return { label, mode, ...(goal === undefined || goal === "" || goal === "$ARGUMENTS" ? {} : { goal }) }
}

/** Research modes end in findings or a recommendation, never in a verified change. */
export function isResearchMode(mode: WorkflowMode): boolean {
  return mode === "adversarial-research" || mode === "spec-audit"
}

/** A workflow is in progress from its command until it is marked completed. */
export function isActiveWorkflow(state: WorkflowState): boolean {
  return state.phase !== "completed" && state.phase !== "idle"
}

/**
 * Whether a session takes part in the workflow that owns the record. `rootSessionID` is the
 * top-level session it descends from, so a workflow's subagents belong to it. A session whose
 * ancestry could not be determined is given the benefit of the doubt.
 */
export function ownsWorkflow(state: WorkflowState, rootSessionID: string | undefined): boolean {
  return rootSessionID === undefined || state.sessionId === rootSessionID
}

/**
 * Starts a fresh workflow for a command, but keeps an unfinished workflow of the same session
 * when the command repeats its mode, so a follow-up continues it instead of discarding its
 * criteria and evidence. The verify command exists to check a workflow's evidence, so it
 * continues whatever workflow the session has open and leaves its mode as it is.
 */
export async function startWorkflow(
  stateStore: WorkflowStateStore,
  command: WorkflowCommand,
  sessionID: string,
  now = new Date()
): Promise<WorkflowState> {
  const { state } = await stateStore.load()
  if (
    state !== undefined &&
    isActiveWorkflow(state) &&
    state.sessionId === sessionID &&
    (state.mode === command.mode || command.mode === "verify")
  ) {
    return state
  }

  const timestamp = now.toISOString()
  const next: WorkflowState = {
    schemaVersion: 1,
    sessionId: sessionID,
    mode: command.mode,
    phase: "intake",
    startedAt: timestamp,
    updatedAt: timestamp,
    ...(command.goal === undefined ? {} : { goal: command.goal }),
    constraints: [],
    assumptions: [],
    criteria: [],
    findings: [],
    verification: [],
    degradations: []
  }
  await stateStore.update(next)
  return next
}
