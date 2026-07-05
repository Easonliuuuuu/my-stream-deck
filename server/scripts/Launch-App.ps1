param(
  [Parameter(Mandatory = $true)]
  [string]$ProcessName,
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [string]$Arguments = ''
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SdWindow {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

$SW_RESTORE = 9

$existing = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1

if ($existing) {
  [SdWindow]::ShowWindow($existing.MainWindowHandle, $SW_RESTORE) | Out-Null
  [SdWindow]::SetForegroundWindow($existing.MainWindowHandle) | Out-Null
} elseif ($Arguments) {
  Start-Process -FilePath $Path -ArgumentList $Arguments
} else {
  Start-Process -FilePath $Path
}

Write-Output '{"ok":true}'
