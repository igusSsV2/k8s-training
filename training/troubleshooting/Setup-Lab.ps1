param(
    [ValidateSet('All', '1', '2', '3')][string]$Scenario = 'All',
    [switch]$PrerequisitesOnly
)
. "$PSScriptRoot/Prerequisites.ps1"
try {
    Write-LabStep 'Checking Windows and WSL prerequisites'
    if ($env:OS -ne 'Windows_NT' -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'This setup supports Windows x64.' }
    $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
    if (-not $wsl) { throw 'WSL is unavailable. Install WSL 2 using the course SETUP.md, restart Windows, and rerun this script.' }
    $wslProbe = Invoke-HostProbe $wsl.Source @('--status')
    if ($wslProbe.ExitCode -ne 0) {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
            throw 'WSL needs installation. Rerun Setup-Lab.ps1 in PowerShell as administrator; setup will not elevate itself.'
        }
        & $wsl.Source --install --no-distribution
        if ($LASTEXITCODE -notin @(0, 3010)) { throw 'WSL installation failed. See course SETUP.md.' }
        Write-Host 'WSL installation requested. Restart Windows, then rerun Setup-Lab.ps1. No reboot is performed automatically.'
        exit 2
    }
    if (-not (Find-DockerDesktop)) {
        Write-LabStep 'Installing Docker Desktop'
        $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
        if (-not $winget) { throw 'winget is unavailable. Install Docker Desktop using the official link in SETUP.md, then rerun setup.' }
        & $winget.Source install --exact --id Docker.DockerDesktop --source winget --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
        $installExit = $LASTEXITCODE
        if ($installExit -eq 3010) { Write-Host 'Docker installation requires a Windows restart. Rerun setup afterward.'; exit 2 }
        if ($installExit -ne 0) { throw "Docker Desktop installation failed (exit $installExit). Complete installation manually, then rerun setup." }
    }
    Start-LabDocker
    Write-LabStep 'Installing or verifying local Kubernetes tools'
    & "$PSScriptRoot/Install-Tools.ps1"
    if ($LASTEXITCODE -ne 0) { throw 'Portable tool installation failed.' }
    & "$PSScriptRoot/Check-Prerequisites.ps1" -CheckNetwork
    if ($LASTEXITCODE -ne 0) { throw 'Prerequisite validation failed.' }
    if (-not $PrerequisitesOnly) {
        & "$PSScriptRoot/Deploy-Lab.ps1" -Scenario $Scenario
        if ($LASTEXITCODE -ne 0) { throw 'Lab deployment failed.' }
    }
    Write-Host 'Setup complete.'
    exit 0
}
catch { Write-LabError $_.Exception.Message; exit 1 }
