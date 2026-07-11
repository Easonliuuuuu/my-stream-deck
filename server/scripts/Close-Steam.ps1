param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

# Steam's documented graceful-exit flag — unlike Discord, force-killing
# Steam risks corrupting its local cache/cloud-sync state, so this uses the
# flag instead of Stop-ProcessByName.ps1.
Start-Process -FilePath $Path -ArgumentList '-shutdown'

Write-Output '{"ok":true}'
