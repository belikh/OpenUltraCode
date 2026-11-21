import { currentEvidence, evaluateCompletionGate, isOpenFinding } from "./gate.js"
import { isRecord, readOneOf, readOptional, readRecord, readText, readTextList } from "./input.js"
import type { ToolDefinition } from "./opencode-v2.js"
import type { WorkflowStateStore } from "./state.js"
import {
  acceptanceCriterionSources,
  findingConfidences,
  findingDispositions,
  findingSeverities,
  verificationKinds,
  verificationResults,
  workflowPhases,
  type AcceptanceCriterion,
  type Finding,
  type OpenUltraCodeOptions,
  type VerificationEvidence,
  type WorkflowPhase,
  type WorkflowState
} from "./types.js"
import { isActiveWorkflow, isResearchMode } from "./workflow.js"

type JsonSchema = Record<string, unknown>

const noWorkflow = "No active OpenUltraCode workflow state was found. Start one with an OpenUltraCode command."

/** The workflow tools the model uses to keep the project-local workflow record and run the gate. */
export function createWorkflowTools(config: OpenUltraCodeOptions, stateStore: WorkflowStateStore): ToolDefinition[] {
  /** Applies a change to the active workflow and stamps it; undefined when no workflow exists. */
  const change = (apply: (state: WorkflowState) => Partial<WorkflowState>) =>
    stateStore.mutate((state) => ({ ...state, ...apply(state), updatedAt: new Date().toISOString() }))

  const recordEvidence = async (evidence: VerificationEvidence) => {
    const state = await change((current) => ({ verification: [...current.verification, evidence] }))
    return state === undefined ? { recorded: false, reason: noWorkflow } : { recorded: true, evidenceId: evidence.id }
  }

  return [
    tool(
      "open_ultracode_status",
      "Read the current OpenUltraCode workflow status from project-local state.",
      objectSchema({}),
      async () => {
        const { state, degradations: loadNotices } = await stateStore.load()
        const notices = [...(state?.degradations ?? []), ...loadNotices]
        const degradation = {
          degradations: notices.map((notice) => notice.id),
          degradationDetails: notices.map(({ id, capability, severity, reason, safeNextAction, phase }) => ({
            id,
            capability,
            severity,
            reason,
            safeNextAction,
            ...(phase === undefined ? {} : { phase })
          }))
        }
        if (state === undefined) return { active: false, ...degradation, openFindings: [], verification: [] }
        return {
          active: isActiveWorkflow(state),
          mode: state.mode,
          phase: state.phase,
          ...(state.goal === undefined ? {} : { goal: state.goal }),
          ...(state.completion === undefined ? {} : { completion: state.completion }),
          ...degradation,
          openFindings: state.findings.filter(isOpenFinding).map((finding) => finding.id),
          verification: currentEvidence(state.verification).map((evidence) => `${evidence.id}:${evidence.result}`)
        }
      }
    ),

    tool(
      "open_ultracode_record_intake",
      "Record the OpenUltraCode intake (goal, constraints, assumptions, acceptance criteria) and move the workflow to its next phase. " +
        "Use it after intake, when criteria change, to resume a blocked workflow once the blocker is resolved, and to mark the workflow completed.",
      recordIntakeInputSchema(),
      async (input) => {
        const record = readRecord(input)
        const intake = {
          ...readOptional(record, "goal", readText),
          ...readOptional(record, "constraints", readTextList),
          ...readOptional(record, "assumptions", readTextList),
          ...readOptional(record, "phase", (value, name) => readOneOf(value, settablePhases, name))
        }
        const criteria = record.criteria === undefined ? [] : readCriteria(record.criteria)
        const state = await change((current) => ({ ...intake, criteria: upsert(current.criteria, criteria) }))
        return state === undefined
          ? { recorded: false, reason: noWorkflow }
          : { recorded: true, phase: state.phase, criteriaIds: state.criteria.map((criterion) => criterion.id) }
      }
    ),

    tool(
      "open_ultracode_record_verification",
      "Record OpenUltraCode verification evidence in project-local workflow state. " +
        "Recording a check again under the same id replaces its earlier result.",
      verificationInputSchema(),
      async (input) => recordEvidence(readEvidence(readRecord(input)))
    ),

    tool(
      "open_ultracode_record_blocked_check",
      "Record an OpenUltraCode verification check that could not run.",
      blockedCheckInputSchema(),
      async (input) => recordEvidence(readEvidence({ ...readRecord(input), result: "blocked" }))
    ),

    tool(
      "open_ultracode_record_finding",
      "Record an adversarial review finding, or reconcile one: send an existing id with only the fields that change, " +
        "for example its disposition. Open findings of high or medium severity hold back completion.",
      recordFindingInputSchema(),
      async (input) => {
        const record = readRecord(input)
        const id = readText(record.id, "id")
        let finding: Finding | undefined
        const state = await change((current) => {
          // Validate the merged finding so an update may name only the fields that change.
          const merged: Record<string, unknown> = { ...current.findings.find((existing) => existing.id === id), ...record }
          // A reason belongs to the disposition it was given for; a new disposition starts without one.
          if (record.disposition !== undefined && record.dispositionReason === undefined) delete merged.dispositionReason
          finding = readFinding(merged)
          return { findings: upsert(current.findings, [finding]) }
        })
        return state === undefined || finding === undefined
          ? { recorded: false, reason: noWorkflow }
          : { recorded: true, findingId: id, open: isOpenFinding(finding) }
      }
    ),

    tool(
      "open_ultracode_completion_report",
      "Produce and persist an OpenUltraCode completion report using the runtime verification gate.",
      objectSchema({
        researchOnly: { type: "boolean", description: "The workflow produced findings or a recommendation, not a change; report research-only instead of verified." }
      }),
      async (input) => {
        const researchOnly = isRecord(input) && input.researchOnly === true
        const { verificationGate: policy, adversarialReview: reviewPolicy } = config
        const report = (state?: WorkflowState) =>
          evaluateCompletionGate({
            policy,
            reviewPolicy,
            criteria: state?.criteria ?? [],
            evidence: state?.verification ?? [],
            findings: state?.findings ?? [],
            assumptions: state?.assumptions ?? [],
            researchOnly: researchOnly || (state !== undefined && isResearchMode(state.mode))
          })
        const state = await change((current) => {
          const completion = report(current)
          // A verified or research-only report ends the workflow; any other status leaves work to do.
          const finished = completion.status === "verified" || completion.status === "research-only"
          return { completion, ...(finished ? { phase: "completed" as const } : {}) }
        })
        return state?.completion ?? report()
      }
    )
  ]
}

