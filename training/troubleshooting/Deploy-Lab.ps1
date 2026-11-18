param(
    [ValidateSet('All', '1', '2', '3')][string]$Scenario = 'All'
)
. "$PSScriptRoot/Common.ps1"
$NodeImage = 'kindest/node:v1.35.0@sha256:452d707d4862f52530247495d180205e029056831160e22870e37e3f6c1ac31f'
try {
    Write-LabStep 'Checking Docker before deployment'
    $null = New-Item -ItemType Directory -Path $ToolsRoot -Force
    $os = (Invoke-LabTool docker @('info', '--format', '{{.OSType}}')) -join ''
    Assert-Lab ($os.Trim() -eq 'linux') 'Docker daemon runs Linux containers'
    $clusters = @(Invoke-LabTool kind @('get', 'clusters'))
    if ($clusters -notcontains $ClusterName) {
        Write-LabStep 'Creating the dedicated Kubernetes cluster'
        $null = Invoke-LabTool kind @('create', 'cluster', '--name', $ClusterName, '--image', $NodeImage,
            '--kubeconfig', $Kubeconfig, '--wait', '180s')
    }
    Assert-LabCluster
    foreach ($number in (Get-ScenarioNumber $Scenario)) {
        Write-LabStep "Deploying the healthy baseline for scenario $number"
        $ns = "trouble-$number"
        Assert-OwnedNamespace $ns -AllowMissing
        $null = Invoke-LabApplyJson @{
            apiVersion='v1'; kind='Namespace'; metadata=@{name=$ns; labels=@{'training.kube-together/owner'='troubleshooting'}}
        } $ns
        $null = Invoke-LabKube @('-n', $ns, 'apply', '-f', (Join-Path $LabRoot 'baseline.yaml'))
        $null = Invoke-LabApplyJson @{
            apiVersion='v1'; kind='ConfigMap'; metadata=@{name='web-content'}
            data=@{'index.html'="<h1>Troubleshooting scenario $number</h1>"}
        } $ns
        $null = Invoke-LabKube @('-n', $ns, 'rollout', 'restart', 'deployment/web')
        $null = Invoke-LabKube @('-n', $ns, 'rollout', 'status', 'deployment/web', '--timeout=180s')
        Write-LabStep "Verifying scenario $number baseline over HTTP"
        Test-LabHttp $number
        Write-LabStep "Preparing scenario $number for troubleshooting"
        Set-LabFault $number
    }
    & "$PSScriptRoot/Check-Lab.ps1" -Scenario $Scenario -State Broken
    if ($LASTEXITCODE -ne 0) { throw 'Fault verification failed.' }
    Write-Host 'Labs are deployed and deliberately broken. Read README.md for your incident briefs.'
    exit 0
}
catch { Write-LabError $_.Exception.Message; exit 1 }
