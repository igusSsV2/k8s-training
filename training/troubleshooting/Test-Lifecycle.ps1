# Live acceptance test: creates, repairs, checks, resets and removes the three labs.
# Leaves the dedicated cluster running. Use Delete-Lab.ps1 -DeleteCluster to remove it.
. "$PSScriptRoot/Common.ps1"
try {
    & "$PSScriptRoot/Deploy-Lab.ps1"
    if ($LASTEXITCODE -ne 0) { throw 'Deployment acceptance failed' }
    foreach ($number in 1..3) {
        # baseline.yaml is also the instructor recovery reference.
        $null = Invoke-LabKube @('-n', "trouble-$number", 'apply', '-f', (Join-Path $LabRoot 'baseline.yaml'))
        $null = Apply-LabJson @{
            apiVersion='v1'; kind='ConfigMap'; metadata=@{name='web-content'}
            data=@{'index.html'="<h1>Troubleshooting scenario $number</h1>"}
        } "trouble-$number"
        $null = Invoke-LabKube @('-n', "trouble-$number", 'rollout', 'restart', 'deployment/web')
    }
    & "$PSScriptRoot/Check-Lab.ps1" -State Healthy
    if ($LASTEXITCODE -ne 0) { throw 'Recovery acceptance failed' }
    & "$PSScriptRoot/Deploy-Lab.ps1" -Scenario 2
    if ($LASTEXITCODE -ne 0) { throw 'Reset acceptance failed' }
    foreach ($number in @(1, 3)) {
        & "$PSScriptRoot/Check-Lab.ps1" -Scenario $number -State Healthy
        if ($LASTEXITCODE -ne 0) { throw "Reset affected scenario $number" }
    }
    & "$PSScriptRoot/Delete-Lab.ps1"
    if ($LASTEXITCODE -ne 0) { throw 'Cleanup acceptance failed' }
    foreach ($number in 1..3) {
        $remaining = Invoke-LabKube @('get', 'namespace', "trouble-$number", '--ignore-not-found', '-o', 'name')
        Assert-Lab (-not $remaining) "Scenario $number namespace removed"
    }
    & "$PSScriptRoot/Delete-Lab.ps1"
    if ($LASTEXITCODE -ne 0) { throw 'Repeated cleanup failed' }
    Write-Host 'Live lifecycle passed. Run Deploy-Lab.ps1 again to leave exercises ready.'
    exit 0
}
catch { Write-Error $_.Exception.Message -ErrorAction Continue; exit 1 }