function tool(name: string, description: string, input: JsonSchema, run: (input: unknown) => Promise<unknown>): ToolDefinition {
  return {
    name,
    description,
    input,
    execute: async (rawInput) => ({ content: JSON.stringify(await run(rawInput), null, 2) })
  }
}

/** Adds or replaces items by id, keeping the position of an item that is replaced. */
function upsert<T extends { readonly id: string }>(existing: readonly T[], updates: readonly T[]): readonly T[] {
  const byId = new Map(existing.map((item) => [item.id, item]))
  for (const item of updates) byId.set(item.id, item)
  return [...byId.values()]
}

// The workflow leaves "blocked" by being moved to a real phase; it is never set by hand.
const settablePhases = workflowPhases.filter((phase): phase is Exclude<WorkflowPhase, "blocked"> => phase !== "blocked")

function readCriteria(value: unknown): readonly AcceptanceCriterion[] {
  if (!Array.isArray(value)) throw new TypeError("criteria must be an array")
  return value.map((item, index) => {
    const name = `criteria[${index}]`
    const record = readRecord(item, name)
    return {
      id: readText(record.id, `${name}.id`),
      text: readText(record.text, `${name}.text`),
      source: readOneOf(record.source ?? "user", acceptanceCriterionSources, `${name}.source`),
      status: "pending"
    }
  })
}

