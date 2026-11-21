---
title: Installers
summary: The options and environment variables of the four installer scripts and of the runtime check.
order: 50
icon: terminal
audience: users
status: stable
---

| Script | Installs | Shell |
| --- | --- | --- |
| `install.sh` | the latest release | sh |
| `install.ps1` | the latest release | PowerShell |
| `install-dev.sh` | the checkout it is in | sh |
| `install-dev.ps1` | the checkout it is in | PowerShell |

## install.sh

| Option | Effect |
| --- | --- |
| `--panel-a <ref>`, `--panel-b <ref>`, `--decider <ref>` | Sets the model of a fusion role. A `<ref>` is `provider/model` or `provider/model#max`. |
| `--non-interactive` | Shows no menu. Keeps the installed fusion models, or uses the release defaults. |
| `--archive <file>` | Installs a release archive from disk. If `<file>.sha256` exists, the installer checks the archive against it. |
| `--verify` | After the install, sends one small request to each fusion agent. |
| `--skip-runtime-check` | Does not run `opencode reload` or the runtime check. |
| `--remove`, `-remove`, `-r` | Removes OpenUltraCode. |
| `--help`, `-h` | Prints the options. |

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `OPENULTRACODE_REPO` | `belikh/OpenUltraCode` | The GitHub repository whose latest release is downloaded. |
| `OPENULTRACODE_HOME` | `~/.local/share/open-ultracode` | Where the release is unpacked. |
| `OPENCODE_CONFIG_DIR` | `~/.config/opencode` | The opencode configuration directory. |

## install.ps1

| Parameter | Same as |
| --- | --- |
| `-PanelA`, `-PanelB`, `-Decider` | `--panel-a`, `--panel-b`, `--decider` |
| `-NonInteractive` | `--non-interactive` |
| `-Archive` | `--archive` |
| `-Verify` | `--verify` |
| `-SkipRuntimeCheck` | `--skip-runtime-check` |
| `-Remove` | `--remove` |
| `-Repo` | `OPENULTRACODE_REPO` |
| `-InstallDir` | `OPENULTRACODE_HOME` |
| `-OpenCodeConfigDir` | `OPENCODE_CONFIG_DIR` |

## install-dev.sh and install-dev.ps1

The development installers take the fusion options, `--non-interactive`, `--skip-runtime-check` and `--remove`, and one more:

| Option | Effect |
| --- | --- |
| `--skip-checks` (`-SkipChecks`) | Does not run `pnpm install` and `pnpm run check` before the install. |

They register the checkout as the plugin, so a change to the source takes effect after opencode restarts. Their runtime check sends one small request to each fusion agent unless you pass `--skip-runtime-check`. The checks need `pnpm` on your `PATH`.

## Checksum

`install.sh` and `install.ps1` download `open-ultracode-release.tar.gz` and `open-ultracode-release.tar.gz.sha256` from the latest release. When the SHA-256 of the archive differs from the file, the installer stops:

```text title="Error"
OpenUltraCode: the release archive does not match its checksum (expected 0000000000000000000000000000000000000000000000000000000000000000, got 3dd90ec3c8805dc55538e7c128803af11134069f9a3649b3f70b148fda1c2cef); the existing installation was left unchanged.
```

`install.sh` needs `sha256sum` or `shasum` for this.

## Exit status of install.sh

| Status | Meaning |
| --- | --- |
| 0 | Installed, and the runtime check passed or was skipped. |
| 1 | An option is wrong, the download or the checksum failed, or the runtime check found a fusion model that opencode does not offer. In the last case the files are installed. |

## Runtime check

```sh title="Run the runtime check"
node ~/.local/share/open-ultracode/scripts/runtime-check.mjs --config-dir ~/.config/opencode
```

| Option | Effect |
| --- | --- |
| `--config-dir <dir>` | The opencode configuration directory to check. |
| `--live` | Also sends one small request to each fusion agent and checks that it answers on its model. |

The check passes when opencode's model list has the provider, the model and the variant of every installed fusion agent. It exits with 1 when it finds a problem and with another status when it cannot reach opencode.

:::see-also
- [[start/install]]
- [[guides/upgrade-and-remove]]
- [[develop/release]]
:::
