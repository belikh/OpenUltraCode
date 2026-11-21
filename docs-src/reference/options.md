---
title: Plugin options
summary: Every option of the plugin entry in opencode.json, with its values and default.
order: 30
icon: settings
audience: users
status: stable
---

Set options on the plugin entry in `opencode.json`. Restart opencode after a change.

```json title="opencode.json"
{
  "plugins": [
    {
      "package": "/home/you/.local/share/open-ultracode/.opencode/plugins/open-ultracode",
      "options": {
        "verificationGate": "strict",
        "adversarialReview": "required",
        "highEffort": { "effort": "high", "outputTokens": 32000 }
      }
    }
  ]
}
```

## Options

| Option | Values | Default | Effect |
| --- | --- | --- | --- |
| `enabled` | `true`, `false` | `true` | `false` registers no hooks and no tools. |
| `verificationGate` | `strict`, `advisory`, `disabled` | `strict` | See the next table. |
| `adversarialReview` | `required`, `recommended`, `disabled` | `required` | What an open finding of high or medium severity does to the report. `required`: `blocked`. `recommended`: `partial`. `disabled`: nothing. |
| `highEffort.enabled` | `true`, `false` | `true` | Adds request hints to model calls of an open workflow. |
| `highEffort.effort` | `medium`, `high`, `xhigh` | `xhigh` | The strongest reasoning effort to ask for. |
| `highEffort.outputTokens` | integer from 1024 to 200000 | `64000` | The output token budget to ask for. |
| `state.directory` | a path inside the project | `.opencode/open-ultracode/state` | Where the workflow record is stored. |

A value outside these lists stops opencode from loading the plugin, with an error that names the option:

```text title="Error"
Invalid OpenUltraCode plugin options: verificationGate must be one of: strict, advisory, disabled
```

## Gate policies

| `verificationGate` | A report can be `verified` | A `partial` report ends the workflow |
| --- | --- | --- |
| `strict` | yes | no |
| `advisory` | yes | yes |
| `disabled` | no | yes |

## High-effort hints

The hints apply to model calls in the sessions of an open workflow. Other requests in the project are left unchanged.

- `maxTokens` is raised to `highEffort.outputTokens` and capped at the model's output limit.
- `reasoningEffort` is set to the strongest effort the model declares that does not exceed `highEffort.effort`. For a model that declares `low`, `high` and `max`, the setting `xhigh` sends `high`.
- A model that declares no variants, or that opencode does not list, gets no `reasoningEffort`.
- A stronger effort that opencode already set stays.

## State directory

`state.directory` is relative to the project root. The plugin refuses an absolute path, a path with `..` or a backslash, and a path through a symbolic link.

:::see-also
- [[concepts/completion-gate]]
- [[reference/workflow-record]]
- [[concepts/limits]]
:::
