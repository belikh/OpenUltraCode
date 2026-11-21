# Shared by install.ps1 and install-dev.ps1, which dot-source it once the release or checkout
# that holds scripts\ is known. Everything that edits opencode's config or the installed files
# is done by scripts\installer-lib.mjs; this file only orchestrates.
#
# The dot-sourcing installer provides these variables:
#   $OpenCodeConfigDir, $InstallerLib, $NonInteractive, $SkipRuntimeCheck

$FusionAgents = @(
  @{ Name = "ultracode-fusion-panel-a.md"; Prompt = "Choose fusion panel A model" },
  @{ Name = "ultracode-fusion-panel-b.md"; Prompt = "Choose fusion panel B model" },
  @{ Name = "ultracode-fusion-arbiter.md"; Prompt = "Choose fusion arbiter model" }
)
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

function Invoke-InstallerLib {
  param([Parameter(Mandatory)][string]$What, [Parameter(ValueFromRemainingArguments)][string[]]$Arguments)
  Invoke-Native $What { node $InstallerLib @Arguments }
}

function Get-AgentModel([string]$AgentFile) {
  $model = Invoke-InstallerLib "Reading $AgentFile" get-agent-model $AgentFile
  if ($model) { return [string]$model }
  return $null
}

# Your providers' models first, then opencode's hosted catalog; see list-models in
# scripts/installer-lib.mjs (it retries `opencode models` and adds models from your config).
function Get-OpenCodeModels {
  $ErrorActionPreference = "Continue"
  $output = node $InstallerLib list-models "--config-dir" $OpenCodeConfigDir 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $output) { return @() }
  return @($output | ForEach-Object { "$_".Trim() } | Where-Object { $_ -match $ModelIdPattern })
}

function Test-InteractiveConsole {
  if ($NonInteractive -or $Host.Name -ne "ConsoleHost") { return $false }
  try {
    return -not ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected)
  } catch {
    return $false
  }
}

function Select-FusionModel([string]$Prompt, [string]$DefaultModel, [string]$CurrentModel, [string[]]$AvailableModels) {
  if ($CurrentModel) { $DefaultModel = $CurrentModel }
  if (-not (Test-InteractiveConsole)) {
    Write-Host "${Prompt}: using $DefaultModel"
    return $DefaultModel
  }
  $previousCtrlC = $null
  try {
    $previousCtrlC = [Console]::TreatControlCAsInput
    [Console]::TreatControlCAsInput = $true
    return Show-FusionModelMenu $Prompt $DefaultModel $AvailableModels
  } catch [System.IO.IOException] {
    Write-Host "${Prompt}: console menu unavailable, using $DefaultModel"
    return $DefaultModel
  } finally {
    if ($null -ne $previousCtrlC) { try { [Console]::TreatControlCAsInput = $previousCtrlC } catch { } }
  }
}

# Chooses all fusion models before anything is copied, so a cancelled or failed menu
# leaves the existing installation untouched.
function Resolve-FusionModels([string]$SourceAgentsDir, [string]$TargetAgentsDir, [hashtable]$Overrides) {
  $availableModels = @()
  if (Test-InteractiveConsole) { $availableModels = Get-OpenCodeModels }
  $chosen = @{}
  foreach ($agent in $FusionAgents) {
    $override = $Overrides[$agent.Name]
    if ($override) {
      Assert-ModelId $override $agent.Name
      $chosen[$agent.Name] = $override
      continue
    }
    $default = Get-AgentModel (Join-Path $SourceAgentsDir $agent.Name)
    if (-not $default) { throw "Shipped agent $($agent.Name) has no default model." }
    $current = Get-AgentModel (Join-Path $TargetAgentsDir $agent.Name)
    $model = Select-FusionModel $agent.Prompt $default $current $availableModels
    Assert-ModelId $model $agent.Name
    $chosen[$agent.Name] = $model
  }
  return $chosen
}

