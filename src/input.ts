/** Readers for untrusted values: tool input from the model, plugin options, and state read from disk. */

const invalidInputPrefix = "Invalid input: "

/**
 * Input the caller can correct and send again. The message carries a fixed prefix because a
 * tool error reaches the plugin's hooks as text only.
 */
export class InvalidInputError extends TypeError {
  constructor(problem: string) {
    super(`${invalidInputPrefix}${problem}`)
    this.name = "InvalidInputError"
  }
}

export function isInvalidInputMessage(message: string): boolean {
  return message.startsWith(invalidInputPrefix)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function readRecord(value: unknown, name = "tool input"): Record<string, unknown> {
  if (isRecord(value)) return value
  throw new InvalidInputError(`${name} must be an object`)
}

export function readText(value: unknown, name: string): string {
  if (typeof value === "string" && value.trim().length > 0) return value.trim()
  throw new InvalidInputError(`${name} must be a non-empty string`)
}

export function readTextList(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value)) throw new InvalidInputError(`${name} must be an array of non-empty strings`)
  return value.map((item, index) => readText(item, `${name}[${index}]`))
}

export function readOneOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value === "string" && allowed.includes(value as T)) return value as T
  throw new InvalidInputError(`${name} must be one of: ${allowed.join(", ")}`)
}

/** Reads `record[key]` with `read` when the key is present, as an object to spread into a result. */
export function readOptional<K extends string, T>(
  record: Record<string, unknown>,
  key: K,
  read: (value: unknown, name: string) => T
): Partial<Record<K, T>> {
  return record[key] === undefined ? {} : ({ [key]: read(record[key], key) } as Partial<Record<K, T>>)
}

/** A path that stays inside the project: relative, forward slashes only, no `..` segment. */
export function isProjectRelativePath(value: string): boolean {
  return value.length > 0 && !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..")
}
