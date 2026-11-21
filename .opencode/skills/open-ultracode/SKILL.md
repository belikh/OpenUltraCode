---
name: open-ultracode
description: Use when a /ultracode, /ultracode-debug, /ultracode-spec-audit, /ultracode-research, /ultracode-verify, /ultracode-fusion or /ultrathink command is running, or when the user asks by name for OpenUltraCode or an ultracode-style workflow (plan, implement, adversarial review, reconcile, verify with recorded evidence). Not for work that another pipeline already gates, and not for ordinary small edits.
---

# OpenUltraCode

OpenUltraCode is a workflow discipline for opencode: state the acceptance criteria, do the scoped work, attack the result, then prove each criterion with fresh evidence. It runs on the selected model in opencode. It adds no proxy, no synthetic model ID and no provider route, and you must not switch models. The only exception is a fusion command, whose panel agents carry their own configured models.

## When this skill applies

Use it when one of the ultracode or ultrathink commands started the turn, or the user asked for this workflow by name.

Do not use it, and do not call the `open_ultracode_*` tools, when:

- You are a subagent or a step inside another pipeline that has its own gate. That pipeline's gate is the authority. Evidence recorded here from such a step lands in whatever workflow the directory last held and blocks it.
- The task is a small edit with an obvious check. Make the change, run the check, report.

## Scale the workflow to the task

| Task | What to run |
| --- | --- |
| One file, clear criteria, low risk | Simple-task shortcut: state the assumption and the criterion, make the smallest change, run the one relevant check, report. No subagents. Keep proportional verification: the check must still exercise the change. |
| Several files or behaviour changes, criteria mostly clear | Full phases in the main session. Dispatch the adversary and the verifier as subagents; do the other roles yourself. |
| Large, risky or underspecified | Full phases with every role dispatched, and a spec-audit pass before any implementation. |

If the user typed an ultracode command, run at least the second row.

## Commands and modes

| Command | Mode in state | Edits code | Ends with |
| --- | --- | --- | --- |
| `/ultracode` | `build` (labelled "comprehensive") | yes | gate result |
| `/ultracode-debug` | `debug` | yes | gate result |
| `/ultracode-verify` | `verify` | no | gate result |
| `/ultracode-spec-audit` | `spec-audit` | no | findings, status `research-only` |
| `/ultracode-research` | `adversarial-research` | no | findings, status `research-only` |
| `/ultrathink`, `/ultrathink-fusion` | `adversarial-research` | no | a recommendation, status `research-only` |
| `/ultracode-fusion` | `build` | per task | disclosed fusion trace and gate result |
| `/ultracode-fusion-models` | none | no | the fusion model configuration |

The command prompt lists the phases for its mode. Follow that list; this skill supplies the rules that apply across all of them.

## Workflow state tools

A command starts a workflow record in the project root, at `.opencode/open-ultracode/state/workflow-state.json`. The plugin tools keep it current:

| Tool | Effect |
| --- | --- |
| `open_ultracode_status` | Reads mode, phase, goal, open finding IDs, current evidence and degradation notices. |
| `open_ultracode_record_intake` | Sets the goal, constraints, assumptions and acceptance criteria, and moves the phase. |
| `open_ultracode_record_finding` | Records an adversarial finding, or reconciles one. |
| `open_ultracode_record_verification` | Records the result of one check. |
| `open_ultracode_record_blocked_check` | Records a check that could not run. |
| `open_ultracode_completion_report` | Runs the gate over the record and stores the report. |
| `open_ultracode_list_models` | Lists the models and variants opencode offers, per provider. |
| `open_ultracode_configure_fusion` | Reads or changes the fusion panel and decider models. A change asks the user for permission. |

### How the gate decides

Use `open_ultracode_completion_report` for the final status instead of judging completion yourself. It returns:

- `blocked` if the latest result of any check is `blocked`.
- `failed` if the latest result of any check is `fail`.
- `research-only` in the research modes, or when you pass `researchOnly: true`. A research workflow is never `verified`.
- `partial` if there are no criteria, a criterion has no passing check that lists it in `criteriaIds`, or a check was recorded as `not-run`.
- `blocked` if a finding of high or medium severity is still open. With the `recommended` review policy this is `partial`; with `disabled` findings are only listed.
- `verified` otherwise.

The report's `unresolvedRisks` list says what stands in the way.

### When a workflow record starts and ends

- A command in a new session, or in a different mode, starts an empty record.
- A second command in the same session and the same mode continues the existing record, with its criteria and evidence.
- A `verified` or `research-only` completion report ends the workflow. So does setting the phase to `completed`. The next command then starts an empty record.
- The record tools write to whatever record the project holds. They do not check that it belongs to your task.

