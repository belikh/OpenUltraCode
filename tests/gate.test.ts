import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { currentEvidence, evaluateCompletionGate, type AcceptanceCriterion, type Finding, type VerificationEvidence } from "../src/index.js"

const criteria: readonly AcceptanceCriterion[] = [
  {
    id: "AC-1",
    text: "Implementation has tests.",
    source: "spec",
    status: "pending"
  },
  {
    id: "AC-2",
    text: "Completion report maps evidence to criteria.",
    source: "spec",
    status: "pending"
  }
]

describe("verification completion gates", () => {
  it("verifies strict completion only when every applicable criterion has passing evidence", () => {
    const report = evaluateCompletionGate({
      policy: "strict",
      criteria,
      evidence: [passingEvidence("VE-1", ["AC-1"]), passingEvidence("VE-2", ["AC-2"])],
      assumptions: ["Tests exercise the public export."],
      findings: [finding({ id: "F-1", disposition: "accepted" })]
    })

    assert.equal(report.status, "verified")
    assert.match(report.summary, /verified/i)
    assert.deepEqual(
      report.criteria.map((criterion) => criterion.status),
      ["verified", "verified"]
    )
    assert.deepEqual(report.unresolvedRisks, [])
    assert.deepEqual(report.verificationIds, ["VE-1", "VE-2"])
    assert.deepEqual(report.findingIds, ["F-1"])
    assert.deepEqual(report.assumptions, ["Tests exercise the public export."])
  })

  it("keeps strict completion partial when required evidence is missing or skipped", () => {
    const report = evaluateCompletionGate({
      policy: "strict",
      criteria,
      evidence: [
        passingEvidence("VE-1", ["AC-1"]),
        {
          id: "VE-2",
          kind: "test",
          result: "not-run",
          summary: "Asset validation was skipped.",
          command: "npm run validate:assets",
          criteriaIds: ["AC-2"],
          reason: "Command was not run in this environment.",
          residualRisk: "Prompt assets may not match the workflow contract."
        }
      ]
    })

    assert.equal(report.status, "partial")
    assert.match(report.summary, /missing evidence/i)
    assert.match(report.summary, /not-run checks: VE-2/i)
    assert.deepEqual(
      report.criteria.map((criterion) => criterion.status),
      ["verified", "unverified"]
    )
    assert.deepEqual(report.verificationIds, ["VE-1", "VE-2"])
    assert(report.unresolvedRisks.some((risk) => risk.includes("AC-2 is missing passing verification evidence.")))
    assert(report.unresolvedRisks.some((risk) => risk.includes("VE-2 was not run: Command was not run in this environment.")))
    assert(report.unresolvedRisks.some((risk) => risk.includes("Prompt assets may not match the workflow contract.")))
  })

  it("does not verify strict completion when no criteria or evidence were provided", () => {
    const report = evaluateCompletionGate({
      policy: "strict",
      criteria: [],
      evidence: []
    })

    assert.equal(report.status, "partial")
    assert.match(report.summary, /missing evidence/i)
    assert(report.unresolvedRisks.some((risk) => risk.includes("No acceptance criteria or verification evidence were provided.")))
  })

  it("does not verify strict completion when evidence is not tied to acceptance criteria", () => {
    const report = evaluateCompletionGate({
      policy: "strict",
      criteria: [],
      evidence: [passingEvidence("VE-1", [])]
    })

    assert.equal(report.status, "partial")
    assert.match(report.summary, /missing evidence/i)
    assert(report.unresolvedRisks.some((risk) => risk.includes("No acceptance criteria were provided.")))
  })

  it("reports failed and blocked outcomes without overclaiming completion", () => {
    const failed = evaluateCompletionGate({
      policy: "strict",
      criteria,
      evidence: [
        passingEvidence("VE-1", ["AC-1"]),
        {
          id: "VE-2",
          kind: "test",
          result: "fail",
          summary: "Unit tests failed.",
          command: "npm test",
          criteriaIds: ["AC-2"],
          reason: "Assertion failed.",
          residualRisk: "The completion report may misclassify failed evidence."
        }
      ]
    })
    const blocked = evaluateCompletionGate({
      policy: "advisory",
      criteria,
      evidence: [
        {
          id: "VE-3",
          kind: "audit",
          result: "blocked",
          summary: "Audit command was blocked.",
          command: "npm audit --audit-level=high",
          criteriaIds: ["AC-1", "AC-2"],
          reason: "Network access was denied.",
          residualRisk: "High-severity dependency issues may be unknown."
        }
      ]
    })

    assert.equal(failed.status, "failed")
    assert.match(failed.summary, /failed checks: VE-2/i)
    assert.notEqual(failed.status, "verified")
    assert(failed.unresolvedRisks.some((risk) => risk.includes("VE-2 failed: Assertion failed.")))

    assert.equal(blocked.status, "blocked")
    assert.match(blocked.summary, /blocked checks: VE-3/i)
    assert.notEqual(blocked.status, "verified")
    assert(blocked.unresolvedRisks.some((risk) => risk.includes("VE-3 was blocked: Network access was denied.")))
  })

  it("allows advisory partial completion while recording unresolved risks", () => {
    const report = evaluateCompletionGate({
      policy: "advisory",
      criteria,
      evidence: [passingEvidence("VE-1", ["AC-1"])],
      assumptions: ["Manual review will cover the remaining criterion."]
    })

    assert.equal(report.status, "partial")
    assert.match(report.summary, /advisory/i)
    assert(report.unresolvedRisks.some((risk) => risk.includes("AC-2 is missing passing verification evidence.")))
    assert.deepEqual(report.assumptions, ["Manual review will cover the remaining criterion."])
  })

  it("reports disabled gates as research-only without pretending verification ran", () => {
    const report = evaluateCompletionGate({
      policy: "disabled",
      criteria: [],
      evidence: [],
      researchOnly: true,
      assumptions: ["No file-changing workflow was requested."]
    })

    assert.equal(report.status, "research-only")
    assert.match(report.summary, /verification gate disabled/i)
    assert.deepEqual(report.criteria, [])
    assert.deepEqual(report.verificationIds, [])
    assert(report.unresolvedRisks.some((risk) => risk.includes("No verification evidence was collected because the gate is disabled.")))
  })

  it("lets a rerun under the same id replace the earlier result of that check", () => {
    const failedFirst: VerificationEvidence = {
      id: "VE-2",
      kind: "test",
      result: "fail",
      summary: "Unit tests failed.",
      criteriaIds: ["AC-2"],
      reason: "Assertion failed.",
      residualRisk: "AC-2 is unproven."
    }
    const evidence = [passingEvidence("VE-1", ["AC-1"]), failedFirst, passingEvidence("VE-2", ["AC-2"])]

    const report = evaluateCompletionGate({ policy: "strict", criteria, evidence })

    assert.equal(report.status, "verified")
    assert.deepEqual(report.verificationIds, ["VE-1", "VE-2"])
    assert.deepEqual(report.unresolvedRisks, [])
    assert.deepEqual(currentEvidence(evidence).map((item) => `${item.id}:${item.result}`), ["VE-1:pass", "VE-2:pass"])

    // The latest result counts in both directions: a check that passed and now fails is a failure.
    const regressed = evaluateCompletionGate({ policy: "strict", criteria, evidence: [...evidence, failedFirst] })
    assert.equal(regressed.status, "failed")
  })

  it("holds back completion while a high- or medium-severity finding is open", () => {
    const evidence = [passingEvidence("VE-1", ["AC-1"]), passingEvidence("VE-2", ["AC-2"])]
    const gate = (reviewPolicy: "required" | "recommended" | "disabled", findings: readonly Finding[]) =>
      evaluateCompletionGate({ policy: "strict", reviewPolicy, criteria, evidence, findings })

    const required = gate("required", [finding({ id: "F-1", severity: "medium" })])
    assert.equal(required.status, "blocked")
    assert.match(required.summary, /open findings: F-1/i)
    assert(required.unresolvedRisks.includes("F-1 remains open: Completion is claimed without evidence"))

    assert.equal(gate("recommended", [finding({ id: "F-1" })]).status, "partial")
    assert.equal(gate("disabled", [finding({ id: "F-1" })]).status, "verified")

    // Deferring a finding or asking for clarification does not close it.
    assert.equal(gate("required", [finding({ id: "F-1", disposition: "deferred" })]).status, "blocked")
    assert.equal(gate("required", [finding({ id: "F-1", disposition: "clarification-needed" })]).status, "blocked")
  })

  it("verifies once findings are accepted, rejected with a reason, or only low severity", () => {
    const report = evaluateCompletionGate({
      policy: "strict",
      reviewPolicy: "required",
      criteria,
      evidence: [passingEvidence("VE-1", ["AC-1"]), passingEvidence("VE-2", ["AC-2"])],
      findings: [
        finding({ id: "F-1", disposition: "accepted" }),
        finding({ id: "F-2", disposition: "rejected", dispositionReason: "The test exercises the changed branch." }),
        finding({ id: "F-3", severity: "low" })
      ]
    })

    assert.equal(report.status, "verified")
    assert.deepEqual(report.findingIds, ["F-1", "F-2", "F-3"])
  })

  it("never reports a research workflow as verified, and still reports its failed checks", () => {
    const research = evaluateCompletionGate({
      policy: "strict",
      criteria,
      evidence: [passingEvidence("VE-1", ["AC-1"]), passingEvidence("VE-2", ["AC-2"])],
      researchOnly: true
    })
    assert.equal(research.status, "research-only")
    assert.match(research.summary, /no completion verification was claimed/i)

    const blocked = evaluateCompletionGate({
      policy: "strict",
      criteria: [],
      evidence: [
        {
          id: "VE-3",
          kind: "audit",
          result: "blocked",
          summary: "Source could not be fetched.",
          criteriaIds: [],
          reason: "Network access was denied.",
          residualRisk: "The claim is unchecked."
        }
      ],
      researchOnly: true
    })
    assert.equal(blocked.status, "blocked")
  })
})

function finding(overrides: Partial<Finding> & Pick<Finding, "id">): Finding {
  return {
    severity: "high",
    confidence: "high",
    title: "Completion is claimed without evidence",
    evidence: ["src/report.ts:12 returns verified before any check ran."],
    impact: "A failing change could be reported as done.",
    recommendation: "Run the check before reporting.",
    ...overrides
  } as Finding
}

function passingEvidence(id: string, criteriaIds: readonly string[]): VerificationEvidence {
  return {
    id,
    kind: "test",
    result: "pass",
    summary: `${id} passed.`,
    command: "npm test",
    criteriaIds
  }
}
