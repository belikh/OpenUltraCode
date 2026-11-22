---
title: Release
summary: Cut a release that the installers download, through the release workflow or by hand.
order: 20
icon: tag
audience: maintainers
status: draft
---

The installers download two files from the latest GitHub release: `open-ultracode-release.tar.gz` and `open-ultracode-release.tar.gz.sha256`. A release that is marked as a prerelease is never the latest.

## Prepare

1. Set the new version in `package.json` and in the version check of `tests/assets.test.ts`.
2. Run `pnpm run check` and `pnpm run docs:check`.
3. Merge the change into `main`.

## Release with the workflow

The workflow `.github/workflows/release.yml` runs on a tag of the form `v1.2.3`. GitHub Actions must be enabled for the repository.

```sh title="Tag and push"
git checkout main && git pull
git tag v2.1.0
git push origin v2.1.0
```

Before the push, the `pre-push` hook runs the live runtime check against your installed opencode. The workflow then:

1. runs `pnpm run check` on Linux, macOS and Windows with Node.js 22 and 24
2. validates the pages and fails when `docs/` is out of date
3. fails if the tag differs from the version in `package.json`
4. builds the archive with `scripts/build-release-archive.mjs` and writes its checksum with `sha256sum`
5. creates the release with both files

A tag with a hyphen, such as `v2.2.0-rc.1`, creates a prerelease. A manual run of the workflow creates a prerelease named `manual-` with the run number.

## When the runtime check fails

The check asks the coordinator to call each fusion agent once, through your opencode and your provider accounts. It fails when a model does not answer, whatever the cause: a wrong model name, an account without balance or quota, or a provider that is down. The hook then refuses the push:

```text title="Output"
pre-push: the runtime check failed; fix the installation before releasing.
```

1. Read the lines that start with `FAIL`. Each names the agent or the provider error.
2. If a model name or a variant is wrong, fix it with [[guides/choose-fusion-models]] and push again.
3. If your accounts cannot answer, run the same check with models that can. Create a directory with an `opencode.json` that sets `model`, and a project directory with the three fusion agents in `.opencode/agents`, each with a `model` that answers.

```sh title="Run the check with other models"
node scripts/runtime-check.mjs --live --config-dir /tmp/gate/config --directory /tmp/gate/project
```

```text title="Last line of the output"
  result: OK
```

`git push --no-verify` skips the hook. The release workflow does not run the runtime check, so nothing else tests the release in a real opencode.

## Release by hand

Use this when Actions is not available.

```sh title="Build, check and publish"
node scripts/build-release-archive.mjs /tmp/release/open-ultracode-release.tar.gz
cd /tmp/release
sha256sum open-ultracode-release.tar.gz > open-ultracode-release.tar.gz.sha256
gh release create v2.1.0 open-ultracode-release.tar.gz open-ultracode-release.tar.gz.sha256 \
  --repo belikh/OpenUltraCode --title v2.1.0 --target main \
  --notes "OpenUltraCode release archive for install.sh and install.ps1."
```

Run `sha256sum` inside the directory, so the checksum file names the archive without a path.

## Publish the pages

docs.jupiter.au reads the pages from the newest release that has a `docs.config.json`. Its build runs once a day. To publish sooner:

```sh title="Rebuild the site now"
gh workflow run docs-site.yml --repo belikh/docs
```

## Check the release

Install it into temporary directories. The command fails if the download or the checksum is wrong.

```sh title="Install the published release into a scratch directory"
curl -fsSL https://raw.githubusercontent.com/belikh/OpenUltraCode/main/install.sh |
  OPENCODE_CONFIG_DIR=/tmp/check/config OPENULTRACODE_HOME=/tmp/check/open-ultracode \
  sh -s -- --non-interactive --skip-runtime-check
```

```text title="Output"
OpenUltraCode 2.1.0 installed
```

:::see-also
- [[develop/build-and-test]]
- [[reference/installers]]
:::
