[CmdletBinding()]
param(
  [string]$OpenCodeConfigDir = $env:OPENCODE_CONFIG_DIR,
  [string]$InstallDir = $env:OPENULTRACODE_HOME,
  [string]$Repo = $(if ($env:OPENULTRACODE_REPO) { $env:OPENULTRACODE_REPO } else { "belikh/OpenUltraCode" }),
  [string]$PanelA,
  [string]$PanelB,
  [string]$Decider,
  [string]$Archive,
  [switch]$NonInteractive,
  [switch]$Verify,
  [switch]$SkipRuntimeCheck,
  [switch]$Remove
)

# This script also runs as `irm .../install.ps1 | iex`: it must never call `exit`
# (that would close the user's shell), so failures are thrown instead.
$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "node is required for OpenUltraCode install."
}

if (-not $OpenCodeConfigDir) {
  $OpenCodeConfigDir = Join-Path $HOME ".config\opencode"
}

if (-not $InstallDir) {
  $InstallDir = Join-Path $HOME ".local\share\open-ultracode"
}
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)
$InstallerLib = Join-Path $InstallDir "scripts\installer-lib.mjs"

$Common = Join-Path $InstallDir "scripts\installer-common.ps1"

# Needed before the release is on disk; scripts\installer-common.ps1 defines the same helpers
# (scripts/validate-installers.ts keeps the two copies identical).
$ModelIdPattern = '^[A-Za-z0-9][A-Za-z0-9._-]*/[^\s#]+(#max)?$'

function Assert-ModelId([string]$Model, [string]$Name) {
  if ($Model -notmatch $ModelIdPattern) { throw "$Name '$Model' must be provider/model or provider/model#max." }
}

# Native commands do not honor $ErrorActionPreference (and Windows PowerShell 5.1 turns
# their stderr into terminating errors when output is redirected), so every native call
# goes through this helper: stderr is passed through and a non-zero exit code throws.
function Invoke-Native {
  param([Parameter(Mandatory)][string]$What, [Parameter(Mandatory)][scriptblock]$Command)
  $ErrorActionPreference = "Continue"
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$What failed with exit code $LASTEXITCODE" }
}

function Test-OpenUltraCodeInstallDir([string]$Path) {
  return (Test-Path (Join-Path $Path ".opencode\plugins\open-ultracode")) -and (Test-Path (Join-Path $Path "scripts\installer-lib.mjs"))
}

function Get-TarCommand {
  # Prefer the Windows bsdtar: GNU tar from Git's usr\bin cannot handle "C:" paths.
  if ($env:SystemRoot) {
    $windowsTar = Join-Path $env:SystemRoot "System32\tar.exe"
    if (Test-Path $windowsTar) { return $windowsTar }
  }
  if (Get-Command tar -ErrorAction SilentlyContinue) { return "tar" }
  throw "tar is required to extract the release archive."
}

# The SHA-256 of a file as lowercase hex, computed with .NET. Get-FileHash is a script function
# in Windows PowerShell 5.1 and is not found when PSModulePath lists PowerShell 7's modules,
# which is the case in every process that PowerShell 7 started.
function Get-Sha256([string]$Path) {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead((Resolve-Path -LiteralPath $Path).ProviderPath)
  try {
    return ([System.BitConverter]::ToString($sha256.ComputeHash($stream)) -replace "-", "").ToLowerInvariant()
  } finally {
    $stream.Dispose()
    $sha256.Dispose()
  }
}

# $ChecksumPath holds what the release publishes: the output of sha256sum for the archive.
function Assert-ArchiveChecksum([string]$ArchivePath, [string]$ChecksumPath) {
  $line = [string](Get-Content -Path $ChecksumPath -TotalCount 1)
  $expected = ($line.Trim() -split "\s+")[0].ToLowerInvariant()
  $actual = Get-Sha256 $ArchivePath
  if (-not $expected -or $expected -ne $actual) {
    throw "The release archive does not match its checksum (expected $expected, got $actual); the existing installation was left unchanged."
  }
}

