---
title: OpenUltraCode
summary: An opencode plugin that runs a task as a workflow with acceptance criteria, adversarial review and a completion gate.
---

OpenUltraCode adds nine slash commands, eight tools and ten agents to opencode 2. A command such as `/ultracode` starts a [[term:Workflow]]. The model records acceptance criteria, findings and the result of each check in a [[term:Workflow record]]. The [[term:Completion gate]] then reports one status: `verified`, `partial`, `blocked`, `failed` or `research-only`.

OpenUltraCode keeps the model you selected in opencode. It runs no proxy and adds no model IDs.

This project is a fork of [norandom/OpenUltraCode](https://github.com/norandom/OpenUltraCode), which created it. The fork starts from upstream 2.0.1. [[concepts/completion-gate]] and [[concepts/session-ownership]] describe what it changes.

Start with [[start/install]], then [[guides/run-a-workflow]].
