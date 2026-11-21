---
title: Upgrade and remove
summary: Install a newer release over the current one, recover a file the upgrade replaced, and remove OpenUltraCode.
order: 40
icon: refresh
audience: users
status: draft
---

## Upgrade

Run the installer again. It replaces the release and keeps your fusion models.

```sh title="Upgrade with sh"
curl -fsSL https://raw.githubusercontent.com/belikh/OpenUltraCode/main/install.sh | sh
```

```powershell title="Upgrade with PowerShell"
irm https://raw.githubusercontent.com/belikh/OpenUltraCode/main/install.ps1 | iex
```

Restart opencode after the upgrade.

## Recover a replaced file

When an upgrade replaces a skill, command or agent file with different content, it saves the old file first and prints the list:

```text title="Output"
OpenUltraCode: 2 installed file(s) changed; the previous versions are in /home/you/.config/opencode/open-ultracode-backup:
  agents/open-ultracode-implementer.md
  skills/open-ultracode/SKILL.md
```

Copy your changes from `open-ultracode-backup/` into the new file. The next install empties the directory before it saves anything, so recover your changes before you upgrade again.

## Remove

```sh title="Remove with sh"
curl -fsSL https://raw.githubusercontent.com/belikh/OpenUltraCode/main/install.sh | sh -s -- --remove
```

```powershell title="Remove with PowerShell"
irm https://raw.githubusercontent.com/belikh/OpenUltraCode/main/install.ps1 -OutFile install.ps1
.\install.ps1 -Remove
```

Removal deletes the skill, the nine commands, the ten agents, the release directory and the OpenUltraCode entries in `opencode.json`. It keeps your own agents and commands, every other setting, and `open-ultracode-backup/`.

Workflow records stay in each project under `.opencode/open-ultracode/`. Delete that directory to remove them.

## Remove an installation from before 2.1.0

The installer loads its removal code from the installed release. A release older than 2.1.0 does not have it, and the installer stops with this message:

```text title="Output"
OpenUltraCode: /home/you/.local/share/open-ultracode was installed by an older release. Run this installer once without --remove to update it, then try again.
```

Upgrade once, then remove.

:::see-also
- [[reference/installers]]
:::
