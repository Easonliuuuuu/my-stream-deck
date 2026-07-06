param([string]$Action)

switch ($Action) {
    'lock'  { Start-Process 'rundll32.exe' -ArgumentList 'user32.dll,LockWorkStation' -NoNewWindow }
    'sleep' {
        Add-Type -Assembly System.Windows.Forms
        [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)
    }
    default { Write-Error "Unknown system action: $Action"; exit 1 }
}
