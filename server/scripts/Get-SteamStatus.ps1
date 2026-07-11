$steamKey = 'HKCU:\Software\Valve\Steam'
$runningAppId = 0
$steamPath = $null

$reg = Get-ItemProperty -Path $steamKey -ErrorAction SilentlyContinue
if ($reg) {
  $runningAppId = [int]$reg.RunningAppID
  $steamPath = $reg.SteamPath
}

# Resolved from the local library's appmanifest_<id>.acf when possible; left
# null if the game lives in a different Steam library folder than the main
# one, in which case the caller falls back to showing the raw app id.
$gameName = $null
if ($runningAppId -gt 0 -and $steamPath) {
  $manifestPath = Join-Path $steamPath "steamapps\appmanifest_$runningAppId.acf"
  if (Test-Path $manifestPath) {
    $content = Get-Content $manifestPath -Raw
    if ($content -match '"name"\s*"([^"]+)"') {
      $gameName = $Matches[1]
    }
  }
}

[PSCustomObject]@{
  runningAppId = $runningAppId
  gameName     = $gameName
} | ConvertTo-Json -Compress
