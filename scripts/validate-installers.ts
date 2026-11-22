import { existsSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"

export interface InstallerValidationResult {
  readonly ok: boolean
  readonly errors: readonly string[]
}

// Static guard rails for the four installers. Behavior is covered by tests/installer-lib.test.ts
// (config and asset editing) and tests/installer-e2e.test.ts (real installer runs); these rules
// catch regressions those tests cannot see, such as a check that only fails on another platform.
//
// Each installer is judged together with the shared file it loads, because that is what runs.

const shellInstallers = ["install.sh", "install-dev.sh"] as const
const powershellInstallers = ["install.ps1", "install-dev.ps1"] as const
const releaseInstallers = ["install.sh", "install.ps1"] as const
const allInstallers = [...shellInstallers, ...powershellInstallers] as const
const sharedShell = "scripts/installer-common.sh"
const sharedPowerShell = "scripts/installer-common.ps1"
const fusionAgents = ["ultracode-fusion-panel-a.md", "ultracode-fusion-panel-b.md", "ultracode-fusion-arbiter.md"]

const rules: ReadonlyArray<{ readonly applies: readonly string[]; readonly test: (content: string) => boolean; readonly message: string }> = [
  {
    applies: allInstallers,
    test: (content) => /installer-lib\.mjs/u.test(content) && /\bregister\b/u.test(content) && /\bunregister\b/u.test(content),
    message: "must register and unregister the plugin through scripts/installer-lib.mjs"
  },
  {
    applies: allInstallers,
    // Config edits inside the installers cannot be tested and have deleted users' plugins before.
    test: (content) => !/JSON\.parse|delete config\.|config\.plugins?\s*=|node -e/u.test(content),
    message: "must not edit opencode config inline (JSON.parse / delete config.* / node -e); use scripts/installer-lib.mjs"
  },
  {
    applies: allInstallers,
    test: (content) => /\.opencode[/\\]plugins[/\\]open-ultracode(?![\w.-])/u.test(content) && !/plugins[/\\]open-ultracode\.ts/u.test(content),
    message: "must register the .opencode/plugins/open-ultracode directory, not a single .ts file"
  },
  {
    applies: allInstallers,
    test: (content) => /set-agent-model/u.test(content) && /get-agent-model/u.test(content),
    message: "must read and write fusion agent models through scripts/installer-lib.mjs"
  },
  {
    applies: allInstallers,
    // One tested implementation copies, backs up, and removes the shipped files on every platform.
    test: (content) => /\binstall-assets\b/u.test(content) && /\bremove-assets\b/u.test(content) && !/^\s*(?:cp|Copy-Item)\b[^\n]*(?:\.opencode|assets)[/\\]/mu.test(content),
    message: "must install and remove the skill, commands, and agents through scripts/installer-lib.mjs, not with inline copies"
  },
  {
    applies: releaseInstallers,
    // A release that is downloaded must match the checksum published with it.
    test: (content) =>
      (/\bverify_checksum "\$archive" "\$archive\.sha256"/u.test(content) && /sha256sum/u.test(content) && /\$RELEASE_URL\.sha256/u.test(content)) ||
      (/Assert-ArchiveChecksum \$downloadPath \$checksumPath/u.test(content) && /Cryptography\.SHA256\]::Create\(\)/u.test(content) && /\$releaseUrl\.sha256/u.test(content)),
    message: "must verify the downloaded release archive against its published SHA-256 checksum"
  },
  {
    applies: powershellInstallers,
    // These are script functions of Windows PowerShell 5.1's Utility module. It does not find them
    // when PSModulePath lists PowerShell 7's modules, as in any process that PowerShell 7 started.
    test: (content) => !/\b(?:Get-FileHash|New-Guid|New-TemporaryFile|Format-Hex|Import-PowerShellDataFile)\b/u.test(content.replace(/^\s*#.*$/gmu, "")),
    message: "must not call Get-FileHash, New-Guid, New-TemporaryFile, Format-Hex or Import-PowerShellDataFile (missing in Windows PowerShell 5.1 under a PowerShell 7 PSModulePath); use .NET"
  },
  {
    applies: allInstallers,
    test: (content) => /function Remove-GlobalAssets|remove_global_assets\(\)/u.test(content) && /\[switch\]\$Remove|-remove\|--remove/u.test(content),
    message: "must expose removal via -Remove (PowerShell) or -remove/--remove (sh)"
  },
  {
    applies: allInstallers,
    test: (content) => /list-models --config-dir|list-models "--config-dir"/u.test(content),
    message: "must offer the user's models via scripts/installer-lib.mjs list-models (providers first)"
  },
  {
    applies: allInstallers,
    test: (content) => /summary "?--config-dir"?/u.test(content),
    message: "must end with the installer-lib summary of what was installed (plugin entry, fusion models, assets)"
  },
  {
    applies: allInstallers,
    // Fakes cannot see runtime failures (undeclared variants, missing providers, 400s); every
    // installer must reload opencode and check the real installation, with an explicit opt-out.
    test: (content) => /runtime-check\.mjs/u.test(content) && /opencode reload/u.test(content) && /skip-runtime-check|SkipRuntimeCheck/u.test(content),
    message: "must run 'opencode reload' and scripts/runtime-check.mjs after installing, with a --skip-runtime-check/-SkipRuntimeCheck opt-out"
  },
  {
    applies: allInstallers,
    // Batch installs choose every fusion model without the interactive menu.
    test: (content) =>
      (/--panel-a\)/u.test(content) && /--panel-b\)/u.test(content) && /--decider\)/u.test(content) && /--non-interactive\)/u.test(content)) ||
      (/\[string\]\$PanelA/u.test(content) && /\[string\]\$PanelB/u.test(content) && /\[string\]\$Decider/u.test(content) && /\[switch\]\$NonInteractive/u.test(content)),
    message: "must accept --panel-a/--panel-b/--decider/--non-interactive (PowerShell: -PanelA/-PanelB/-Decider/-NonInteractive) for batch installs"
  },
  {
    applies: allInstallers,
    test: (content) => !/\.opencode[/\\]tools|open_ultracode_configure_fusion\.ts"? -Destination|cp [^\n]*open_ultracode_configure_fusion\.ts/u.test(content.replace(/^.*(?:rm -f|Remove-Item).*$/gmu, "")),
    message: "must not install .opencode/tools (OpenCode 2 does not load it; the plugin registers the fusion tool)"
  },
  {
    applies: shellInstallers,
    test: (content) => /^set -eu$/mu.test(content) && /^set -f$/mu.test(content),
    message: "must run with set -eu and set -f"
  },
  {
    applies: shellInstallers,
    // bash does not apply set -e inside $(...), so every substitution that can fail must propagate.
    test: (content) => !/^\s*\w+=\$\((?:choose_model|lib get-agent-model)[^\n]*\)\s*$/mu.test(content),
    message: "must propagate failures of $(choose_model ...) and $(lib ...) with '|| exit $?'"
  },
  {
    applies: shellInstallers,
    test: (content) => /model-menu\.mjs/u.test(content) && /<\/dev\/tty/u.test(content),
    message: "must run scripts/model-menu.mjs on /dev/tty so the menu works under curl | sh"
  },
  {
    applies: powershellInstallers,
    test: (content) => /function Invoke-Native/u.test(content) && /\$LASTEXITCODE -ne 0/u.test(content) && /Invoke-Native "pnpm run check"|Invoke-Native "Extracting/u.test(content),
    message: "must run native commands through Invoke-Native so non-zero exit codes stop the install"
  },
  {
    applies: powershellInstallers,
    // Silenced probes (`git ... *> $null` followed by a $LASTEXITCODE check) are allowed.
    test: (content) => !/^\s*(?:pnpm|tar|git|corepack)\s(?![^\n]*\*> \$null)/mu.test(content),
    message: "must not call pnpm, tar, git, or corepack directly; wrap them in Invoke-Native"
  },
  {
    applies: powershellInstallers,
    // Windows PowerShell 5.1 pipes scripts as ASCII and reads BOM-less files as ANSI.
    test: (content) => !/[\u0080-\u{10FFFF}]/u.test(content),
    message: "must contain only ASCII characters"
  },
  {
    applies: powershellInstallers,
    // "\n" is not a newline in PowerShell; it wrote literal backslash-n into opencode.json before.
    test: (content) => !/"[^"\n]*\\n[^"\n]*"\s*\|\s*Set-Content|-Encoding utf8/u.test(content),
    message: "must not write files with Set-Content \"...\\n...\" or -Encoding utf8 (BOM on 5.1)"
  },
  {
    applies: ["install.ps1"],
    // `irm ... | iex` runs this in the user's session, where `exit` closes their shell.
    test: (content) => !/^\s*exit\b/mu.test(content),
    message: "must throw instead of calling exit (it runs under irm | iex)"
  }
]

