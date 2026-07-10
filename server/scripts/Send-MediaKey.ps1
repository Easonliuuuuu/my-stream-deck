param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('PlayPause', 'Next', 'Prev')]
  [string]$Key
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SdKeyboard {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@

# Virtual-key codes for media keys (winuser.h)
$virtualKeys = @{
  PlayPause   = 0xB3
  Next        = 0xB0
  Prev        = 0xB1
}

$KEYEVENTF_KEYUP = 0x2
$vk = $virtualKeys[$Key]

[SdKeyboard]::keybd_event($vk, 0, 0, [UIntPtr]::Zero)
[SdKeyboard]::keybd_event($vk, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)

Write-Output '{"ok":true}'
