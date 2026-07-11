param(
  [Parameter(Mandatory = $true)]
  [string]$ProcessName
)

$proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1

[PSCustomObject]@{
  running = [bool]$proc
} | ConvertTo-Json -Compress