So:

1. At intake, call `open_ultracode_status`. If the goal or the evidence belongs to a different task, tell the user and do not record into it. Set its phase to `completed` with `open_ultracode_record_intake` and ask the user to run the command again.
2. If you stop a workflow that is not verified, and the user is moving on, set the phase to `completed`.
3. If a record tool answers `recorded: false`, no workflow has been started. Keep the same information in your replies and say that the workflow record is degraded.

### Recording intake

After intake, call `open_ultracode_record_intake` with the goal, constraints, assumptions and criteria (`AC-1`, `AC-2`, ...), and the next phase. Set each criterion's `source` to `user`, `spec` or `inferred`; use `inferred` for a criterion you wrote, so the user can see which ones they never stated. Sending a criterion with an existing ID replaces its text. Call the tool again to move the phase as the work progresses.

### Recording evidence

- Only the coordinator records evidence. Subagents return results in their report and the coordinator records them.
- Give each check one ID and keep it. When you run the check again, record the new result under the same ID; it replaces the earlier result. Do not invent a new ID to cancel an old record.
- List the criteria a check proves in `criteriaIds`. A record with an empty `criteriaIds` proves nothing to the gate.
- Record `fail` when a check fails, and use `open_ultracode_record_blocked_check` when a check cannot run. Both hold the gate until the same check is recorded again with a pass.
- Record what you ran. Do not record a pass for a check you did not run after the last code change.
- If a record call does not change what status shows, stop and tell the user. Do not retry it.

### Recording findings

Record each adversarial finding with `open_ultracode_record_finding`: an ID, severity, confidence, title, evidence, impact and recommendation. A finding is open until it is reconciled. To reconcile, send the ID with the fields that change:

- `disposition: accepted` when the finding was real and has been addressed. Say what fixed it in `dispositionReason`.
- `disposition: rejected` with a `dispositionReason` that cites evidence. The tool refuses a rejection without a reason.
- `deferred` and `clarification-needed` record the decision and leave the finding open.

### Blocked phase and notices

The plugin sets the phase to `blocked` when the user rejects a permission request, a rule denies a tool call, or an `open_ultracode_*` tool call fails. Once the blocker is resolved, resume by setting a phase with `open_ultracode_record_intake`. Other tool errors only add a notice. A notice reports a reduced capability, not a failure; carry on and list it in the final report.

## Phases

### Intake

Capture the goal, the non-goals, the constraints and the acceptance criteria. Write each criterion as a statement that a command, a test or an observation can show to be true or false. Ask the user only when the answer changes user-visible behaviour, safety or scope. For anything else, choose a reversible assumption and record it.

### Planning

Order the steps and name the check that will prove each criterion. Decide which roles to dispatch. Record the intake.

### Execution

Change only what the criteria need. For a behaviour change, write the failing test or check first, then the smallest change that passes it. Do not weaken or delete a test to make it pass.

### Adversarial review

Try to show the result is wrong. Look for a criterion that no check covers, a check that passes without exercising the change, an assumption that the code contradicts, a change outside the request, and a claim with no evidence behind it. Style comments are not findings.

Give the adversary the diff, the criteria and the commands to run. Do not give it the implementer's own assessment of the work.

Report the review in this schema:

```md
## Adversarial Review
- VERDICT: ship | fix | reject
- FINDINGS:
  - ID: <finding ID>
    SEVERITY: high | medium | low
    CONFIDENCE: high | medium | low
    AFFECTED_REQUIREMENT: <criterion ID or unknown>
    EVIDENCE: <file:line, command output or quoted requirement>
    DISPOSITION: open | accepted | rejected
    REJECTION_REASON: <required when rejected>
- COMPLETION_RISK: <risk to the completion gate>
```

Record each finding with `open_ultracode_record_finding` and repeat the open ones in the final report.

### Reconciliation

Give every finding a disposition and record it. Fix an accepted finding and rerun the affected checks before you record it as accepted. Reject a finding only with evidence, and write the reason. An open or deferred finding of high or medium severity holds the gate.

### Verification

Run each check again now. Output from earlier in the session is stale once the code has changed. Record the results under the checks' IDs, then call `open_ultracode_completion_report`.

## Roles and agents

