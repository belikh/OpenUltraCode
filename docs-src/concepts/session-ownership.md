---
title: Session ownership
summary: Which opencode sessions can change a workflow record, and which events in a project affect the workflow.
order: 30
icon: lock
audience: users
status: stable
---

A [[term:Workflow record]] belongs to one top-level session: the session that ran the command. The sessions that this session starts, such as its subagents, belong to the workflow too. The plugin finds the top-level session of any session by following `parentID` in opencode's session data.

## What ownership decides

| Event | In a session of the workflow | In another session of the project |
| --- | --- | --- |
| A recording tool is called | The record changes. | The tool answers `"recorded": false` and says why. |
| `open_ultracode_completion_report` is called | The report covers the record and is stored. | The report covers an empty record and nothing is stored. |
| A permission is denied | The phase becomes `blocked`. | Nothing. |
| A tool fails | A notice is added. | Nothing. |
| The model is called | The high-effort hints apply. | The request is unchanged. |
| The session is compacted | The summary of the record is added. | Nothing. |
| A command is run | The record continues or a new one starts. See [[reference/commands]]. | A new record replaces the old one. |

`open_ultracode_status` answers in every session. Its field `ownedByThisSession` says whether the session can change the record.

## Take over a record

A session takes over a record by calling `open_ultracode_record_intake` with `adopt: true`. The record's `sessionId` becomes the top-level session of the caller. [[guides/continue-a-workflow]] has the steps.

## Unknown ancestry

If opencode cannot report a session's parents, the plugin treats the session as part of the workflow. A lookup that fails cannot lock a workflow out of its own record.

## Reason

One record per project is shared by every opencode session in that project. Before 2.1.0 any session could write to it. Check results of unrelated tasks then collected in one record, and one `blocked` result among them held the gate at `blocked`.

:::see-also
- [[reference/workflow-record]]
- [[concepts/completion-gate]]
:::
