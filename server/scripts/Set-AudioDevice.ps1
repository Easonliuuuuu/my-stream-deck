#Requires -Modules AudioDeviceCmdlets

param(
  [Parameter(Mandatory = $true)][string]$Id
)

Set-AudioDevice -ID $Id | Out-Null
Write-Output '{"ok":true}'
