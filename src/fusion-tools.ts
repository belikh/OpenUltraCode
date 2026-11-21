import { configureFusionModels, fusionModelReferencePattern } from "./fusion-config.js"
import { analyzeFusionModels, describeFusionModelIssue, type FusionModelIssue } from "./fusion-models.js"
import { isRecord } from "./input.js"
import type { ModelCatalog } from "./model-catalog.js"
import type { OpenCodePluginContext, ToolDefinition } from "./opencode-v2.js"

/** The tool name is also the permission action a user can allow, ask for, or deny. */
export const fusionPermissionAction = "open_ultracode_configure_fusion"

const fusionRoles = ["panelA", "panelB", "decider"] as const

/** Checks fusion references against opencode's live model list; nothing is judged while it is unavailable. */
export async function findFusionModelIssues(
  catalog: ModelCatalog,
  references: Readonly<Record<string, string>>
): Promise<FusionModelIssue[]> {
  const models = await catalog.list()
  return models === undefined ? [] : analyzeFusionModels(models, references)
}

export function createFusionTools(ctx: OpenCodePluginContext, catalog: ModelCatalog, projectDirectory: string): ToolDefinition[] {
  return [
    {
      name: "open_ultracode_list_models",
      description:
        "List the models opencode currently offers, grouped by provider, as fusion references (provider/model, plus provider/model#max where the model declares a max variant). Use it to pick a valid fallback when a fusion role's model or variant is unavailable.",
      input: {
        type: "object",
        properties: {
          provider: { type: "string", description: "Only list this provider's models, for example the provider of a failing fusion role." }
        },
        additionalProperties: false
      },
      execute: async (input) => {
        const provider = isRecord(input) && typeof input.provider === "string" ? input.provider : undefined
        const models = await catalog.list()
        if (models === undefined) {
          return json({ available: false, reason: "opencode's model list is unavailable right now." })
        }

        const providers: Record<string, Array<{ reference: string; variants: string[]; maxReference?: string }>> = {}
        for (const model of models) {
          if (provider !== undefined && model.providerID !== provider) continue
          const variants = (model.variants ?? []).map((variant) => variant.id)
          const reference = `${model.providerID}/${model.id}`
          ;(providers[model.providerID] ??= []).push({ reference, variants, ...(variants.includes("max") ? { maxReference: `${reference}#max` } : {}) })
        }
        return json({ available: true, providers })
      }
    },
    {
      name: fusionPermissionAction,
      description:
        "Read or update the persistent OpenUltraCode fusion panel A, panel B, and decider models. A reference ending in #max selects the model's max variant and maximum reasoning; a plain provider/model reference selects neither.",
      input: {
        type: "object",
        properties: {
          panelA: modelReference("Optional provider/model or provider/model#max reference for fusion panel A."),
          panelB: modelReference("Optional provider/model or provider/model#max reference for fusion panel B."),
          decider: modelReference("Optional provider/model or provider/model#max reference for the fusion decider.")
        },
        additionalProperties: false
      },
      execute: async (input, context) => {
        const request = isRecord(input) ? input : {}
        // Reading the configuration is free; rewriting agent files needs the user's approval.
        if (fusionRoles.some((role) => request[role] !== undefined)) {
          // Refuse a variant the model does not declare before asking or writing anything.
          const requested = Object.fromEntries(
            fusionRoles.flatMap((role) => (typeof request[role] === "string" ? [[role, request[role]]] : []))
          ) as Record<string, string>
          const issues = await findFusionModelIssues(catalog, requested)
          if (issues.length > 0) throw new TypeError(issues.map(describeFusionModelIssue).join(" "))
          // assert() prompts according to the session's rules and rejects when denied; the
          // rejection must propagate so opencode ends the step instead of reporting success.
          await ctx.permission.assert({
            sessionID: context.sessionID,
            agent: context.agent,
            action: fusionPermissionAction,
            resources: [projectDirectory],
            source: { type: "tool", messageID: context.messageID, id: context.id }
          })
        }
        return json(await configureFusionModels(projectDirectory, request))
      }
    }
  ]
}

function modelReference(description: string): Record<string, unknown> {
  return { type: "string", pattern: fusionModelReferencePattern.source, description }
}

function json(value: unknown): { content: string } {
  return { content: JSON.stringify(value, null, 2) }
}