function readEvidence(record: Record<string, unknown>): VerificationEvidence {
  const result = readOneOf(record.result, verificationResults, "result")
  const base = {
    id: readText(record.id, "id"),
    kind: readOneOf(record.kind, verificationKinds, "kind"),
    summary: readText(record.summary, "summary"),
    criteriaIds: readTextList(record.criteriaIds, "criteriaIds"),
    ...readOptional(record, "command", readText),
    ...readOptional(record, "artifact", readText)
  }

  if (result === "pass") {
    return { ...base, result, ...readOptional(record, "residualRisk", readText) }
  }
  // A check that did not pass must say why, and what remains at risk because of it.
  return { ...base, result, reason: readText(record.reason, "reason"), residualRisk: readText(record.residualRisk, "residualRisk") }
}

function readFinding(record: Record<string, unknown>): Finding {
  const base = {
    id: readText(record.id, "id"),
    severity: readOneOf(record.severity, findingSeverities, "severity"),
    confidence: readOneOf(record.confidence, findingConfidences, "confidence"),
    title: readText(record.title, "title"),
    evidence: readTextList(record.evidence, "evidence"),
    impact: readText(record.impact, "impact"),
    recommendation: readText(record.recommendation, "recommendation"),
    ...readOptional(record, "affectedRequirementIds", readTextList)
  }
  if (record.disposition === undefined) return base

  const disposition = readOneOf(record.disposition, findingDispositions, "disposition")
  if (disposition === "rejected") {
    // Rejecting a finding without saying why would let review be waved away.
    return { ...base, disposition, dispositionReason: readText(record.dispositionReason, "dispositionReason") }
  }
  return { ...base, disposition, ...readOptional(record, "dispositionReason", readText) }
}

function objectSchema(properties: JsonSchema, required: readonly string[] = []): JsonSchema {
  return { type: "object", properties, ...(required.length === 0 ? {} : { required }), additionalProperties: false }
}

const text = { type: "string" }
const textList = { type: "array", items: text }

function recordIntakeInputSchema(): JsonSchema {
  return objectSchema({
    goal: { ...text, description: "The user-observable goal of the workflow." },
    constraints: textList,
    assumptions: textList,
    criteria: {
      type: "array",
      description: "Acceptance criteria. Existing criteria with the same id are replaced and reset to pending.",
      items: objectSchema({ id: text, text, source: { ...text, enum: acceptanceCriterionSources } }, ["id", "text"])
    },
    phase: { ...text, enum: settablePhases, description: "The phase the workflow moves to." }
  })
}

const evidenceProperties = {
  id: { ...text, description: "Identifies the check. Reuse it when the same check is run again." },
  kind: { ...text, enum: verificationKinds },
  summary: text,
  criteriaIds: { ...textList, description: "The acceptance criteria this check proves." },
  command: text,
  artifact: text,
  reason: { ...text, description: "Required unless result is pass." },
  residualRisk: { ...text, description: "Required unless result is pass." }
}

// The required lists match what readEvidence demands (tests check this).
export function verificationInputSchema(): JsonSchema {
  return objectSchema({ ...evidenceProperties, result: { ...text, enum: verificationResults } }, ["id", "kind", "result", "summary", "criteriaIds"])
}

export function blockedCheckInputSchema(): JsonSchema {
  return objectSchema(evidenceProperties, ["id", "kind", "summary", "criteriaIds", "reason", "residualRisk"])
}

function recordFindingInputSchema(): JsonSchema {
  return objectSchema(
    {
      id: text,
      severity: { ...text, enum: findingSeverities },
      confidence: { ...text, enum: findingConfidences },
      title: text,
      evidence: { ...textList, description: "File and line references, command output, or quoted requirements." },
      impact: text,
      recommendation: text,
      affectedRequirementIds: textList,
      disposition: {
        ...text,
        enum: findingDispositions,
        description: "Omit while the finding is open. accepted: addressed. rejected: needs dispositionReason. deferred and clarification-needed leave it open."
      },
      dispositionReason: text
    },
    ["id"]
  )
}