| Role | Agent | Can edit | Give it |
| --- | --- | --- | --- |
| Coordinator | main session, or `open-ultracode` | no | the user's task |
| Planner | `open-ultracode-planner` | no | goal, constraints, relevant paths |
| Implementer | `open-ultracode-implementer` | yes | one bounded step, its criteria IDs, the check to run |
| Adversary | `open-ultracode-adversary` | no | diff or paths, criteria, commands |
| Reconciler | `open-ultracode-reconciler` | no | findings with their evidence |
| Verifier | `open-ultracode-verifier` | no | criteria and the command for each |
| Researcher | `open-ultracode-researcher` | no | the claim or spec to attack |

A subagent starts with no memory of the session. Each brief must state the goal, the criteria by ID, the files or diff in scope, the constraints, what you have already ruled out, and the report format you want back.

Dispatch role agents from the main session. opencode limits how deep subagents can nest, so an agent you dispatched may be unable to dispatch its own.

### Single-session fallback

If subagents are unavailable, use the single-session fallback: run the coordinator, planner, implementer, adversary, reconciler and verifier roles yourself in that order and label each one's output. Say in the final report that the review was not independent.

## Debug loop

1. Reproduce the failure with the smallest command or case. If you cannot reproduce it, say so and stop guessing.
2. Locate the failing boundary: test, code, config, permission, environment or spec.
3. State one root-cause hypothesis and the observation that would disprove it.
4. Make one targeted change.
5. Rerun the reproducer, then the nearby regression checks.
6. After three failed hypotheses, stop changing code. Report what you ruled out and what evidence you still need.

If the cause is a missing or contradictory requirement, stop and run a spec-audit.

## Spec-audit and adversarial research

These modes produce findings, not code.

- Spec-audit: extract each explicit criterion, then list the missing actors, inputs, outputs, error states, permissions, data boundaries and verification methods. Turn vague wording into questions that have a testable answer.
- Adversarial research: build the strongest case that the plan is wrong. Look for edge cases, misuse paths, unsafe defaults and integration gaps.

In both, separate what you verified from what you suspect, and report `research-only`. A finding blocks later work only when it has evidence.

## Ultrathink

Ultrathink is problem solving without code changes. Do not edit files. Keep supplied facts, verified evidence, assumptions and recommendations apart. Give a problem statement, the options, the trade-offs, one recommendation, your confidence, and the next piece of evidence that would change the answer. Report `research-only`.

## Fusion

The command prompt carries the fusion protocol. These rules apply on top of it:

- Panels see only the context package you build. Put every fact they need in it.
- Disclose which agents and model IDs ran, and label a single-round result as `panel-consult`.
- If a dispatch fails, report it. Do not answer for the panel yourself.

When a fusion run reports an `OpenUltraCode fusion check:` problem (unavailable provider, model or variant), do not dispatch the affected fusion agent. Tell the user what is wrong, propose the suggested fallback from the same provider or another valid model from `open_ultracode_list_models`, and ask the user to confirm it or name another model. Only after the user answers, call `open_ultracode_configure_fusion` with the chosen model; opencode applies it to the next dispatch, so the fusion run can continue. If the user cannot be asked (non-interactive run), use the suggested fallback for this run only as the dispatch's explicit model, leave the configuration unchanged, and disclose the fallback and the persistent fix in the final report.

## Incomplete specs

Do not fill a gap in an incomplete spec silently. For each gap choose one:

- Ask the user, when the answer changes user-visible behaviour, safety or scope.
- Continue on a reversible assumption, recorded at intake, when the risk is low.
- Stop, when continuing would encode a policy that nobody has reviewed.
- Record it as a finding, in the research modes.

## Stop conditions

- A permission or tool call is denied: stop that path, report it and name the safe next step. Do not find another route to the same action.
- The same action has run twice with the same result: stop and report. Do not run it a third time.
- A check cannot run: record it as blocked once and move on.

## Final report

Lead with the status, then the evidence for it.

```md
## OpenUltraCode Report
- STATUS: verified | partial | blocked | failed | research-only
- GATE: <status from open_ultracode_completion_report, or "not run: <why>">
- GOAL: <one sentence>
- CRITERIA:
  - AC-1: verified | unverified | not-applicable (evidence <ID>: <command> gave <result>)
- FINDINGS: <ID, severity, disposition, one line each, or none>
- ASSUMPTIONS: <still in force, or none>
- NOT VERIFIED: <skipped, blocked or failed checks with the reason, or none>
- DEGRADED: <single-session review, missing tools, notices, fusion fallbacks, or none>
- NEXT: <smallest useful next step, or none>
```

Report `verified` only when the gate returned `verified` and every passing check was run after the last code change. If the tools are unavailable, say so and report from your own evidence: every criterion has a fresh passing check, and no finding of high or medium severity is open.

If your status differs from the gate's, give both and explain the difference. Do not claim completion when the work is only planned, partly checked, blocked or unproven.
