#!/usr/bin/env node
// Runs jupiter-docs, the generator that turns docs-src/ into docs/ and into the pages on
// docs.jupiter.au:
//
//   node scripts/docs.mjs check             validate the pages and their wording
//   node scripts/docs.mjs build --md        rewrite docs/
//   node scripts/docs.mjs build --check     fail when docs/ is out of date
//   node scripts/docs.mjs --update check    fetch the newest generator and design system first
//
// The generator is not on npm: it lives in github.com/belikh/docs and reads the design system
// from a release download, so package.json cannot name it. This script keeps a checkout of it
// in .jupiter-docs/ (ignored by git), or uses the checkout that JUPITER_DOCS_DIR names. It
// never changes a checkout it did not make.

import { spawnSync } from "node:child_process"
import { existsSync, realpathSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const generatorRepository = "https://github.com/belikh/docs.git"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** The generator checkout to use, and whether this script made it and may change it. */
export function locateGenerator(env = process.env, root = repoRoot) {
  const named = env.JUPITER_DOCS_DIR
  return named === undefined || named === ""
    ? { directory: path.join(root, ".jupiter-docs"), owned: true }
    : { directory: path.resolve(named), owned: false }
}

/** What a checkout still needs before the generator can run; empty when it is ready. */
export function missingParts(directory, designDirectory) {
  return [
    [path.join(directory, "packages/docs/bin/jupiter-docs.mjs"), "the generator"],
    [path.join(directory, "node_modules/markdown-it"), "the generator's dependencies (run `npm ci` in it)"],
    [path.join(designDirectory, "release.json"), "the design system (run `npm run update:design` in it)"]
  ].flatMap(([file, part]) => (existsSync(file) ? [] : [part]))
}

function run(command, args, cwd) {
  // npm is a .cmd shim on Windows, which only a shell can start.
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" && command === "npm" })
  if (result.error !== undefined) throw new Error(`${command} could not start: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`)
}

/** Clones the generator on first use, installs what it needs, and refreshes both on request. */
function prepareOwnCheckout(directory, update) {
  if (!existsSync(directory)) {
    run("git", ["clone", "--depth", "1", generatorRepository, directory], repoRoot)
  } else if (update) {
    run("git", ["fetch", "--depth", "1", "origin", "HEAD"], directory)
    run("git", ["reset", "--hard", "FETCH_HEAD"], directory)
  }
  if (update || !existsSync(path.join(directory, "node_modules/markdown-it"))) {
    run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], directory)
  }
  if (update || !existsSync(path.join(directory, "vendor/design/release.json"))) {
    run("node", ["scripts/update-design.mjs"], directory)
  }
}

export function runGenerator(args, env = process.env) {
  const update = args.includes("--update")
  const generatorArgs = args.filter((arg) => arg !== "--update")
  const { directory, owned } = locateGenerator(env)
  const designDirectory = env.JUPITER_DESIGN_DIR ?? path.join(directory, "vendor/design")

  if (owned) {
    prepareOwnCheckout(directory, update)
  } else if (update) {
    throw new Error(`--update only refreshes .jupiter-docs/; update ${directory} yourself`)
  }
  const missing = missingParts(directory, designDirectory)
  if (missing.length > 0) throw new Error(`${directory} is missing ${missing.join(" and ")}`)

  const result = spawnSync(process.execPath, [path.join(directory, "packages/docs/bin/jupiter-docs.mjs"), ...generatorArgs], {
    cwd: repoRoot,
    env: { ...env, JUPITER_DESIGN_DIR: designDirectory },
    stdio: "inherit"
  })
  if (result.error !== undefined) throw result.error
  return result.status ?? 1
}

// Compare real paths: argv[1] keeps symlinks (macOS /var -> /private/var) that import.meta.url resolves.
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = runGenerator(process.argv.slice(2))
  } catch (error) {
    console.error(`docs: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  }
}