# Installs the skill, commands, agents, and plugin entry from a release or checkout.
function Install-GlobalAssets([string]$SourceDir, [hashtable]$Overrides) {
  $agentsDir = Join-Path $OpenCodeConfigDir "agents"
  $models = Resolve-FusionModels (Join-Path $SourceDir "assets\agents") $agentsDir $Overrides

  Invoke-InstallerLib "Installing the OpenUltraCode skill, commands, and agents" install-assets "--source-dir" $SourceDir "--config-dir" $OpenCodeConfigDir
  foreach ($agent in $FusionAgents) {
    Invoke-InstallerLib "Setting the $($agent.Name) model" set-agent-model (Join-Path $agentsDir $agent.Name) $models[$agent.Name]
  }
  $pluginPath = Join-Path $SourceDir ".opencode\plugins\open-ultracode"
  Invoke-InstallerLib "Registering the OpenUltraCode plugin" register "--config-dir" $OpenCodeConfigDir "--plugin-path" $pluginPath
}

# Removes only what the release or checkout at $SourceDir ships, never a user's own agents or commands.
function Remove-GlobalAssets([string]$SourceDir) {
  Invoke-InstallerLib "Removing the OpenUltraCode skill, commands, and agents" remove-assets "--source-dir" $SourceDir "--config-dir" $OpenCodeConfigDir
  Invoke-InstallerLib "Unregistering the OpenUltraCode plugin" unregister "--config-dir" $OpenCodeConfigDir
}

function Show-FusionModelMenu([string]$Prompt, [string]$DefaultModel, [string[]]$AvailableModels) {
  $choices = [System.Collections.Generic.List[string]]::new()
  $choices.Add($DefaultModel)
  foreach ($model in $AvailableModels) {
    if ($model -ne $DefaultModel -and -not $choices.Contains($model)) { $choices.Add($model) }
  }
  $choices.Add("Custom model ID")

  $n = $choices.Count
  $bufferWidth = [Console]::BufferWidth
  $bufferHeight = [Console]::BufferHeight
  $width = [int][Math]::Min([Console]::WindowWidth, $bufferWidth)
  if ($width -lt 40) { $width = [int][Math]::Min(80, $bufferWidth) }
  $maxLen = 0
  foreach ($c in $choices) { if ($c.Length -gt $maxLen) { $maxLen = $c.Length } }
  $colWidth = [int][Math]::Max(12, [Math]::Min(64, $maxLen + 4))
  $cols = [int][Math]::Max(1, [Math]::Floor($width / $colWidth))
  $rows = [int][Math]::Ceiling($n / $cols)
  $windowRows = [int][Math]::Min([Console]::WindowHeight, $bufferHeight)
  $visibleRows = [int][Math]::Min($rows, [Math]::Max(5, $windowRows - 6))
  $needed = 2 + $visibleRows
  $top = [Console]::CursorTop
  if ($top + $needed -ge $bufferHeight) {
    $scroll = $top + $needed - $bufferHeight + 1
    for ($i = 0; $i -lt $scroll; $i++) { [Console]::WriteLine() }
    $top = [Math]::Min([Console]::CursorTop, $bufferHeight - $needed)
  }
  if ($top -lt 0) { $top = 0 }
  $bottomLine = [Math]::Min($top + 2 + $visibleRows, $bufferHeight - 1)
  $index = 0
  $offset = 0
  $origFg = [Console]::ForegroundColor
  $origBg = [Console]::BackgroundColor

  [Console]::SetCursorPosition(0, $top)
  [Console]::Write($Prompt.PadRight($width))
  while ($true) {
    for ($r = 0; $r -lt $visibleRows; $r++) {
      $y = [Math]::Min($top + 1 + $r, $bufferHeight - 1)
      [Console]::SetCursorPosition(0, $y)
      $x = 0
      for ($c = 0; $c -lt $cols; $c++) {
        $i = $c * $rows + $offset + $r
        if ($i -ge $n) { break }
        $text = $choices[$i]
        if ($text.Length -gt $colWidth - 4) { $text = $text.Substring(0, $colWidth - 7) + "..." }
        $cell = $text.PadRight($colWidth - 2)
        if ($i -eq $index) {
          [Console]::ForegroundColor = [ConsoleColor]::Black
          [Console]::BackgroundColor = [ConsoleColor]::Cyan
          [Console]::Write($cell)
          [Console]::ForegroundColor = $origFg
          [Console]::BackgroundColor = $origBg
        } else {
          [Console]::Write($cell)
        }
        $x += $cell.Length
      }
      $rest = [Math]::Max(0, $width - $x)
      if ($rest -gt 0) { [Console]::Write(" " * $rest) }
    }
    $above = $offset
    $below = $rows - $offset - $visibleRows
    $hint = "  "
    if ($above -gt 0) { $hint += "^ $above more above   " }
    if ($below -gt 0) { $hint += "v $below more below" }
    $hy = [Math]::Min($top + 1 + $visibleRows, $bufferHeight - 1)
    [Console]::SetCursorPosition(0, $hy)
    [Console]::Write($hint.PadRight($width))
    [Console]::SetCursorPosition(0, $bottomLine)

    $key = [Console]::ReadKey($true)
    if ($key.Key -eq [ConsoleKey]::C -and ($key.Modifiers -band [ConsoleModifiers]::Control)) {
      [Console]::SetCursorPosition(0, $bottomLine)
      throw "OpenUltraCode installation cancelled."
    }
    switch ($key.Key) {
      UpArrow { $index = ($index - 1 + $n) % $n }
      DownArrow { $index = ($index + 1) % $n }
      LeftArrow { $index = (($index - $rows) % $n + $n) % $n }
      RightArrow { $index = ($index + $rows) % $n }
      Enter {
        [Console]::SetCursorPosition(0, $bottomLine)
        $picked = $choices[$index]
        if ($picked -eq "Custom model ID") {
          $custom = Read-Host "Enter provider/model or provider/model#max"
          if ($custom -match $ModelIdPattern) { return $custom }
          Write-Host "Invalid model ID: $custom"
          continue
        }
        return $picked
      }
      default { }
    }
    $row = $index % $rows
    if ($row -lt $offset) { $offset = $row }
    if ($row -ge $offset + $visibleRows) { $offset = $row - $visibleRows + 1 }
  }
}

