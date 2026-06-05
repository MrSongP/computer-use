param(
  [ValidateSet("user", "project", "local")]
  [string]$Scope = "user",
  [switch]$SkipBuild,
  [switch]$SkipDoctor
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "_computer-use-plugin-common.ps1")

function Get-ClaudeUserSettingsPath {
  return Join-Path $HOME ".claude\settings.json"
}

function Read-ClaudeJsonFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return [pscustomobject]@{}
  }

  try {
    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    throw "Failed to parse Claude user settings JSON at $Path. $($_.Exception.Message)"
  }
}

function Write-ClaudeJsonFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [object]$Value
  )

  $directory = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText(
    $Path,
    ($Value | ConvertTo-Json -Depth 20),
    $utf8NoBom
  )
}

function Backup-ClaudeUserSettings {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SettingsPath
  )

  if (-not (Test-Path -LiteralPath $SettingsPath)) {
    return $null
  }

  $backupPath = "$SettingsPath.computer-use-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $SettingsPath -Destination $backupPath -Force
  return $backupPath
}

function Add-ClaudeUserPermissionRule {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SettingsPath,
    [Parameter(Mandatory = $true)]
    [string]$Rule
  )

  $settingsDir = Split-Path -Parent $SettingsPath
  if (-not (Test-Path -LiteralPath $settingsDir)) {
    New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null
  }

  $settings = Read-ClaudeJsonFile -Path $SettingsPath

  if (-not ($settings.PSObject.Properties.Name -contains "permissions") -or $null -eq $settings.permissions) {
    $settings | Add-Member -NotePropertyName "permissions" -NotePropertyValue ([pscustomobject]@{}) -Force
  }

  $allowRules = @()
  if ($settings.permissions.PSObject.Properties.Name -contains "allow" -and $null -ne $settings.permissions.allow) {
    $allowRules = @($settings.permissions.allow | ForEach-Object { [string]$_ })
  }

  if ($allowRules -notcontains $Rule) {
    $allowRules += $Rule
  }

  $settings.permissions | Add-Member -NotePropertyName "allow" -NotePropertyValue $allowRules -Force
  Write-ClaudeJsonFile -Path $SettingsPath -Value $settings
}

$settingsPath = Get-ClaudeUserSettingsPath
$settingsBackupPath = $null
$pluginWasInstalled = $false
$settingsUpdated = $false

try {
  Write-Step "Checking required commands"
  foreach ($command in @("node", "npm", "claude")) {
    Require-Command $command
  }

  Write-Step "Validating required files"
  Assert-ComputerUseFilesExist

  if (-not $SkipBuild) {
    Invoke-ComputerUseBuild
  }

  Invoke-ComputerUseClaudeValidation
  Invoke-ComputerUseSmoke

  Write-Step "Preflighting Claude user settings"
  $settingsBackupPath = Backup-ClaudeUserSettings -SettingsPath $settingsPath
  $null = Read-ClaudeJsonFile -Path $settingsPath

  Write-Step "Registering Claude marketplace"
  Invoke-CheckedCommand -Executable "claude" -Arguments @("plugin", "marketplace", "add", $script:ComputerUseRepoRoot)

  $pluginWasInstalled = Test-ClaudePluginInstalled
  if ($pluginWasInstalled) {
    Write-Step "Refreshing existing Claude plugin install"
    Invoke-CheckedCommand -Executable "claude" -Arguments @("plugin", "uninstall", $script:ComputerUsePluginSelector, "--scope", $Scope, "--keep-data")
  }

  Write-Step "Installing Claude plugin"
  Invoke-CheckedCommand -Executable "claude" -Arguments @("plugin", "install", $script:ComputerUsePluginSelector, "--scope", $Scope)

  Write-Step "Updating Claude user permission allowlist"
  Add-ClaudeUserPermissionRule `
    -SettingsPath $settingsPath `
    -Rule "mcp__plugin_computer-use_computer-use"
  $settingsUpdated = $true

  if (-not $SkipDoctor) {
    Write-Step "Running Claude install doctor"
    Invoke-CheckedCommand -Executable (Get-CurrentPowerShellExecutable) -Arguments @(
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      (Join-Path $PSScriptRoot "doctor-computer-use.ps1"),
      "-Target",
      "Claude",
      "-ClaudeScope",
      $Scope
    )
  }
} catch {
  Write-Warning "Claude Code install failed: $($_.Exception.Message)"
  Write-Step "Rolling back Claude install state"

  if ($settingsUpdated -and $null -ne $settingsBackupPath -and (Test-Path -LiteralPath $settingsBackupPath)) {
    Copy-Item -LiteralPath $settingsBackupPath -Destination $settingsPath -Force
  }

  $pluginIsInstalledNow = Test-ClaudePluginInstalled
  if ($pluginWasInstalled -and -not $pluginIsInstalledNow) {
    Invoke-CheckedCommand -Executable "claude" -Arguments @("plugin", "install", $script:ComputerUsePluginSelector, "--scope", $Scope)
  } elseif ((-not $pluginWasInstalled) -and $pluginIsInstalledNow) {
    Invoke-CheckedCommand -Executable "claude" -Arguments @("plugin", "uninstall", $script:ComputerUsePluginSelector, "--scope", $Scope, "--keep-data")
  }

  if ($null -ne $settingsBackupPath -and (Test-Path -LiteralPath $settingsBackupPath)) {
    Write-Warning "Original Claude settings backup kept at: $settingsBackupPath"
  }

  throw
}

if ($null -ne $settingsBackupPath -and (Test-Path -LiteralPath $settingsBackupPath)) {
  Remove-Item -LiteralPath $settingsBackupPath -Force
}

Write-Host ""
Write-Host "Claude Code install finished." -ForegroundColor Green
Write-Host "User settings updated: $settingsPath" -ForegroundColor Yellow
Write-Host "Run /reload-plugins in the current Claude Code session, or start a new session." -ForegroundColor Yellow
