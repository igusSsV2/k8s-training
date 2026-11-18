$ErrorActionPreference = 'Stop'
if ($env:KUBE_LAB_EVENTS -eq '1') {
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    [Console]::OutputEncoding = $OutputEncoding
    $ProgressPreference = 'SilentlyContinue'
}
$LabRoot = $PSScriptRoot
$RepositoryRoot = (Resolve-Path (Join-Path $LabRoot '../..')).Path
$ToolsRoot = Join-Path $RepositoryRoot '.tools/k8s-troubleshooting'
$Kubeconfig = Join-Path $ToolsRoot 'kubeconfig'
$ClusterName = 'k8s-troubleshooting'
$Context = 'kind-k8s-troubleshooting'

function Write-LabStep {
    param([string]$Message)
    if ($env:KUBE_LAB_EVENTS -eq '1') {
        Write-Host ('KUBE_EVENT ' + (@{type='step'; message=$Message} | ConvertTo-Json -Compress))
    }
    else { Write-Host "STEP: $Message" }
}

function Write-LabError {
    param([string]$Message)
    if ($env:KUBE_LAB_EVENTS -eq '1' -and $Message -match 'administrator|onboarding|Switch to Linux|WSL is unavailable|winget is unavailable|complete installation manually|install Docker Desktop using') {
        Write-Host ('KUBE_EVENT ' + (@{type='guidance'; message=$Message} | ConvertTo-Json -Compress))
    }
    Write-Error -Message $Message -ErrorAction Continue
}

function Find-LabTool {
    param([string]$Name)
    $portable = Join-Path $ToolsRoot "$Name.exe"
    if (Test-Path -LiteralPath $portable) { return $portable }
    $command = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    throw "$Name is unavailable. Run Install-Tools.ps1; Docker Desktop must be installed and running with Linux containers."
}

function Invoke-LabTool {
    param([string]$Name, [string[]]$Arguments)
    $tool = Find-LabTool $Name
    $output = & $tool @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Name failed (exit $LASTEXITCODE): $($Arguments -join ' ')" }
    return $output
}

function Invoke-LabKube {
    param([string[]]$Arguments)
    Invoke-LabTool kubectl (@('--kubeconfig', $Kubeconfig, '--context', $Context, '--request-timeout=30s') + $Arguments)
}

function Assert-Lab {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
    Write-Host "PASS: $Message"
}

function Get-ScenarioNumber {
    param([string]$Scenario)
    if ($Scenario -eq 'All') { return @(1, 2, 3) }
    return @([int]$Scenario)
}

function Assert-LabCluster {
    Write-LabStep 'Checking the dedicated cluster and waiting for its node'
    $clusters = @(Invoke-LabTool kind @('get', 'clusters'))
    if ($clusters -notcontains $ClusterName) { throw 'Lab cluster is absent. Run Deploy-Lab.ps1.' }
    if (-not (Test-Path -LiteralPath $Kubeconfig)) {
        $null = Invoke-LabTool kind @('export', 'kubeconfig', '--name', $ClusterName, '--kubeconfig', $Kubeconfig)
    }
    $null = Invoke-LabKube @('wait', '--for=condition=Ready', 'nodes', '--all', '--timeout=180s')
}

function Assert-OwnedNamespace {
    param([string]$Namespace, [switch]$AllowMissing)
    $raw = Invoke-LabKube @('get', 'namespace', $Namespace, '--ignore-not-found', '-o', 'json')
    if (-not $raw) {
        if ($AllowMissing) { return }
        throw "Missing namespace $Namespace"
    }
    $ns = $raw | ConvertFrom-Json
    Assert-Lab ($ns.metadata.labels.'training.kube-together/owner' -eq 'troubleshooting') "Namespace $Namespace belongs to these labs"
}

function Invoke-LabApplyJson {
    param($Resource, [string]$Namespace)
    # A file avoids Windows PowerShell native-pipe encoding issues.
    $file = Join-Path $ToolsRoot ('resource-' + [guid]::NewGuid().ToString('N') + '.json')
    try {
        $Resource | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $file -Encoding UTF8
        Invoke-LabKube @('-n', $Namespace, 'apply', '-f', $file)
    }
    finally { Remove-Item -LiteralPath $file -ErrorAction SilentlyContinue }
}

