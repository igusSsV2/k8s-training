param(
    [ValidateRange(1024, 65535)][int]$Port = 8787,
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
try {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { throw 'Install Node.js 22 or newer from https://nodejs.org/, then rerun this launcher.' }
    $major = & $node.Source -p 'process.versions.node.match(/^[0-9]+/)[0]'
    if ($LASTEXITCODE -ne 0 -or [int]$major -lt 22) { throw 'Node.js 22 or newer is required.' }
    $address = "http://127.0.0.1:$Port"
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $instance = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($PSScriptRoot.ToLowerInvariant())))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose() }
    $existing = $null
    try { $existing = Invoke-RestMethod -Uri "$address/api/health" -TimeoutSec 2 } catch { }
    if ($existing -and ($existing.application -ne 'kube-together' -or $existing.instance -ne $instance)) {
        throw "Port $Port belongs to another application/checkout. Use -Port with a different port."
    }
    if (-not $existing) {
        $stateRoot = Join-Path $PSScriptRoot '.tools/frontend'
        $null = New-Item -ItemType Directory -Path $stateRoot -Force
        $env:KUBE_TOGETHER_PORT = "$Port"
        $script = Join-Path $PSScriptRoot 'server/index.cjs'
        $child = Start-Process -FilePath $node.Source -ArgumentList @('"' + $script + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateRoot "server-$Port.log") -RedirectStandardError (Join-Path $stateRoot "server-$Port.error.log")
        $deadline = (Get-Date).AddSeconds(20)
        do {
            Start-Sleep -Milliseconds 300
            try { $existing = Invoke-RestMethod -Uri "$address/api/health" -TimeoutSec 2 } catch { }
            if ($child.HasExited) { throw "Local service stopped. Inspect .tools/frontend/server-$Port.error.log (the port may be occupied)." }
        } while (-not $existing -and (Get-Date) -lt $deadline)
        if (-not $existing -or $existing.instance -ne $instance) { throw 'The local service did not become ready. Inspect .tools/frontend logs.' }
    }
    Write-Host "Kube Together is ready at $address"
    Write-Host 'Your existing browser progress can be transferred with Export progress / Import backup.'
    if (-not $NoBrowser) { Start-Process $address }
    exit 0
}
catch { Write-Error $_.Exception.Message -ErrorAction Continue; exit 1 }
