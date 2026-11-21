---
title: Completion gate
summary: The rules that turn criteria, evidence and findings into one status, and what ends a workflow.
order: 20
icon: gate
audience: users
status: stable
---

The [[term:Completion gate]] is a function of the [[term:Workflow record]]. `open_ultracode_completion_report` runs it. The model reports the gate's status and does not judge completion itself.

## Rules

The gate applies these rules in order and returns the first status that fits:

| Order | Condition | Status |
| --- | --- | --- |
| 1 | The latest result of a check is `blocked`. | `blocked` |
| 2 | The latest result of a check is `fail`. | `failed` |
| 3 | The workflow is in a [[term:Research mode]], or the call sets `researchOnly`. | `research-only` |
| 4 | `verificationGate` is `disabled`. | `partial` |
| 5 | There is no criterion, a criterion has no passing check, or a check has the result `not-run`. | `partial` |
| 6 | A [[term:Finding]] of high or medium severity is open. | `blocked` with `adversarialReview: required`, `partial` with `recommended` |
| 7 | None of the above. | `verified` |

A check proves a criterion when its result is `pass` and its `criteriaIds` contain the criterion's ID.

## Evidence

Each check has an `id`. The gate uses the latest record of each `id`. A check that failed and then passes under the same `id` no longer holds the gate. A check that passed and then fails does.

The record keeps every result, so the history of a check stays readable.

## Findings

A finding is open until it is `accepted` or `rejected`:

| Disposition | Meaning | Open |
| --- | --- | --- |
| none | Reported and not yet decided. | yes |
| `accepted` | The finding was real and has been addressed. | no |
| `rejected` | The finding does not hold. The tool requires a reason. | no |
| `deferred` | Decided for later. | yes |
| `clarification-needed` | Waiting for an answer. | yes |

Findings of low severity never hold the gate. With `adversarialReview: disabled` the report lists findings and they do not change the status.

## End of a workflow

A workflow ends when a completion report has one of these statuses:

| Status | `verificationGate: strict` | `advisory` or `disabled` |
| --- | --- | --- |
| `verified` | ends | ends |
| `research-only` | ends | ends |
| `partial` | stays open | ends |
| `failed`, `blocked` | stays open | stays open |

Setting the phase to `completed` with `open_ultracode_record_intake` also ends it. After the end, the next command starts an empty record, and the high-effort hints stop.

## Differences from upstream 2.0.1

- The upstream gate did not read findings. A report could be `verified` with an open finding of high severity.
- Evidence could not be replaced. One `fail` record kept the status at `failed` after the check passed.
- Research workflows reported `partial`.
- `advisory` behaved like `strict`.

:::see-also
- [[reference/tools]]
- [[reference/options]]
:::
