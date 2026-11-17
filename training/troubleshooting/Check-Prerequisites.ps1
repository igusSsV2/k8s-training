param([switch]$CheckNetwork)
. "$PSScriptRoot/Prerequisites.ps1"
try {
    Update-DockerPath
    $checks = @(Get-PrerequisiteReport)
    foreach ($check in $checks) {
        $status = if ($check.Ready) { 'PASS' } else { 'MISSING' }
        Write-Host "$status`: $($check.Name)"
        if (-not $check.Ready) { Write-Host "  $($check.Detail)" }
    }
    $drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($RepositoryRoot).Substring(0, 1))
    if ($drive.Free -lt 15GB) { Write-Warning 'Less than the recommended 15 GB of disk space is free.' }
    if ($CheckNetwork) {
        foreach ($url in @(
            'https://github.com/kubernetes-sigs/kind/releases/download/v0.31.0/kind-windows-amd64.sha256sum',
            'https://dl.k8s.io/release/v1.35.0/bin/windows/amd64/kubectl.exe.sha256'
        )) {
            & curl.exe --fail --silent --show-error --location --head --connect-timeout 10 --max-time 20 $url | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Tool download endpoint is unreachable: $url" }
        }
        Write-Host 'PASS: tool download endpoints reachable. Container registry access is verified during deployment.'
    }
    Assert-PrerequisiteReport $checks
    Write-Host 'All prerequisites ready. Run Setup-Lab.ps1 to deploy, or Deploy-Lab.ps1 to reset scenarios.'
    exit 0
}
catch { Write-Error $_.Exception.Message -ErrorAction Continue; exit 1 }
