param(
    [ValidateSet('All', '1', '2', '3')][string]$Scenario = 'All',
    [switch]$DeleteCluster
)
. "$PSScriptRoot/Common.ps1"
try {
    if ($DeleteCluster -and $Scenario -ne 'All') { throw '-DeleteCluster requires -Scenario All.' }
    $clusters = @(Invoke-LabTool kind @('get', 'clusters'))
    if ($clusters -notcontains $ClusterName) { Write-Host 'Lab cluster is already absent.'; exit 0 }
    if ($DeleteCluster) {
        $null = Invoke-LabTool kind @('delete', 'cluster', '--name', $ClusterName, '--kubeconfig', $Kubeconfig)
        Remove-Item -LiteralPath $Kubeconfig -ErrorAction SilentlyContinue
    }
    else {
        Assert-LabCluster
        # Validate every target before beginning deletion.
        foreach ($number in (Get-Scenarios $Scenario)) { Assert-OwnedNamespace "trouble-$number" -AllowMissing }
        foreach ($number in (Get-Scenarios $Scenario)) {
            $null = Invoke-LabKube @('delete', 'namespace', "trouble-$number", '--ignore-not-found', '--timeout=120s')
        }
    }
    Write-Host 'Requested lab resources removed.'
    exit 0
}
catch { Write-Error $_.Exception.Message -ErrorAction Continue; exit 1 }
