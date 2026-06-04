[CmdletBinding()]
param(
  [ValidateSet("user", "project", "local")]
  [string]$Scope = "user",
  [switch]$SkipBuild,
  [switch]$SkipDoctor
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptPath = Join-Path $PSScriptRoot "scripts\install-claude-code.ps1"
& $scriptPath @PSBoundParameters