function Install-LatestRelease {
  if ((Test-Path $InstallDir) -and (Get-ChildItem -Path $InstallDir -Force | Select-Object -First 1) -and -not (Test-Path (Join-Path $InstallDir ".opencode\plugins\open-ultracode"))) {
    throw "Refusing to replace $InstallDir because it is not an OpenUltraCode installation. Choose another -InstallDir."
  }

  $id = [System.Guid]::NewGuid().ToString("N")
  $parent = Split-Path -Parent $InstallDir
  $stage = "$InstallDir.new-$id"
  $previous = "$InstallDir.old-$id"
  $downloadPath = Join-Path ([System.IO.Path]::GetTempPath()) "open-ultracode-$id.tar.gz"
  $checksumPath = "$downloadPath.sha256"
  $releaseUrl = "https://github.com/$Repo/releases/latest/download/open-ultracode-release.tar.gz"

  try {
    if ($Archive) {
      Copy-Item -Path $Archive -Destination $downloadPath
      # A checksum file next to a local archive is checked; without one the archive is taken as given.
      if (Test-Path "$Archive.sha256") { Copy-Item -Path "$Archive.sha256" -Destination $checksumPath }
    } else {
      Write-Host "Downloading latest OpenUltraCode release from $releaseUrl..."
      $ProgressPreference = "SilentlyContinue"
      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
      try {
        Invoke-WebRequest -Uri $releaseUrl -OutFile $downloadPath -UseBasicParsing
        Invoke-WebRequest -Uri "$releaseUrl.sha256" -OutFile $checksumPath -UseBasicParsing
      } catch {
        throw "Could not download the latest OpenUltraCode release asset and its checksum from ${releaseUrl}: $_"
      }
    }
    if (Test-Path $checksumPath) { Assert-ArchiveChecksum $downloadPath $checksumPath }

    New-Item -ItemType Directory -Path $parent, $stage -Force | Out-Null
    $tar = Get-TarCommand
    Invoke-Native "Extracting the release archive" { & $tar -xzf $downloadPath -C $stage }
    if (-not (Test-OpenUltraCodeInstallDir $stage)) {
      throw "The downloaded release archive is incomplete; the existing installation was left unchanged."
    }

    if (Test-Path $InstallDir) { Move-Item -Path $InstallDir -Destination $previous }
    Move-Item -Path $stage -Destination $InstallDir
  } finally {
    Remove-Item -Path $downloadPath, $checksumPath -Force -ErrorAction SilentlyContinue
    if (Test-Path $stage) { Remove-Item -Path $stage -Recurse -Force -ErrorAction SilentlyContinue }
    if ((Test-Path $previous) -and (Test-Path $InstallDir)) { Remove-Item -Path $previous -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

if ($Remove) {
  if (-not (Test-Path $InstallerLib)) {
    throw "$InstallDir does not contain an OpenUltraCode installation. Pass -InstallDir, or reinstall and then run -Remove."
  }
  if (-not (Test-Path $Common)) {
    throw "$InstallDir was installed by an older release. Run this installer once without -Remove to update it, then try again."
  }
  . $Common
  Remove-GlobalAssets $InstallDir
  if (Test-OpenUltraCodeInstallDir $InstallDir) {
    Remove-Item -Path $InstallDir -Recurse -Force
  }
  Write-Host "OpenUltraCode has been removed from opencode. Restart opencode to unload the plugin, commands, skills, and agents."
  return
}

$overrides = @{
  "ultracode-fusion-panel-a.md" = $PanelA
  "ultracode-fusion-panel-b.md" = $PanelB
  "ultracode-fusion-arbiter.md" = $Decider
}
foreach ($entry in $overrides.GetEnumerator()) {
  if ($entry.Value) { Assert-ModelId $entry.Value $entry.Key }
}

Install-LatestRelease
# Model selection, asset installation, and the runtime check are shared with install-dev.ps1.
# They ship inside the release, so they are loaded from the installation itself.
. $Common
Install-GlobalAssets $InstallDir $overrides
Invoke-RuntimeCheck $InstallDir $Verify.IsPresent
Write-InstallSummary $InstallDir
