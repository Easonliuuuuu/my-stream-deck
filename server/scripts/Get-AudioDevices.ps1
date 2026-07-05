#Requires -Modules AudioDeviceCmdlets

# Windows PowerShell defaults redirected stdout to the system's legacy OEM
# codepage, which mangles non-ASCII device names. Force UTF-8 so Node reads
# the JSON correctly.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# AudioDeviceCmdlets' own .Name property is unreliable for non-Latin jack
# names (observed: Chinese jack names like "喇叭"/"麥克風" silently corrupted
# before the string ever reaches this script — most likely an ANSI marshaling
# bug inside that module). Its device ID is untouched, so the correct jack
# name is read straight from the registry (the authoritative source Windows
# itself uses) using that ID. The registry only holds the jack name though,
# not the "(Product Name)" suffix that distinguishes devices sharing a jack
# name, so that suffix is parsed out of .Name (which is always plain ASCII in
# practice) and reattached.
$PKEY_FriendlyName = '{a45c254e-df1c-4efd-8020-67d146a850e0},2'

function Get-RegistryJackName($id) {
  if ($id -match '^\{0\.0\.(\d)\.[0-9a-fA-F]+\}\.\{([0-9a-fA-F-]+)\}$') {
    $flow = if ($matches[1] -eq '0') { 'Render' } else { 'Capture' }
    $guid = $matches[2]
    $regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\$flow\{$guid}\Properties"
    try {
      $value = (Get-ItemProperty -Path $regPath -Name $PKEY_FriendlyName -ErrorAction Stop).$PKEY_FriendlyName
      if ($value) { return $value }
    } catch {
      Write-Verbose "No registry jack name for $id : $($_.Exception.Message)"
    }
  }
  return $null
}

function Get-DisplayName($id, $cmdletName) {
  $jackName = Get-RegistryJackName $id
  if (-not $jackName) { return $cmdletName }
  if ($cmdletName -match '\(([^)]+)\)\s*$') {
    return "$jackName ($($matches[1]))"
  }
  return $jackName
}

$playback = Get-AudioDevice -List | Where-Object { $_.Type -eq 'Playback' }
$recording = Get-AudioDevice -List | Where-Object { $_.Type -eq 'Recording' }
$defaultPlayback = Get-AudioDevice -Playback
$defaultRecording = Get-AudioDevice -Recording

$result = [PSCustomObject]@{
  output  = @{ current = (Get-DisplayName $defaultPlayback.ID $defaultPlayback.Name); id = $defaultPlayback.ID }
  input   = @{ current = (Get-DisplayName $defaultRecording.ID $defaultRecording.Name); id = $defaultRecording.ID }
  outputs = @($playback | ForEach-Object { @{ name = (Get-DisplayName $_.ID $_.Name); id = $_.ID } })
  inputs  = @($recording | ForEach-Object { @{ name = (Get-DisplayName $_.ID $_.Name); id = $_.ID } })
}

$result | ConvertTo-Json -Depth 4
