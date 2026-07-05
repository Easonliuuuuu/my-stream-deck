#Requires -Modules AudioDeviceCmdlets

$playback = Get-AudioDevice -List | Where-Object { $_.Type -eq 'Playback' }
$recording = Get-AudioDevice -List | Where-Object { $_.Type -eq 'Recording' }
$defaultPlayback = Get-AudioDevice -Playback
$defaultRecording = Get-AudioDevice -Recording

$result = [PSCustomObject]@{
  output  = @{ current = $defaultPlayback.Name; id = $defaultPlayback.ID }
  input   = @{ current = $defaultRecording.Name; id = $defaultRecording.ID }
  outputs = @($playback | ForEach-Object { @{ name = $_.Name; id = $_.ID } })
  inputs  = @($recording | ForEach-Object { @{ name = $_.Name; id = $_.ID } })
}

$result | ConvertTo-Json -Depth 4
