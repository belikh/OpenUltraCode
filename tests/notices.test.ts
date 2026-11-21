import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  createCorruptStateNotice,
  createFailedPhaseNotice,
  createPermissionDeniedNotice,
  createToolErrorNotice,
  createUnsupportedCapabilityNotice,
  withNotice
} from "../src/index.js"

const occurredAt = "2026-06-15T19:00:00.000Z"

describe("degradation notices", () => {
  it("creates deterministic user-facing notices with safe next actions", () => {
    const notices = [
      createUnsupportedCapabilityNotice({
        capability: "compaction hook",
        reason: "opencode did not expose the hook in this runtime",
        phase: "planning",
        occurredAt
      }),
      createFailedPhaseNotice({ phase: "verification", reason: "npm test failed", occurredAt }),
      createToolErrorNotice({ tool: "webfetch", phase: "research", reason: "request timed out", occurredAt }),
      createPermissionDeniedNotice({
        operation: "write src/index.ts",
        reason: "file edit was denied by opencode permissions",
        phase: "execution",
        occurredAt
      }),
      createCorruptStateNotice({ reason: "Unexpected token", occurredAt })
    ]

    assert.deepEqual(
      notices.map(({ id, capability, severity, reason, phase }) => ({ id, capability, severity, reason, phase })),
      [
        {
          id: "unsupported-compaction-hook",
          capability: "compaction hook",
          severity: "warning",
          reason: "opencode did not expose the hook in this runtime",
          phase: "planning"
        },
        {
          id: "phase-verification-failed",
          capability: "workflow phase verification",
          severity: "blocked",
          reason: "npm test failed",
          phase: "verification"
        },
        { id: "tool-error-webfetch", capability: "tool webfetch", severity: "warning", reason: "request timed out", phase: "research" },
        {
          id: "permission-denied-write-src-index-ts",
          capability: "permission for write src/index.ts",
          severity: "blocked",
          reason: "file edit was denied by opencode permissions",
          phase: "execution"
        },
        {
          id: "workflow-state-corrupt",
          capability: "workflow state persistence",
          severity: "warning",
          reason: "Unexpected token",
          phase: undefined
        }
      ]
    )

    for (const notice of notices) {
      assert.equal(notice.occurredAt, occurredAt)
      assert.notEqual(notice.userVisibleMessage, "")
      assert.notEqual(notice.safeNextAction, "")
      assert.doesNotMatch(`${notice.userVisibleMessage} ${notice.safeNextAction}`, /hidden reasoning|chain-of-thought|bypass/i)
    }
  })

  it("tells the user to respect a permission denial instead of working around it", () => {
    const notice = createPermissionDeniedNotice({ operation: "bash rm -rf build", reason: "denied by rule", occurredAt })

    assert.match(notice.safeNextAction, /Respect the permission denial/)
    assert.match(notice.safeNextAction, /ask the user to approve bash rm -rf build/)
  })

  it("builds stable ids from any capability or operation text", () => {
    const id = (capability: string) => createUnsupportedCapabilityNotice({ capability, reason: "unavailable", occurredAt }).id

    assert.equal(id("  Fusion Panel A model  "), "unsupported-fusion-panel-a-model")
    assert.equal(id("a//b__c"), "unsupported-a-b-c")
    assert.equal(id("???"), "unsupported-unknown")
  })

  it("stamps the current time when none is given", () => {
    const before = Date.now()
    const notice = createFailedPhaseNotice({ phase: "execution", reason: "tool crashed" })

    assert(Date.parse(notice.occurredAt) >= before)
  })

  it("replaces an earlier notice with the same id instead of piling up", () => {
    const first = createToolErrorNotice({ tool: "grep", phase: "execution", reason: "first failure", occurredAt })
    const other = createToolErrorNotice({ tool: "read", phase: "execution", reason: "missing file", occurredAt })
    const second = createToolErrorNotice({ tool: "grep", phase: "verification", reason: "second failure", occurredAt })

    assert.deepEqual(withNotice(withNotice([first], other), second), [other, second])
  })
})
