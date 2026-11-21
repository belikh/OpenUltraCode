import type {
  AcceptanceCriterion,
  AdversarialPolicy,
  CompletionReport,
  CompletionStatus,
  Finding,
  GatePolicy,
  VerificationEvidence,
  VerificationResult
} from "./types.js"

export interface CompletionGateInput {
  readonly policy: GatePolicy
  /** How open adversarial findings affect completion. Defaults to "disabled": findings are listed only. */
  readonly reviewPolicy?: AdversarialPolicy
  readonly criteria: readonly AcceptanceCriterion[]
  readonly evidence: readonly VerificationEvidence[]
  readonly findings?: readonly Finding[]
  readonly assumptions?: readonly string[]
  /** The workflow produces findings or a recommendation, not a change; it can never be "verified". */
  readonly researchOnly?: boolean
}

/**
 * The evidence that counts: the latest record for each ID, in the order the IDs first appeared.
 * Rerunning a check under its ID replaces the earlier result; the state file keeps the history.
 */
export function currentEvidence(evidence: readonly VerificationEvidence[]): readonly VerificationEvidence[] {
  const latest = new Map<string, VerificationEvidence>()
  for (const item of evidence) latest.set(item.id, item)
  return [...latest.values()]
}

/**
 * Whether a completion report ends the workflow. A strict gate holds the workflow open until it
 * is verified; an advisory or disabled gate also lets a partial result stand. A failed or
 * blocked check always leaves work to do. Research ends with its report.
 */
export function endsWorkflow(status: CompletionStatus, policy: GatePolicy): boolean {
  if (status === "verified" || status === "research-only") return true
  return status === "partial" && policy !== "strict"
}

/** A finding stays open until it is accepted (and addressed) or rejected with a reason. */
export function isOpenFinding(finding: Finding): boolean {
  return finding.disposition !== "accepted" && finding.disposition !== "rejected"
}

/** Open findings of high or medium severity stand in the way of completion; low severity does not. */
function blocksCompletion(finding: Finding): boolean {
  return isOpenFinding(finding) && finding.severity !== "low"
}

export function evaluateCompletionGate(input: CompletionGateInput): CompletionReport {
  const evidence = currentEvidence(input.evidence)
  const findings = input.findings ?? []
  const reviewPolicy = input.reviewPolicy ?? "disabled"

  const criteria = input.criteria.map((criterion) => classifyCriterion(criterion, evidence))
  const applicable = criteria.filter((criterion) => criterion.status !== "not-applicable")
  const facts: GateFacts = {
    policy: input.policy,
    reviewPolicy,
    researchOnly: input.researchOnly === true,
    hasCriteria: applicable.length > 0,
    hasEvidence: evidence.length > 0,
    missing: applicable.filter((criterion) => criterion.status !== "verified"),
    failed: withResult(evidence, "fail"),
    blocked: withResult(evidence, "blocked"),
    notRun: withResult(evidence, "not-run"),
    openFindings: reviewPolicy === "disabled" ? [] : findings.filter(blocksCompletion)
  }
  const status = classify(facts)

  return {
    status,
    summary: summarize(status, facts),
    criteria,
    unresolvedRisks: collectRisks(evidence, facts),
    verificationIds: evidence.map((item) => item.id),
    findingIds: findings.map((finding) => finding.id),
    assumptions: input.assumptions ?? []
  }
}

interface GateFacts {
  readonly policy: GatePolicy
  readonly reviewPolicy: AdversarialPolicy
  readonly researchOnly: boolean
  readonly hasCriteria: boolean
  readonly hasEvidence: boolean
  readonly missing: readonly AcceptanceCriterion[]
  readonly failed: readonly VerificationEvidence[]
  readonly blocked: readonly VerificationEvidence[]
  readonly notRun: readonly VerificationEvidence[]
  readonly openFindings: readonly Finding[]
}

function classify(facts: GateFacts): CompletionStatus {
  if (facts.blocked.length > 0) return "blocked"
  if (facts.failed.length > 0) return "failed"
  if (facts.researchOnly) return "research-only"
  if (facts.policy === "disabled") return "partial"
  if (!facts.hasCriteria || facts.missing.length > 0 || facts.notRun.length > 0) return "partial"
  if (facts.openFindings.length > 0) return facts.reviewPolicy === "required" ? "blocked" : "partial"
  return "verified"
}

function classifyCriterion(criterion: AcceptanceCriterion, evidence: readonly VerificationEvidence[]): AcceptanceCriterion {
  if (criterion.status === "not-applicable") return criterion
  const passed = evidence.some((item) => item.result === "pass" && item.criteriaIds.includes(criterion.id))
  return { ...criterion, status: passed ? "verified" : "unverified" }
}

function withResult(evidence: readonly VerificationEvidence[], result: VerificationResult): readonly VerificationEvidence[] {
  return evidence.filter((item) => item.result === result)
}

const resultPhrases = { fail: "failed", blocked: "was blocked", "not-run": "was not run" } as const

function collectRisks(evidence: readonly VerificationEvidence[], facts: GateFacts): readonly string[] {
  const risks: string[] = []

  for (const criterion of facts.missing) {
    risks.push(`${criterion.id} is missing passing verification evidence. ${criterion.text}`)
  }

  for (const item of evidence) {
    if (item.result !== "pass") risks.push(`${item.id} ${resultPhrases[item.result]}: ${item.reason}`)
    if (item.residualRisk !== undefined) risks.push(item.residualRisk)
  }

  for (const finding of facts.openFindings) {
    risks.push(`${finding.id} remains open: ${finding.title}`)
  }

  if (facts.policy === "disabled" && !facts.hasEvidence) {
    risks.push("No verification evidence was collected because the gate is disabled.")
  } else if (!facts.hasCriteria) {
    risks.push(facts.hasEvidence ? "No acceptance criteria were provided." : "No acceptance criteria or verification evidence were provided.")
  }

  return [...new Set(risks)]
}

function summarize(status: CompletionStatus, facts: GateFacts): string {
  const missing = facts.hasCriteria
    ? facts.missing.map((criterion) => criterion.id)
    : [facts.hasEvidence ? "acceptance criteria" : "workflow verification"]
  const details = [
    detail("missing evidence", missing),
    detail("failed checks", ids(facts.failed)),
    detail("blocked checks", ids(facts.blocked)),
    detail("not-run checks", ids(facts.notRun)),
    detail("open findings", ids(facts.openFindings))
  ].filter((text) => text.length > 0)
  const suffix = details.length > 0 ? ` ${details.join(" ")}` : ""

  switch (status) {
    case "verified":
      return `Verified completion under ${facts.policy} verification policy.`
    case "research-only":
      return facts.policy === "disabled"
        ? `Research-only outcome; verification gate disabled and no completion verification was claimed.${suffix}`
        : `Research-only outcome; no completion verification was claimed.${suffix}`
    case "blocked":
      return `Blocked completion under ${facts.policy} verification policy.${suffix}`
    case "failed":
      return `Failed completion under ${facts.policy} verification policy.${suffix}`
    case "partial":
      return `Partial completion under ${facts.policy} verification policy; unresolved risks remain.${suffix}`
  }
}

function ids(items: ReadonlyArray<{ readonly id: string }>): readonly string[] {
  return items.map((item) => item.id)
}

function detail(label: string, values: readonly string[]): string {
  return values.length === 0 ? "" : `${label}: ${values.join(", ")}.`
}
