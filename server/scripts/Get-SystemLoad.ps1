$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
if ($null -eq $cpu) { $cpu = 0 }

# GPU has no single WMI load counter; sum the 3D-engine instances (one per
# process using the GPU) the same way Task Manager derives its headline GPU%.
$gpuSamples = (Get-Counter '\GPU Engine(*engtype_3D)\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples
$gpu = 0
if ($gpuSamples) {
  $gpu = ($gpuSamples | Measure-Object -Property CookedValue -Sum).Sum
  if ($gpu -gt 100) { $gpu = 100 }
}

$os = Get-CimInstance Win32_OperatingSystem
# TotalVisibleMemorySize/FreePhysicalMemory are reported in KB; KB / (1024*1024) = GB.
$ramTotalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$ramUsedGB = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB, 1)
$ramPct = if ($os.TotalVisibleMemorySize -gt 0) {
  [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100)
} else { 0 }
$uptimeSeconds = [math]::Round((New-TimeSpan -Start $os.LastBootUpTime -End (Get-Date)).TotalSeconds)

# Bytes Total/sec is an instantaneous rate (no second sample needed); exclude
# virtual/loopback adapters so a VPN or Hyper-V vSwitch doesn't inflate it.
$netSamples = (Get-Counter '\Network Interface(*)\Bytes Total/sec' -ErrorAction SilentlyContinue).CounterSamples
$netBytesPerSec = 0
if ($netSamples) {
  $netBytesPerSec = ($netSamples |
    Where-Object { $_.InstanceName -notmatch 'isatap|Loopback|Teredo|vEthernet' } |
    Measure-Object -Property CookedValue -Sum).Sum
}

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SdForeground {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

# "Now Focused" is just whatever window currently has focus, not
# specifically a game, which works without needing a game-name database.
$activeApp = $null
try {
  $hwnd = [SdForeground]::GetForegroundWindow()
  $procId = 0
  [SdForeground]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
  if ($procId -gt 0) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($proc) { $activeApp = "$($proc.ProcessName).exe" }
  }
} catch {
  $activeApp = $null
}

[PSCustomObject]@{
  cpu = [math]::Round($cpu)
  gpu = [math]::Round($gpu)
  activeApp = $activeApp
  ramPct = $ramPct
  ramUsedGB = $ramUsedGB
  ramTotalGB = $ramTotalGB
  uptimeSeconds = $uptimeSeconds
  netBytesPerSec = [math]::Round($netBytesPerSec)
} | ConvertTo-Json -Compress
