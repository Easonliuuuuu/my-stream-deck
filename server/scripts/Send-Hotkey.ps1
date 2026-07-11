param(
  [Parameter(Mandatory = $true)]
  [string]$Combo
)

# Generic modifier+key combo simulator (e.g. "Ctrl+Shift+M"), reusable
# beyond Discord's mute toggle. Uses keybd_event, same Win32 API
# Send-MediaKey.ps1 already uses — this reaches globally-registered hotkeys
# (e.g. Discord's own "Global" keybind toggle) the same way a real keypress
# would, not just whatever window currently has focus.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SdHotkey {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@

$KEYEVENTF_KEYUP = 0x2

$modifierKeys = @{
  'ctrl'  = 0x11
  'alt'   = 0x12
  'shift' = 0x10
  'win'   = 0x5B
}

$namedKeys = @{
  'space' = 0x20
  'f1' = 0x70; 'f2' = 0x71; 'f3' = 0x72; 'f4' = 0x73
  'f5' = 0x74; 'f6' = 0x75; 'f7' = 0x76; 'f8' = 0x77
  'f9' = 0x78; 'f10' = 0x79; 'f11' = 0x7A; 'f12' = 0x7B
}

$tokens = $Combo -split '\+' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
if ($tokens.Count -lt 1) {
  Write-Error "Empty hotkey combo"
  exit 1
}

$mainToken = $tokens[-1]
$modifierTokens = if ($tokens.Count -gt 1) { $tokens[0..($tokens.Count - 2)] } else { @() }

$modifierVks = @()
foreach ($t in $modifierTokens) {
  $key = $t.ToLowerInvariant()
  if (-not $modifierKeys.ContainsKey($key)) {
    Write-Error "Unsupported modifier: '$t' (use Ctrl, Alt, Shift, or Win)"
    exit 1
  }
  $modifierVks += $modifierKeys[$key]
}

$mainLower = $mainToken.ToLowerInvariant()
if ($namedKeys.ContainsKey($mainLower)) {
  $mainVk = $namedKeys[$mainLower]
} elseif ($mainToken -match '^[A-Za-z0-9]$') {
  # A-Z/0-9 virtual-key codes equal their uppercase ASCII codes.
  $mainVk = [byte][char]$mainToken.ToUpperInvariant()
} else {
  Write-Error "Unsupported key: '$mainToken' (use a single letter/digit, Space, or F1-F12)"
  exit 1
}

foreach ($vk in $modifierVks) {
  [SdHotkey]::keybd_event($vk, 0, 0, [UIntPtr]::Zero)
}
[SdHotkey]::keybd_event($mainVk, 0, 0, [UIntPtr]::Zero)
[SdHotkey]::keybd_event($mainVk, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
for ($i = $modifierVks.Count - 1; $i -ge 0; $i--) {
  [SdHotkey]::keybd_event($modifierVks[$i], 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

Write-Output '{"ok":true}'
