param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 8)]
    [int]$Lab
)
$ErrorActionPreference = 'Stop'
$Context = 'kind-k8training'
$Namespace = 'k8training'

function Invoke-Kube {
    param([string[]]$Arguments)
    $result = & kubectl --context $Context -n $Namespace @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "kubectl failed: $($Arguments -join ' ')"
    }
    return $result
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
    Write-Host "PASS: $Message"
}

function Test-Http {
    $probeName = 'http-check-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    try {
        # A Job preserves exit status; inspect its result before deleting it.
        $null = Invoke-Kube -Arguments @(
            'create', 'job', $probeName, '--image=busybox:1.37.0', '--',
            'sh', '-c', 'wget -T 10 -qO- http://web.k8training.svc.cluster.local'
        )
        $null = Invoke-Kube -Arguments @(
            'wait', '--for=condition=complete', "job/$probeName", '--timeout=90s'
        )
        $body = (Invoke-Kube -Arguments @('logs', "job/$probeName")) -join "`n"
        Assert-True ($body -match '<h1>') 'Service DNS and HTTP return the course page'
        Write-Host $body
    }
    finally {
        & kubectl --context $Context -n $Namespace delete job $probeName --ignore-not-found --wait=false | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Warning "Could not clean up $probeName" }
    }
}

function Test-Storage {
    $null = Invoke-Kube -Arguments @(
        'wait', '--for=condition=complete', 'job/write-journal', '--timeout=120s'
    )
    $null = Invoke-Kube -Arguments @(
        'wait', '--for=condition=Ready', 'pod/journal-reader', '--timeout=120s'
    )
    $claim = (Invoke-Kube -Arguments @('get', 'pvc', 'journal', '-o', 'json')) | ConvertFrom-Json
    Assert-True ($claim.status.phase -eq 'Bound') 'Journal PVC is Bound'
    $note = (Invoke-Kube -Arguments @('exec', 'journal-reader', '--', 'cat', '/data/note')) -join ''
    Assert-True ($note.Trim() -eq 'learned-together') 'Reader can read persisted journal data'
}

function Test-Rbac {
    $identity = '--as=system:serviceaccount:k8training:observer'
    # auth can-i returns exit 1 for an expected denial, so capture it directly.
    $allowed = & kubectl --context $Context -n $Namespace auth can-i list pods $identity
    $allowedExit = $LASTEXITCODE
    Assert-True ($allowedExit -eq 0 -and "$allowed".Trim() -eq 'yes') 'Observer can list Pods'
    foreach ($operation in @(@('get', 'secrets'), @('delete', 'pods'))) {
        $denied = & kubectl --context $Context -n $Namespace auth can-i $operation[0] $operation[1] $identity
        $deniedExit = $LASTEXITCODE
        Assert-True ($deniedExit -eq 1 -and "$denied".Trim() -eq 'no') "Observer cannot $($operation -join ' ')"
    }
}

try {
    if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
        throw 'kubectl is missing from PATH. Follow training/SETUP.md.'
    }
    $nodes = (Invoke-Kube -Arguments @('get', 'nodes', '-o', 'json')) | ConvertFrom-Json
    Assert-True (@($nodes.items).Count -gt 0) 'Cluster has nodes'
    foreach ($node in $nodes.items) {
        $ready = @($node.status.conditions | Where-Object { $_.type -eq 'Ready' -and $_.status -eq 'True' })
        Assert-True ($ready.Count -eq 1) "Node $($node.metadata.name) is Ready"
    }
    $null = Invoke-Kube -Arguments @('rollout', 'status', 'deployment/web', '--timeout=120s')
    $web = (Invoke-Kube -Arguments @('get', 'deployment', 'web', '-o', 'json')) | ConvertFrom-Json
    Assert-True ($web.spec.replicas -ge 2 -and $web.status.readyReplicas -eq $web.spec.replicas) 'All desired web replicas are Ready'
    if ($Lab -eq 2) {
        Assert-True ($web.spec.replicas -eq 3) 'Scaling exercise ends with three replicas'
    }
    if ($Lab -ge 3) { Test-Http }
    if ($Lab -ge 4) {
        $null = Invoke-Kube -Arguments @('get', 'secret', 'practice', '-o', 'name')
        Write-Host 'PASS: practice Secret exists (value not displayed)'
    }
    if ($Lab -ge 5) {
        $container = $web.spec.template.spec.containers | Where-Object { $_.name -eq 'web' }
        Assert-True ($container.readinessProbe.httpGet.path -eq '/') 'Readiness checks the working path'
        Assert-True ($null -ne $container.livenessProbe.httpGet) 'HTTP liveness probe exists'
        Assert-True ($null -ne $container.resources.requests.cpu -and $null -ne $container.resources.limits.memory) 'Resource request and memory limit exist'
    }
    if ($Lab -ge 6) { Test-Storage }
    if ($Lab -ge 7) { Test-Rbac }
    Write-Host "Lab $Lab runtime checks passed. Complete the manual evidence checks too."
    exit 0
}
catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
}
