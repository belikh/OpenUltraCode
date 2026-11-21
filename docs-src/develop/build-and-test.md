---
title: Build and test
summary: Set up a checkout, run the checks, install the checkout into opencode and rebuild these pages.
order: 10
icon: git-branch
audience: developers
status: stable
---

## Set up

You need Node.js 22 or later and `pnpm` 11.4.0. The repository pins the `pnpm` version for Corepack.

```sh title="Clone and install"
git clone https://github.com/belikh/OpenUltraCode.git
cd OpenUltraCode
corepack enable
pnpm install --frozen-lockfile
```

`pnpm install` sets `core.hooksPath` to `.githooks`.

## Run the checks

```sh title="Run every check"
pnpm run check
```

`check` runs five steps and stops at the first that fails:

| Step | Command | What it checks |
| --- | --- | --- |
| Assets | `pnpm run validate:assets` | The skill, the commands, the agents and the workflows have the parts the plugin relies on. |
| Installers | `pnpm run validate:installers` | The four installers and their shared files follow the rules in `scripts/validate-installers.ts`. |
| Types | `pnpm run build` | `tsc --noEmit`. |
| Lint | `pnpm run lint` | `eslint .`. |
| Tests | `pnpm run test` | The tests in `tests/` with the Node.js test runner. |

The tests install into temporary directories and never touch `~/.config/opencode`. The syntax tests for `dash`, `shellcheck` and PowerShell are skipped when the tool is missing, and the output names each skipped test.

## Git hooks

| Hook | When | What it does |
| --- | --- | --- |
| `pre-commit` | every commit | Runs `pnpm run check`. It refuses a commit when a staged file has unstaged changes or a project file is untracked, because the checks read the working tree. |
| `pre-push` | a push of a tag that starts with `v` | Runs `node scripts/runtime-check.mjs --live` against your installed opencode. |

## Source layout

| Path | Content |
| --- | --- |
| `src/plugin.ts` | The plugin entry: reads the options and registers the hooks. |
| `src/hooks.ts` | The hooks on prompts, model requests, permissions, tool results and compaction. |
| `src/tools.ts` | The workflow tools and their input schemas. |
| `src/gate.ts` | The completion gate. |
| `src/workflow.ts` | Commands, modes and the rules for starting and continuing a workflow. |
| `src/sessions.ts` | Finds the top-level session of a session. |
| `src/state.ts` | Reads and writes the workflow record. |
| `src/fusion-*.ts`, `src/model-catalog.ts` | Fusion model configuration and opencode's model list. |
| `src/opencode-v2.ts` | The part of the opencode 2 plugin API that the plugin uses, as types. |
| `.opencode/skills`, `.opencode/commands`, `assets/agents` | The skill, the commands and the agents that the installer copies. |
| `scripts/installer-lib.mjs` | Every edit of `opencode.json` and of installed files. |
| `scripts/installer-common.sh`, `scripts/installer-common.ps1` | The steps the release and development installers share. |

`tests/plugin-contract.test.ts` compiles `src/opencode-v2.ts` against the real `@opencode/plugin` types, so `pnpm run check` fails when the API changes.

## Try a change in opencode

```sh title="Install the checkout"
./install-dev.sh --skip-checks --skip-runtime-check
```

The plugin entry in `opencode.json` now points at the checkout. Restart opencode to load a change. Run `./install-dev.sh --remove` to undo it.

## Documentation

These pages are written in `docs-src/` and generated with `jupiter-docs` from [belikh/docs](https://github.com/belikh/docs). The files in `docs/` are output. Change a page in `docs-src/`, then run:

```sh title="Check and rebuild the pages"
jupiter-docs check
jupiter-docs build --md
```

Commit `docs-src/` and `docs/` together.

:::see-also
- [[develop/release]]
- [[reference/installers]]
:::
