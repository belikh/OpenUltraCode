---
title: Run a workflow
summary: Start a workflow with /ultracode, follow it through review and verification, and read the completion report.
order: 10
icon: play
audience: users
status: stable
---

## Start the workflow

In opencode, give the task to a command:

```text title="In opencode"
/ultracode "Add a --dry-run flag to the deploy script. It prints the plan and changes nothing."
```

The command starts a [[term:Workflow record]] for the project and adds this line to the prompt:

```text title="Output"
OpenUltraCode mode active: comprehensive. The active selected opencode model is preserved.
```

Use `/ultracode-debug` for a failure, `/ultracode-spec-audit` to review a spec, and `/ultracode-research` to attack a plan. [[reference/commands]] lists all nine commands.

## What the model does

1. **Intake.** It writes the goal and the acceptance criteria into the record with `open_ultracode_record_intake`. A criterion that you did not state is marked `inferred`.
2. **Planning and execution.** It makes the change and runs the checks.
3. **Adversarial review.** It looks for defects and records each one with `open_ultracode_record_finding`.
4. **Reconciliation.** It fixes or rejects each finding and records the decision.
5. **Verification.** It runs each check again and records the result with `open_ultracode_record_verification`.
6. **Report.** It calls `open_ultracode_completion_report` and gives you the status.

## Read the status

| Status | Meaning | What to do |
| --- | --- | --- |
| `verified` | Every criterion has a passing check, and no finding of high or medium severity is open. | Nothing. The workflow has ended. |
| `partial` | A criterion has no passing check, or a check was not run. | Ask for the missing checks. |
| `failed` | The latest result of a check is `fail`. | Ask for a fix, then for the check to be run again. |
| `blocked` | A check could not run, or a finding of high or medium severity is open. | Remove the blocker or reconcile the finding. |
| `research-only` | The workflow produced findings or a recommendation. | Nothing. The workflow has ended. |

The report lists what stands in the way under `unresolvedRisks`:

```json title="Completion report"
{
  "status": "blocked",
  "summary": "Blocked completion under strict verification policy. open findings: F-1.",
  "unresolvedRisks": ["F-1 remains open: The test never exercises the changed branch"]
}
```

## Check the work again

To verify a workflow that is still open, run `/ultracode-verify` in the same session:

```text title="In opencode"
/ultracode-verify "Run every check again and report."
```

`/ultracode-verify` continues the open workflow and keeps its criteria and evidence. Any other command with a different mode starts a new record.

## See the record

Ask for the status at any time:

```text title="In opencode"
Call open_ultracode_status.
```

The record is the file `.opencode/open-ultracode/state/workflow-state.json` in the project root. The plugin keeps that directory out of git with a `.gitignore` file.

:::see-also
- [[concepts/completion-gate]]
- [[reference/tools]]
- [[guides/continue-a-workflow]]
:::
