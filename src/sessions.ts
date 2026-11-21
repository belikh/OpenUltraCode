import type { OpenCodePluginContext } from "./opencode-v2.js"

// Far deeper than opencode nests subagents; it only stops a malformed parent chain.
const maxDepth = 32

export interface SessionTree {
  /**
   * The top-level session a session descends from; a session without a parent is its own root.
   * Undefined when the ancestry cannot be determined.
   */
  readonly root: (sessionID: unknown) => Promise<string | undefined>
}

/** Resolves sessions to their top-level session through opencode (`ctx.session.get()`), remembering each answer. */
export function createSessionTree(ctx: Pick<OpenCodePluginContext, "session">): SessionTree {
  const roots = new Map<string, string>()

  return {
    async root(sessionID) {
      if (typeof sessionID !== "string" || sessionID.length === 0) return undefined

      const visited: string[] = []
      let current = sessionID
      try {
        while (!roots.has(current)) {
          if (visited.length >= maxDepth) return undefined
          visited.push(current)
          const { parentID } = await ctx.session.get({ sessionID: current })
          if (parentID === undefined) break
          current = parentID
        }
      } catch {
        // A session opencode cannot describe is not an error for the workflow; its ancestry is unknown.
        return undefined
      }

      const root = roots.get(current) ?? current
      for (const id of visited) roots.set(id, root)
      return root
    }
  }
}
