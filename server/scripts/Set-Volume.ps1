#Requires -Modules AudioDeviceCmdlets

# The old approach simulated the hardware volume keys via keybd_event, which
# Windows routes to whatever device the currently-focused app's audio session
# is bound to (per-app output overrides in Settings > Sound > Volume mixer) —
# not necessarily the device this app shows as the "current output" in the
# Audio panel. Adjusting AudioDeviceCmdlets' default-device volume directly
# instead guarantees these buttons always affect the same device
# Get-AudioDevices.ps1 reports as output.current.
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Up', 'Down', 'Mute')]
  [string]$Action
)

$Step = 2

if ($Action -eq 'Mute') {
  $current = Get-AudioDevice -PlaybackMute
  Set-AudioDevice -PlaybackMute (-not $current) | Out-Null
} else {
  $delta = if ($Action -eq 'Up') { $Step } else { -$Step }
  $volume = Get-AudioDevice -PlaybackVolume
  $newVolume = [Math]::Min(100, [Math]::Max(0, $volume + $delta))
  Set-AudioDevice -PlaybackVolume $newVolume | Out-Null
}

Write-Output '{"ok":true}'
