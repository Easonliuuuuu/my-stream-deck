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

[PSCustomObject]@{
  cpu = [math]::Round($cpu)
  gpu = [math]::Round($gpu)
} | ConvertTo-Json -Compress
