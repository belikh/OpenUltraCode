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
 * Starts a fresh workflow for a command, but keeps an unfinished workflow of the same session
 * and mode, so a follow-up command continues it instead of discarding its criteria and evidence.
 * A workflow ends when its completion report is verified or research-only, or when the phase is
 * set to completed; the next command then starts clean.
 */
export async function startWorkflow(
  stateStore: WorkflowStateStore,
  command: WorkflowCommand,
  sessionID: string,
  now = new Date()
): Promise<WorkflowState> {
  const { state } = await stateStore.load()
  if (state !== undefined && isActiveWorkflow(state) && state.sessionId === sessionID && state.mode === command.mode) {
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
