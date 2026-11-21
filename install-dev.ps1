[CmdletBinding()]
param(
  [string]$OpenCodeConfigDir = $env:OPENCODE_CONFIG_DIR,
  [string]$PanelA,
  [string]$PanelB,
  [string]$Decider,
  [switch]$NonInteractive,
  [switch]$SkipChecks,
  [switch]$SkipRuntimeCheck,
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "node is required for OpenUltraCode install."
}

if (-not $OpenCodeConfigDir) {
  $OpenCodeConfigDir = Join-Path $HOME ".config\opencode"
}

$repoRoot = $PSScriptRoot
if (-not $repoRoot) {
  $repoRoot = (Get-Location).Path
}
$InstallerLib = Join-Path $repoRoot "scripts\installer-lib.mjs"

# Model selection, asset installation, and the runtime check are shared with install.ps1.
. (Join-Path $repoRoot "scripts\installer-common.ps1")

function Enable-GitHooks {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return }
  $ErrorActionPreference = "Continue"
  git -C $repoRoot rev-parse --is-inside-work-tree *> $null
  if ($LASTEXITCODE -ne 0) { return }
  Invoke-Native "Configuring git hooks" { git -C $repoRoot config core.hooksPath .githooks }
}

if ($Remove) {
  Remove-GlobalAssets $repoRoot
  Write-Host "OpenUltraCode has been removed from opencode. Restart opencode to unload the plugin, commands, skills, and agents. The checkout at $repoRoot was left in place."
  return
}

# Validate model overrides before the slow checks so a typo fails immediately.
$overrides = @{
  "ultracode-fusion-panel-a.md" = $PanelA
  "ultracode-fusion-panel-b.md" = $PanelB
  "ultracode-fusion-arbiter.md" = $Decider
}
foreach ($entry in $overrides.GetEnumerator()) {
  if ($entry.Value) { Assert-ModelId $entry.Value $entry.Key }
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue) -and (Get-Command corepack -ErrorAction SilentlyContinue)) {
  try { Invoke-Native "corepack enable" { corepack enable } } catch { Write-Warning $_ }
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw "pnpm is required. Enable it with 'corepack enable' or install pnpm, then rerun .\install-dev.ps1."
}

Push-Location $repoRoot
try {
  if (-not $SkipChecks) {
    Invoke-Native "pnpm install" { pnpm install --frozen-lockfile }
    Invoke-Native "pnpm run check" { pnpm run check }
  }
  Install-GlobalAssets $repoRoot $overrides
  Enable-GitHooks
  # Developers get the live check by default: every fusion agent is dispatched once.
  Invoke-RuntimeCheck $repoRoot $true
  Write-InstallSummary $repoRoot
} finally {
  Pop-Location
}
