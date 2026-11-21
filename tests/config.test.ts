import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseOpenUltraCodeOptions } from "../src/index.js"

describe("OpenUltraCode configuration", () => {
  it("resolves missing options to documented safe defaults", () => {
    const parsed = parseOpenUltraCodeOptions(undefined)

    assert.deepEqual(parsed, {
      ok: true,
      value: {
        enabled: true,
        adversarialReview: "required",
        verificationGate: "strict",
        highEffort: {
          enabled: true,
          effort: "xhigh",
          outputTokens: 64000
        },
        state: {
          directory: ".opencode/open-ultracode/state"
        }
      }
    })
  })

  it("merges valid partial options without weakening unrelated defaults", () => {
    const parsed = parseOpenUltraCodeOptions({
      adversarialReview: "recommended",
      highEffort: {
        effort: "high"
      }
    })

    assert.equal(parsed.ok, true)
    assert.equal(parsed.value.adversarialReview, "recommended")
    assert.equal(parsed.value.verificationGate, "strict")
    assert.deepEqual(parsed.value.highEffort, {
      enabled: true,
      effort: "high",
      outputTokens: 64000
    })
    assert.deepEqual(parsed.value.state, { directory: ".opencode/open-ultracode/state" })
  })

  it("turns disabled mode into an inert configuration", () => {
    const parsed = parseOpenUltraCodeOptions({
      enabled: false,
      adversarialReview: "required",
      verificationGate: "strict",
      highEffort: {
        enabled: true,
        effort: "xhigh",
        outputTokens: 64000
      }
    })

    assert.equal(parsed.ok, true)
    assert.equal(parsed.value.enabled, false)
    assert.equal(parsed.value.adversarialReview, "disabled")
    assert.equal(parsed.value.verificationGate, "disabled")
    assert.deepEqual(parsed.value.highEffort, {
      enabled: false,
      effort: "xhigh"
    })
  })

  it("returns actionable errors for invalid options", () => {
    const parsed = parseOpenUltraCodeOptions({
      enabled: "yes",
      adversarialReview: "always",
      verificationGate: "hard",
      highEffort: {
        outputTokens: 0
      },
      state: {
        directory: "../outside"
      }
    })

    assert.equal(parsed.ok, false)
    assert.deepEqual(parsed.errors, [
      "enabled must be a boolean when provided",
      "adversarialReview must be one of: required, recommended, disabled",
      "verificationGate must be one of: strict, advisory, disabled",
      "highEffort.outputTokens must be an integer between 1024 and 200000 when provided",
      "state.directory must be a project-relative path and must not contain '..' segments"
    ])
  })

  it("returns actionable errors for malformed option sections", () => {
    const malformedOptions: unknown = {
      highEffort: true,
      state: "outside"
    }

    const parsed = parseOpenUltraCodeOptions(malformedOptions)

    assert.equal(parsed.ok, false)
    assert.deepEqual(parsed.errors, [
      "highEffort must be an object when provided",
      "state must be an object when provided"
    ])
  })

  it("rejects options that are not an object", () => {
    const parsed = parseOpenUltraCodeOptions("strict")

    assert.equal(parsed.ok, false)
    assert.deepEqual(parsed.errors, ["options must be an object when provided"])
  })
})
