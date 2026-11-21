import { currentEvidence, isOpenFinding } from "./gate.js"
import type { WorkflowStateLoadResult } from "./state.js"
import type { DegradationNotice, Finding, VerificationEvidence } from "./types.js"

export const continuityHeading = "OpenUltraCode workflow continuity"

/**
 * The workflow summary that must survive a session compaction. It carries workflow state only:
 * model, provider, transcript, and unrelated project data stay out. Empty when there is nothing to carry.
 */
export function createCompactionContext(loaded: WorkflowStateLoadResult): string {
  const { state } = loaded
  const notices = [...(state?.degradations ?? []), ...loaded.degradations]
  if (state === undefined && notices.length === 0) {
    return ""
  }

  const lines = [continuityHeading]

  if (state !== undefined) {
    lines.push(`Mode: ${state.mode}`, `Phase: ${state.phase}`)
    if (state.goal !== undefined) lines.push(`Goal: ${state.goal}`)

    appendList(lines, "Constraints", state.constraints)
    appendList(lines, "Assumptions", state.assumptions)
    appendList(lines, "Open findings", state.findings.filter(isOpenFinding).map(formatFinding))
    appendList(lines, "Verification", currentEvidence(state.verification).map(formatEvidence))

    if (state.completion !== undefined) {
      lines.push(`Completion: ${state.completion.status} - ${state.completion.summary}`)
      appendList(lines, "Unresolved risks", state.completion.unresolvedRisks)
    }
  }

  appendList(lines, "Degradation notices", notices.map(formatNotice))

  return lines.join("\n")
}

function appendList(lines: string[], title: string, values: readonly string[]): void {
  if (values.length === 0) return
  lines.push(`${title}:`, ...values.map((value) => `- ${value}`))
}

function formatFinding(finding: Finding): string {
  return (
    `${finding.id} [${finding.severity}/${finding.confidence}] ${sentence(finding.title)} ` +
    `Status: ${sentence(finding.disposition ?? "open")} Impact: ${sentence(finding.impact)} ` +
    `Recommendation: ${sentence(finding.recommendation)} Evidence: ${finding.evidence.map(sentence).join(" ")}`
  )
}

function formatEvidence(evidence: VerificationEvidence): string {
  const reason = evidence.result === "pass" ? "" : ` Reason: ${sentence(evidence.reason)} Residual risk: ${sentence(evidence.residualRisk)}`
  const criteria = evidence.criteriaIds.length === 0 ? "" : ` Criteria: ${evidence.criteriaIds.join(", ")}.`
  return `${evidence.id} [${evidence.kind}:${evidence.result}] ${sentence(evidence.summary)}${reason}${criteria}`
}

function formatNotice(notice: DegradationNotice): string {
  return (
    `${notice.id} [${notice.severity}] ${notice.capability}: ${sentence(notice.reason)} ` +
    `${sentence(notice.userVisibleMessage)} Safe next action: ${sentence(notice.safeNextAction)}`
  )
}

function sentence(value: string): string {
  return /[.!?]$/u.test(value) ? value : `${value}.`
}
