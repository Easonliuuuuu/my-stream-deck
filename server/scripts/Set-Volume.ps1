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
  # Get-AudioDevice -PlaybackVolume returns a formatted string like "94%",
  # not a number - $volume + $delta was silently doing string concatenation
  # ("94%" + 2 -> "94%2"), which [Math]::Max then failed to convert to
  # Int32. Strip everything but digits/decimal point and parse explicitly.
  $volumeRaw = Get-AudioDevice -PlaybackVolume
  $volume = [double]($volumeRaw -replace '[^\d.]', '')
  $newVolume = [Math]::Min(100, [Math]::Max(0, $volume + $delta))
  Set-AudioDevice -PlaybackVolume $newVolume | Out-Null
}

Write-Output '{"ok":true}'
