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
2. Run `pnpm run check`.
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
2. fails if the tag differs from the version in `package.json`
3. builds the archive with `scripts/build-release-archive.mjs` and writes its checksum with `sha256sum`
4. creates the release with both files

A tag with a hyphen, such as `v2.2.0-rc.1`, creates a prerelease. A manual run of the workflow creates a prerelease named `manual-` with the run number.

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
