param(
    [ValidateSet('All', '1', '2', '3')][string]$Scenario = 'All',
    [ValidateSet('Broken', 'Healthy')][string]$State = 'Healthy'
)
. "$PSScriptRoot/Common.ps1"
try {
    Assert-LabCluster
    foreach ($number in (Get-Scenarios $Scenario)) {
        Write-LabStep "Checking scenario $number ($State state)"
        $ns = "trouble-$number"
        Assert-OwnedNamespace $ns
        if ($State -eq 'Broken') {
            $deadline = (Get-Date).AddSeconds(180)
            do {
                $snapshot = Get-LabSnapshot $number
                $observed = Test-FaultObserved $number $snapshot
                if ($observed) { break }
                Start-Sleep -Seconds 3
            } while ((Get-Date) -lt $deadline)
            Assert-Lab $observed "Scenario $number intended fault is observable"
            # A failed rolling release keeps the old replicas serving traffic.
            Test-LabHttp $number -ExpectFailure:($number -ne 1)
        }
        else {
            $null = Invoke-LabKube @('-n', $ns, 'rollout', 'status', 'deployment/web', '--timeout=120s')
            $endpointDeadline = (Get-Date).AddSeconds(30)
            do {
                $snapshot = Get-LabSnapshot $number
                if ($snapshot.ReadyEndpoints.Count -eq 2) { break }
                Start-Sleep -Seconds 2
            } while ((Get-Date) -lt $endpointDeadline)
            $deployment = $snapshot.Deployment
            Assert-Lab ($deployment.spec.replicas -eq 2 -and $deployment.status.readyReplicas -eq 2 -and
                $deployment.status.updatedReplicas -eq 2 -and $deployment.status.replicas -eq 2) "Scenario $number has two updated Ready replicas"
            Assert-Lab ($snapshot.ReadyEndpoints.Count -eq 2) "Scenario $number Service has two Ready endpoints"
            $container = $deployment.spec.template.spec.containers[0]
            Assert-Lab ($container.readinessProbe.httpGet.path -eq '/' -and $container.livenessProbe.httpGet.path -eq '/') "Scenario $number preserves working readiness and liveness probes"
            Test-LabHttp $number
        }
    }
    Write-Host "$State checks passed. Explain your evidence to complete the exercise."
    exit 0
}
catch { Write-LabError $_.Exception.Message; exit 1 }