// Inside a double-quoted PowerShell string, "$name:" is parsed as a scope qualifier
// (like $env:PATH) and is a parse error. Only $env: is legitimate.
const psVariableScopeBugPattern = /"[^"\n]*?\$(?!env:)[A-Za-z_][A-Za-z0-9_]*:/u

export function validateInstallers(root = process.cwd()): InstallerValidationResult {
  const errors: string[] = []

  const shared = {
    shell: readInstaller(root, sharedShell, errors),
    powershell: readInstaller(root, sharedPowerShell, errors)
  }

  for (const relativePath of allInstallers) {
    const own = readInstaller(root, relativePath, errors)
    const isPowerShell = powershellInstallers.includes(relativePath as (typeof powershellInstallers)[number])
    const common = isPowerShell ? shared.powershell : shared.shell
    if (own === undefined || common === undefined) continue
    const content = `${own}\n${common}`

    for (const rule of rules) {
      if (rule.applies.includes(relativePath) && !rule.test(content)) {
        errors.push(`${relativePath} ${rule.message}`)
      }
    }

    for (const agent of fusionAgents) {
      if (!content.includes(agent)) errors.push(`${relativePath} must configure ${agent}`)
    }

    if (isPowerShell) {
      const bug = psVariableScopeBugPattern.exec(content)
      if (bug !== null) {
        errors.push(`${relativePath} contains "$...:" inside a double-quoted string (${bug[0]}); use ${"${...}"} to delimit the variable`)
      }
      if (/\[Console\]::SetCursorPosition/u.test(content) && !/\[Console\]::BufferHeight/u.test(content)) {
        errors.push(`${relativePath} writes cursor positions without clamping to [Console]::BufferHeight`)
      }
    }
  }

  // install.ps1 needs a few helpers before the release (and with it the shared file) is on
  // disk. They are the one piece of code kept twice, so the copies must not drift apart.
  const bootstrap = readInstaller(root, "install.ps1", [])
  if (bootstrap !== undefined && shared.powershell !== undefined) {
    for (const helper of bootstrapHelpers) {
      const copies = [bootstrap, shared.powershell].map((content) => helper.exec(content)?.[0].replace(/\r\n/gu, "\n"))
      if (copies[0] === undefined || copies[0] !== copies[1]) {
        errors.push(`install.ps1 helper ${helper.source.slice(0, 40)} must match ${sharedPowerShell}`)
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

const bootstrapHelpers = [
  /^\$ModelIdPattern = .*$/mu,
  /^function Assert-ModelId\b[\s\S]*?^\}/mu,
  /^function Invoke-Native \{[\s\S]*?^\}/mu
]

function readInstaller(root: string, relativePath: string, errors: string[]): string | undefined {
  const fullPath = join(root, relativePath)
  if (!existsSync(fullPath)) {
    errors.push(`${relativePath} is missing`)
    return undefined
  }
  return readFileSync(fullPath, "utf8")
}

if (isDirectExecution()) {
  const result = validateInstallers()
  if (result.ok) {
    console.log("OpenUltraCode installers are valid")
  } else {
    console.error(`OpenUltraCode installer validation failed:\n${result.errors.join("\n")}`)
    process.exitCode = 1
  }
}

function isDirectExecution(): boolean {
  const scriptPath = process.argv[1]
  return scriptPath !== undefined && basename(scriptPath) === basename(new URL(import.meta.url).pathname)
}
