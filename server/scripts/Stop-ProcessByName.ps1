param(
  [Parameter(Mandatory = $true)]
  [string]$ProcessName
)

# Force-kill every process matching this name, not just the first/main one —
# Electron apps (Discord included) run as several same-named processes
# (renderer, GPU, utility), and a normal window close on just one of them
# leaves the rest running (Discord in particular minimizes to the system
# tray on a plain window close rather than exiting).
Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Output '{"ok":true}'
