---
title: Tools
summary: The eight tools the plugin adds to opencode, with their inputs and results.
order: 20
icon: code
audience: agents
status: stable
---

The model calls these tools during a workflow. Five of them change the [[term:Workflow record]]. They work only in the session that started the workflow and in its subagents.

A tool that cannot record answers with `"recorded": false` and a `reason`. A workflow tool that gets wrong input fails with an error that starts with `Invalid input:`. That error does not block the workflow: correct the input and call the tool again.

## open_ultracode_status

Reads the record. It takes no input.

| Field | Meaning |
| --- | --- |
| `active` | `true` while the workflow is open. `false` when no record exists or the workflow has ended. |
| `ownedByThisSession` | `false` when another session started the workflow. |
| `mode`, `phase`, `goal` | From the record. |
| `openFindings` | IDs of findings that are not yet accepted or rejected. |
| `verification` | The latest result of each check, as `id:result`. |
| `completion` | The last completion report, if one exists. |
| `degradations`, `degradationDetails` | Notices about reduced capabilities. |

## open_ultracode_record_intake

Sets the goal, the constraints, the assumptions and the acceptance criteria, and moves the phase. Every field is optional.

| Field | Type | Meaning |
| --- | --- | --- |
| `goal` | string | The goal a user can observe. |
| `constraints` | list of strings | Replaces the list. |
| `assumptions` | list of strings | Replaces the list. |
| `criteria` | list of `{ id, text, source }` | Adds criteria. A criterion with an existing `id` replaces the old one. `source` is `user`, `spec` or `inferred`. Default: `user`. |
| `phase` | string | One of `idle`, `intake`, `planning`, `execution`, `research`, `adversarial-review`, `reconciliation`, `verification`, `remediation`, `completed`. |
| `adopt` | boolean | `true` makes this session the owner of a record that another session started. |

Result: `{ "recorded": true, "phase": "...", "criteriaIds": ["AC-1"] }`.

To resume a workflow whose phase is `blocked`, set a phase. To end a workflow, set the phase to `completed`.

## open_ultracode_record_finding

Records a [[term:Finding]], or changes one. To change a finding, send its `id` and the fields that change.

| Field | Type | Required for a new finding | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | For example `F-1`. |
| `severity` | `high`, `medium`, `low` | yes | High and medium findings hold the gate while open. |
| `confidence` | `high`, `medium`, `low` | yes | How sure the reviewer is. |
| `title` | string | yes | What is wrong. |
| `evidence` | list of strings | yes | File and line references, command output or quoted requirements. |
| `impact` | string | yes | What breaks, and for whom. |
| `recommendation` | string | yes | The fix or the question. |
| `affectedRequirementIds` | list of strings | no | Criterion IDs. |
| `disposition` | `accepted`, `rejected`, `clarification-needed`, `deferred` | no | Leave it out while the finding is open. |
| `dispositionReason` | string | with `rejected` | Why. A new disposition does not keep the old reason. |

Result: `{ "recorded": true, "findingId": "F-1", "open": true }`. A finding is open until its disposition is `accepted` or `rejected`.

## open_ultracode_record_verification

Records the result of one check. A second record with the same `id` replaces the first in the gate. The file keeps both.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Names the check. Use it again when you run the check again. |
| `kind` | `test`, `build`, `lint`, `typecheck`, `audit`, `manual`, `artifact` | yes | The kind of check. |
| `result` | `pass`, `fail`, `not-run`, `blocked` | yes | The outcome. |
| `summary` | string | yes | What was checked. |
| `criteriaIds` | list of strings | yes | The criteria this check proves. The list can be empty. |
| `command` | string | no | The command that produced the result. |
| `artifact` | string | no | A path or URL. |
| `reason` | string | unless `result` is `pass` | Why the check did not pass. |
| `residualRisk` | string | unless `result` is `pass` | What stays at risk. |

Result: `{ "recorded": true, "evidenceId": "VE-1" }`.

## open_ultracode_record_blocked_check

Records a check that could not run. It takes the fields of `open_ultracode_record_verification` without `result`, and stores the result `blocked`. `reason` and `residualRisk` are required.

## open_ultracode_completion_report

Runs the [[term:Completion gate]] over the record, stores the report and returns it.

| Field | Type | Meaning |
| --- | --- | --- |
| `researchOnly` | boolean | `true` reports `research-only` in place of `verified`. The research modes set it themselves. |

| Result field | Meaning |
| --- | --- |
| `status` | `verified`, `partial`, `blocked`, `failed` or `research-only`. |
| `summary` | One sentence with the policy and the IDs that hold the gate. |
| `criteria` | Each criterion with the status `verified`, `unverified` or `not-applicable`. |
| `unresolvedRisks` | What stands in the way, one entry each. |
| `verificationIds`, `findingIds`, `assumptions` | From the record. |

A session that does not own the record gets the report of an empty record, with the status `partial`.

## open_ultracode_list_models

Lists the models opencode offers, grouped by provider. Each entry has the `reference`, its `variants`, and a `maxReference` when the model declares a `max` variant.

| Field | Type | Meaning |
| --- | --- | --- |
| `provider` | string | Lists the models of this provider only. |

## open_ultracode_configure_fusion

Reads or changes the models of the three fusion agents. With no input it returns the current models. A change asks you for permission.

| Field | Type | Meaning |
| --- | --- | --- |
| `panelA` | `provider/model` or `provider/model#max` | The model of fusion panel A. |
| `panelB` | same | The model of fusion panel B. |
| `decider` | same | The model of the decider. |

The tool refuses a model or a variant that opencode does not offer and names the variants the model declares.

:::see-also
- [[reference/workflow-record]]
- [[concepts/completion-gate]]
:::
