import type { ModelLimits } from "./high-effort.js"
import type { ModelInfoSummary, ModelRef, OpenCodePluginContext } from "./opencode-v2.js"

const modelListTtlMs = 60_000

export interface ModelCatalog {
  /** All models opencode currently offers; undefined when the list is unavailable. */
  readonly list: () => Promise<readonly ModelInfoSummary[] | undefined>
  /** Output limit and declared variants of a model; empty when opencode does not list it. */
  readonly limits: (model: ModelRef) => Promise<ModelLimits>
}

/** opencode's model list (`ctx.model.list()`), cached for a minute and shared by all hooks and tools. */
export function createModelCatalog(ctx: OpenCodePluginContext): ModelCatalog {
  let cache: { readonly models: readonly ModelInfoSummary[]; readonly loadedAt: number } | undefined

  const list = async () => {
    try {
      if (cache === undefined || Date.now() - cache.loadedAt > modelListTtlMs) {
        cache = { models: (await ctx.model.list()).data, loadedAt: Date.now() }
      }
      return cache.models
    } catch (error) {
      console.error(`OpenUltraCode: model lookup failed: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }

  return {
    list,
    async limits(model) {
      const info = (await list())?.find((entry) => entry.providerID === model.providerID && (entry.id === model.id || entry.modelID === model.id))
      if (info === undefined) return {}
      return {
        ...(info.limit?.output === undefined ? {} : { outputTokens: info.limit.output }),
        variants: (info.variants ?? []).map((variant) => variant.id)
      }
    }
  }
}
