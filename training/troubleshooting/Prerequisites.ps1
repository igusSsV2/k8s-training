# Host checks shared by the read-only checker and setup script.
. "$PSScriptRoot/Common.ps1"

function Invoke-HostProbe {
    param([string]$Path, [string[]]$Arguments)
    # Windows PowerShell converts native stderr to ErrorRecords even on exit 0.
    # A diagnostic probe must decide from the actual process exit code.
    $ErrorActionPreference = 'Continue'
    $output = & $Path @Arguments 2>&1
    return @{ExitCode=$LASTEXITCODE; Text=(($output | ForEach-Object { "$_" }) -join "`n")}
}

function Find-DockerDesktop {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/Docker Desktop.exe'),
        (Join-Path $env:ProgramFiles 'Docker/Docker/Docker Desktop.exe')
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    return $null
}

function Get-PrerequisiteReport {
    $checks = @()
    $checks += [pscustomobject]@{Name='Windows x64'; Ready=($env:OS -eq 'Windows_NT' -and $env:PROCESSOR_ARCHITECTURE -eq 'AMD64'); Detail='These portable tools require Windows x64.'}
    $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
    $wslReady = $false
    if ($wsl) {
        $probe = Invoke-HostProbe $wsl.Source @('--status')
        $wslReady = $probe.ExitCode -eq 0
    }
    $checks += [pscustomobject]@{Name='WSL'; Ready=$wslReady; Detail='If missing, run Setup-Lab.ps1 from an administrator terminal; reboot if requested.'}
    $docker = Get-Command docker.exe -ErrorAction SilentlyContinue
    $checks += [pscustomobject]@{Name='Docker CLI'; Ready=($null -ne $docker); Detail='Setup-Lab.ps1 can install Docker Desktop and refresh this process PATH.'}
    $linux = $false
    if ($docker) {
        $probe = Invoke-HostProbe $docker.Source @('info', '--format', '{{.OSType}}')
        $linux = $probe.ExitCode -eq 0 -and $probe.Text.Trim() -eq 'linux'
    }
    $checks += [pscustomobject]@{Name='Docker Linux engine'; Ready=$linux; Detail='Start Docker Desktop, finish onboarding, and select Linux containers.'}
    foreach ($name in @('kind', 'kubectl')) {
        $ready = $false
        try {
            $tool = Find-LabTool $name
            $arguments = if ($name -eq 'kind') { @('version') } else { @('version', '--client') }
            $probe = Invoke-HostProbe $tool $arguments
            $ready = $probe.ExitCode -eq 0
        }
        catch { $ready = $false }
        $checks += [pscustomobject]@{Name=$name; Ready=$ready; Detail='Install-Tools.ps1 downloads the pinned portable tool and verifies its checksum.'}
    }
    return $checks
}

function Assert-PrerequisiteReport {
    param([object[]]$Checks)
    $missing = @($Checks | Where-Object { -not $_.Ready })
    if ($missing.Count -gt 0) { throw ('Prerequisites not ready: ' + (($missing | ForEach-Object { $_.Name }) -join ', ')) }
}

function Update-DockerPath {
    $desktop = Find-DockerDesktop
    if ($desktop) {
        $bin = Join-Path (Split-Path $desktop -Parent) 'resources/bin'
        if (Test-Path -LiteralPath (Join-Path $bin 'docker.exe')) { $env:PATH = "$bin;$env:PATH" }
    }
}

function Start-LabDocker {
    Update-DockerPath
    $desktop = Find-DockerDesktop
    if (-not $desktop) { throw 'Docker Desktop is not installed in a supported location.' }
    $docker = Get-Command docker.exe -ErrorAction SilentlyContinue
    if (-not $docker) { throw 'Docker CLI was not found after installation.' }
    $probe = Invoke-HostProbe $docker.Source @('info', '--format', '{{.OSType}}')
    if ($probe.ExitCode -eq 0 -and $probe.Text.Trim() -eq 'linux') { return }
    if ($probe.ExitCode -eq 0 -and $probe.Text.Trim() -eq 'windows') {
        throw 'Docker is using Windows containers. Select Switch to Linux containers in Docker Desktop, then rerun setup.'
    }
    Write-Host 'Starting Docker Desktop; waiting up to three minutes for its Linux engine.'
    Start-Process -FilePath $desktop -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(180)
    do {
        Start-Sleep -Seconds 3
        $probe = Invoke-HostProbe $docker.Source @('info', '--format', '{{.OSType}}')
        if ($probe.ExitCode -eq 0 -and $probe.Text.Trim() -eq 'linux') { return }
    } while ((Get-Date) -lt $deadline)
    throw 'Docker did not become ready. Open Docker Desktop to complete onboarding or inspect its WSL error, then rerun setup.'
}
