---
title: Choose fusion models
summary: Show and change the models of the two fusion panels and the decider.
order: 20
icon: sliders
audience: users
status: draft
---

`/ultracode-fusion` and `/ultrathink-fusion` send the task to two panel agents and a decider. Each of the three agents has its own model. The model you selected in opencode stays the [[term:Coordinator]].

## Show the models

```text title="In opencode"
/ultracode-fusion-models
```

The reply lists panel A, panel B and the decider.

## Change the models

Name the roles to change. A role you leave out keeps its model.

```text title="In opencode"
/ultracode-fusion-models --panel-a deepseek/deepseek-v4-pro --decider moonshotai/kimi-k3
```

opencode asks for permission before the agent files change. The next fusion run uses the new models.

A reference is `provider/model` or `provider/model#max`. `#max` selects the model's `max` variant and maximum reasoning. The tool refuses `#max` for a model that declares no `max` variant.

To see which references opencode offers, ask for the list:

```text title="In opencode"
Call open_ultracode_list_models.
```

## Fix a model that opencode does not offer

When a fusion command starts, the plugin checks each fusion model against the models opencode offers. If a provider, a model or a variant is missing, the prompt gets a line that starts with `OpenUltraCode fusion check:`. The model then names the problem, proposes a replacement from the same provider and asks you to confirm it. It changes nothing before you answer.

From a shell, the runtime check prints the same problems:

```sh title="Check the installed fusion models"
node ~/.local/share/open-ultracode/scripts/runtime-check.mjs --config-dir ~/.config/opencode
```

```text title="Output"
OpenUltraCode runtime check (static):
  coordinator      opencode default (no model configured)
  ultracode-fusion-panel-a  deepseek/deepseek-v4-pro   (/home/you/.config/opencode/agents/ultracode-fusion-panel-a.md)
  ultracode-fusion-panel-b  zai/glm-5.2   (/home/you/.config/opencode/agents/ultracode-fusion-panel-b.md)
  ultracode-fusion-arbiter  moonshotai/kimi-k3   (/home/you/.config/opencode/agents/ultracode-fusion-arbiter.md)
  result: OK
```

Add `--live` to send one small request to each fusion agent. This costs a few model calls.

:::see-also
- [[reference/commands]]
- [[reference/installers]]
:::