# Makes the running opencode pick up the install (`opencode reload`), then checks the REAL
# installation: the coordinator and every fusion agent must name a provider, model, and variant
# that opencode offers; with -Live each fusion agent must also answer through a real dispatch.
function Invoke-RuntimeCheck([string]$SourceDir, [bool]$Live) {
  if ($SkipRuntimeCheck) {
    Write-Host "OpenUltraCode: runtime check skipped (-SkipRuntimeCheck)."
    return
  }
  if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) {
    Write-Warning "opencode is not on PATH; skipped the runtime check."
    return
  }
  $ErrorActionPreference = "Continue"
  opencode reload *> $null
  if ($LASTEXITCODE -ne 0) { Write-Warning "'opencode reload' failed; restart opencode to load the changes." }
  $checkArgs = @((Join-Path $SourceDir "scripts\runtime-check.mjs"), "--config-dir", $OpenCodeConfigDir)
  if ($Live) { $checkArgs += "--live" }
  node @checkArgs
  $checkStatus = $LASTEXITCODE
  if ($checkStatus -eq 1) { throw "The runtime check found problems (see above). Fix them with -PanelA/-PanelB/-Decider or /ultracode-fusion-models." }
  if ($checkStatus -ne 0) { Write-Warning "The runtime check could not reach opencode; run 'node $($checkArgs[0])' after starting it." }
}

# Shows what is actually installed, read back from disk.
function Write-InstallSummary([string]$SourceDir) {
  Write-Host ""
  Invoke-InstallerLib "Summarizing the installation" summary "--config-dir" $OpenCodeConfigDir "--source-dir" $SourceDir | ForEach-Object { Write-Host $_ }
}
