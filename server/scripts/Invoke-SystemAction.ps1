param([string]$Action)

switch ($Action) {
    'lock'  { Start-Process 'rundll32.exe' -ArgumentList 'user32.dll,LockWorkStation' -NoNewWindow }
    'sleep' {
        Add-Type -Assembly System.Windows.Forms
        [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)
    }
    'screenshot' {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SdScreenshotKeys {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
        $VK_LWIN = 0x5B
        $VK_SNAPSHOT = 0x2C
        $KEYEVENTF_KEYUP = 0x2

        # Win+PrtScn (not plain PrtScn) saves straight to Pictures\Screenshots
        # as a PNG instead of only copying to the clipboard.
        [SdScreenshotKeys]::keybd_event($VK_LWIN, 0, 0, [UIntPtr]::Zero)
        [SdScreenshotKeys]::keybd_event($VK_SNAPSHOT, 0, 0, [UIntPtr]::Zero)
        [SdScreenshotKeys]::keybd_event($VK_SNAPSHOT, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
        [SdScreenshotKeys]::keybd_event($VK_LWIN, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
    }
    default { Write-Error "Unknown system action: $Action"; exit 1 }
}
