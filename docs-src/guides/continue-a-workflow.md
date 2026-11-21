---
title: Continue a workflow in another session
summary: Take over a workflow record that a different opencode session started.
order: 30
icon: user
audience: users
status: draft
---

A [[term:Workflow record]] belongs to the session that ran the command and to the subagents of that session. A tool call from another session gets this answer:

```json title="Tool result"
{
  "recorded": false,
  "reason": "The workflow record in this project belongs to another session. Start a workflow here with an OpenUltraCode command, or continue that record in this session by calling open_ultracode_record_intake with adopt: true."
}
```

## Continue the record

1. Open the project in the new session.
2. Ask for the status. The answer has `"ownedByThisSession": false` and shows the goal of the other session's workflow.

   ```text title="In opencode"
   Call open_ultracode_status.
   ```

3. If the goal is the work you want to continue, adopt the record:

   ```text title="In opencode"
   Call open_ultracode_record_intake with adopt: true.
   ```

   The record now belongs to this session. The earlier session can no longer change it.

## Start a new record instead

Run a command. A command in a new session always starts an empty record and replaces the old one:

```text title="In opencode"
/ultracode "The new task."
```

:::see-also
- [[concepts/session-ownership]]
- [[reference/workflow-record]]
:::
