import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, it } from "node:test"

import { locateGenerator, missingParts } from "../scripts/docs.mjs"

// scripts/docs.mjs runs the documentation generator from a checkout of belikh/docs. These tests
// stay offline: they cover where the checkout is looked for and what is reported when it is
// incomplete. The Docs workflow runs the generator itself.
describe("docs script", () => {
  const scratch = () => mkdtempSync(join(tmpdir(), "open-ultracode-docs-"))
  const touch = (root: string, file: string) => {
    mkdirSync(join(root, file, ".."), { recursive: true })
    writeFileSync(join(root, file), "")
  }

  it("keeps its own checkout in .jupiter-docs unless JUPITER_DOCS_DIR names one", () => {
    const root = scratch()
    assert.deepEqual(locateGenerator({}, root), { directory: join(root, ".jupiter-docs"), owned: true })
    assert.deepEqual(locateGenerator({ JUPITER_DOCS_DIR: "" }, root), { directory: join(root, ".jupiter-docs"), owned: true })
    assert.deepEqual(locateGenerator({ JUPITER_DOCS_DIR: "elsewhere" }, root), { directory: resolve("elsewhere"), owned: false })
  })

  it("names each part a checkout still needs", () => {
    const checkout = scratch()
    const design = join(checkout, "vendor/design")
    assert.equal(missingParts(checkout, design).length, 3)

    touch(checkout, "packages/docs/bin/jupiter-docs.mjs")
    touch(checkout, "node_modules/markdown-it/package.json")
    assert.deepEqual(missingParts(checkout, design), ["the design system (run `npm run update:design` in it)"])

    touch(checkout, "vendor/design/release.json")
    assert.deepEqual(missingParts(checkout, design), [])
  })

  it("refuses to run with, or to update, a checkout it did not make", () => {
    const foreign = scratch()
    const run = (...args: string[]) =>
      spawnSync(process.execPath, ["scripts/docs.mjs", ...args], { encoding: "utf8", env: { ...process.env, JUPITER_DOCS_DIR: foreign } })

    const incomplete = run("check")
    assert.equal(incomplete.status, 2)
    assert.match(incomplete.stderr, /is missing the generator/u)

    const update = run("--update", "check")
    assert.equal(update.status, 2)
    assert.match(update.stderr, /--update only refreshes \.jupiter-docs\//u)
  })
})