function Set-LabFault {
    [CmdletBinding(SupportsShouldProcess)]
    param([int]$Scenario)
    $ns = "trouble-$Scenario"
    # Full JSON patches are passed by file for Windows native argument compatibility.
    $patch = switch ($Scenario) {
        1 { @(@{op='replace'; path='/spec/template/spec/containers/0/image'; value='nginx:training-tag-does-not-exist'}) }
        2 { @(@{op='replace'; path='/spec/selector/app'; value='missing'}) }
        3 { @(
            @{op='replace'; path='/spec/strategy'; value=@{type='Recreate'}}
            @{op='replace'; path='/spec/template/spec/containers/0/readinessProbe/httpGet/path'; value='/missing'}
        ) }
    }
    $resource = if ($Scenario -eq 2) { 'service/web' } else { 'deployment/web' }
    if (-not $PSCmdlet.ShouldProcess("$resource in $ns", "Apply training fault for scenario $Scenario")) { return }
    $file = Join-Path $ToolsRoot ('patch-' + [guid]::NewGuid().ToString('N') + '.json')
    try {
        ConvertTo-Json -InputObject @($patch) -Depth 10 | Set-Content -LiteralPath $file -Encoding UTF8
        $null = Invoke-LabKube @('-n', $ns, 'patch', $resource, '--type=json', '--patch-file', $file)
    }
    finally { Remove-Item -LiteralPath $file -ErrorAction SilentlyContinue }
}

function Get-LabSnapshot {
    param([int]$Scenario)
    $ns = "trouble-$Scenario"
    $deployment = Invoke-LabKube @('-n', $ns, 'get', 'deployment', 'web', '-o', 'json') | ConvertFrom-Json
    $service = Invoke-LabKube @('-n', $ns, 'get', 'service', 'web', '-o', 'json') | ConvertFrom-Json
    $pods = Invoke-LabKube @('-n', $ns, 'get', 'pods', '-l', 'app=web', '-o', 'json') | ConvertFrom-Json
    $slices = Invoke-LabKube @('-n', $ns, 'get', 'endpointslices', '-l', 'kubernetes.io/service-name=web', '-o', 'json') | ConvertFrom-Json
    $readyEndpoints = @($slices.items | ForEach-Object { $_.endpoints } | Where-Object { $_ -and $_.conditions.ready -eq $true })
    return @{Deployment=$deployment; Service=$service; Pods=$pods; ReadyEndpoints=$readyEndpoints}
}

function Test-FaultObserved {
    param([int]$Scenario, $Snapshot)
    $container = $Snapshot.Deployment.spec.template.spec.containers[0]
    $observed = $Snapshot.Deployment.status.observedGeneration -ge $Snapshot.Deployment.metadata.generation
    switch ($Scenario) {
        1 {
            $pullFailures = @($Snapshot.Pods.items | ForEach-Object { $_.status.containerStatuses } | Where-Object {
                $_.image -eq 'nginx:training-tag-does-not-exist' -and $_.state.waiting.reason -in @('ErrImagePull', 'ImagePullBackOff')
            })
            return ($observed -and $container.image -eq 'nginx:training-tag-does-not-exist' -and $pullFailures.Count -gt 0)
        }
        2 {
            return ($Snapshot.Service.spec.selector.app -eq 'missing' -and $Snapshot.ReadyEndpoints.Count -eq 0 -and $Snapshot.Deployment.status.readyReplicas -eq 2)
        }
        3 {
            $unready = @($Snapshot.Pods.items | Where-Object {
                $_.spec.containers[0].readinessProbe.httpGet.path -eq '/missing' -and
                @($_.status.containerStatuses | Where-Object { $_.state.running -and -not $_.ready }).Count -gt 0
            })
            return ($observed -and $container.readinessProbe.httpGet.path -eq '/missing' -and $unready.Count -gt 0 -and $Snapshot.ReadyEndpoints.Count -eq 0)
        }
    }
}

function Test-LabHttp {
    param([int]$Scenario, [switch]$ExpectFailure)
    $ns = "trouble-$Scenario"
    $request = "wget -T 5 -qO- http://web.$ns.svc.cluster.local"
    $command = "for attempt in 1 2 3 4 5 6; do if $request; then exit 0; fi; sleep 2; done; exit 1"
    if ($ExpectFailure) { $command = "if $request; then exit 1; else echo expected-unavailable; fi" }
    $job = 'check-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    try {
        $null = Invoke-LabApplyJson @{
            apiVersion='batch/v1'; kind='Job'; metadata=@{name=$job}
            spec=@{backoffLimit=0; activeDeadlineSeconds=90; template=@{spec=@{
                restartPolicy='Never'; containers=@(@{name='http'; image='busybox:1.37.0'; command=@('sh','-c',$command)})
            }}}
        } $ns
        $null = Invoke-LabKube @('-n', $ns, 'wait', '--for=condition=complete', "job/$job", '--timeout=120s')
        $body = (Invoke-LabKube @('-n', $ns, 'logs', "job/$job")) -join "`n"
        $expected = if ($ExpectFailure) { 'expected-unavailable' } else { "Troubleshooting scenario $Scenario" }
        Assert-Lab ($body.Contains($expected)) "Scenario $Scenario HTTP result matches expectation"
    }
    finally {
        $null = Invoke-LabKube @('-n', $ns, 'delete', 'job', $job, '--ignore-not-found', '--wait=false')
    }
}
