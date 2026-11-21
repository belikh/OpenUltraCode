import { isProjectRelativePath, isRecord } from "./input.js"
import { adversarialPolicies, gatePolicies, highEffortLevels, type OpenUltraCodeOptions } from "./types.js"

const defaultOptions: OpenUltraCodeOptions = {
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

export type OpenUltraCodeOptionsInput = {
  readonly enabled?: unknown
  readonly adversarialReview?: unknown
  readonly verificationGate?: unknown
  readonly highEffort?: {
    readonly enabled?: unknown
    readonly effort?: unknown
    readonly outputTokens?: unknown
  }
  readonly state?: {
    readonly directory?: unknown
  }
}

export type OpenUltraCodeConfigResult =
  | { readonly ok: true; readonly value: OpenUltraCodeOptions }
  | { readonly ok: false; readonly errors: readonly string[] }

/** Validates plugin options and fills in defaults. Every problem is reported, not only the first. */
export function parseOpenUltraCodeOptions(input: unknown): OpenUltraCodeConfigResult {
  const errors: string[] = []
  const options = readSection(input, "options", errors)
  const highEffort = readSection(options.highEffort, "highEffort", errors)
  const state = readSection(options.state, "state", errors)

  const enabled = readBoolean(options.enabled, defaultOptions.enabled, "enabled", errors)
  const adversarialReview = readEnum(options.adversarialReview, defaultOptions.adversarialReview, adversarialPolicies, "adversarialReview", errors)
  const verificationGate = readEnum(options.verificationGate, defaultOptions.verificationGate, gatePolicies, "verificationGate", errors)
  const highEffortEnabled = readBoolean(highEffort.enabled, defaultOptions.highEffort.enabled, "highEffort.enabled", errors)
  const effort = readEnum(highEffort.effort, defaultOptions.highEffort.effort, highEffortLevels, "highEffort.effort", errors)
  const outputTokens = readOutputTokens(highEffort.outputTokens, errors)
  const directory = readStateDirectory(state.directory, errors)

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  // A disabled plugin registers nothing, so every dependent behavior is reported as off.
  if (!enabled) {
    return {
      ok: true,
      value: {
        enabled: false,
        adversarialReview: "disabled",
        verificationGate: "disabled",
        highEffort: { enabled: false, effort },
        state: { directory }
      }
    }
  }

  return {
    ok: true,
    value: {
      enabled,
      adversarialReview,
      verificationGate,
      highEffort: { enabled: highEffortEnabled, effort, ...(outputTokens === undefined ? {} : { outputTokens }) },
      state: { directory }
    }
  }
}

function readSection(value: unknown, name: string, errors: string[]): Record<string, unknown> {
  if (value === undefined) return {}
  if (isRecord(value)) return value
  errors.push(`${name} must be an object when provided`)
  return {}
}

function readBoolean(value: unknown, fallback: boolean, name: string, errors: string[]): boolean {
  if (value === undefined) return fallback
  if (typeof value === "boolean") return value
  errors.push(`${name} must be a boolean when provided`)
  return fallback
}

function readEnum<T extends string>(value: unknown, fallback: T, allowed: readonly T[], name: string, errors: string[]): T {
  if (value === undefined) return fallback
  if (typeof value === "string" && allowed.includes(value as T)) return value as T
  errors.push(`${name} must be one of: ${allowed.join(", ")}`)
  return fallback
}

function readOutputTokens(value: unknown, errors: string[]): number | undefined {
  if (value === undefined) return defaultOptions.highEffort.outputTokens
  if (typeof value === "number" && Number.isInteger(value) && value >= 1024 && value <= 200000) return value
  errors.push("highEffort.outputTokens must be an integer between 1024 and 200000 when provided")
  return undefined
}

function readStateDirectory(value: unknown, errors: string[]): string {
  if (value === undefined) return defaultOptions.state.directory
  if (typeof value === "string" && isProjectRelativePath(value)) return value
  errors.push("state.directory must be a project-relative path and must not contain '..' segments")
  return defaultOptions.state.directory
}
