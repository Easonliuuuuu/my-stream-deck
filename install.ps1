#Requires -Version 5.1
<#
Bootstraps my-stream-deck on a Windows PC: installs Node.js and the
AudioDeviceCmdlets PowerShell module if missing, downloads the server,
installs its dependencies, and starts it.

Usage (from an ordinary, non-admin PowerShell window):
  irm https://raw.githubusercontent.com/Easonliuuuuu/my-stream-deck/main/install.ps1 | iex
#>

$ErrorActionPreference = 'Stop'

$repo = 'Easonliuuuuu/my-stream-deck'
$installDir = Join-Path $env:LOCALAPPDATA 'my-stream-deck'

function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Confirm-Node {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        Write-Host "Node.js found: $(node --version)" -ForegroundColor Green
        return
    }
    Write-Host 'Node.js not found - installing via winget...' -ForegroundColor Yellow
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw 'winget is not available. Install Node.js LTS manually from https://nodejs.org and re-run this script.'
    }
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
    Update-SessionPath
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js was installed but 'node' isn't on PATH yet. Close and reopen PowerShell, then re-run this script."
    }
}

function Confirm-AudioDeviceCmdlets {
    if (Get-Module -ListAvailable -Name AudioDeviceCmdlets) {
        Write-Host 'AudioDeviceCmdlets already installed' -ForegroundColor Green
        return
    }
    Write-Host 'Installing AudioDeviceCmdlets...' -ForegroundColor Yellow
    if ((Get-PSRepository -Name PSGallery).InstallationPolicy -ne 'Trusted') {
        Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
    }
    Install-Module -Name AudioDeviceCmdlets -Scope CurrentUser -Force
}

function Get-StreamDeckSource {
    if (Test-Path (Join-Path $installDir '.git')) {
        Write-Host "Updating existing install at $installDir..." -ForegroundColor Yellow
        Push-Location $installDir
        git fetch
        $branch = git rev-parse --abbrev-ref HEAD
        git reset --hard "origin/$branch"
        Pop-Location
        return
    }

    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Host "Cloning repo to $installDir..." -ForegroundColor Yellow
        git clone --depth 1 "https://github.com/$repo.git" $installDir
        return
    }

    Write-Host 'Downloading repo (git not found)...' -ForegroundColor Yellow
    $zipPath = Join-Path $env:TEMP 'my-stream-deck.zip'
    $extractDir = Join-Path $env:TEMP 'my-stream-deck-extract'
    Invoke-WebRequest -Uri "https://github.com/$repo/archive/refs/heads/main.zip" -OutFile $zipPath
    if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    $extracted = Get-ChildItem $extractDir -Directory | Select-Object -First 1
    if (Test-Path $installDir) { Remove-Item $installDir -Recurse -Force }
    Move-Item $extracted.FullName $installDir
    Remove-Item $zipPath, $extractDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host '== my-stream-deck installer ==' -ForegroundColor Cyan
Confirm-Node
Confirm-AudioDeviceCmdlets
Get-StreamDeckSource

Push-Location (Join-Path $installDir 'server')
try {
    Write-Host 'Installing server dependencies...' -ForegroundColor Yellow
    npm install
    Write-Host ''
    Write-Host 'Starting server - scan the QR code below with your iPhone Camera app.' -ForegroundColor Cyan
    npm start
}
finally {
    Pop-Location
}
