param([ValidateRange(1024, 65535)][int]$Port = 8787)
$ErrorActionPreference = 'Stop'
try {
    $address = "http://127.0.0.1:$Port"
    $health = Invoke-RestMethod -Uri "$address/api/health" -TimeoutSec 3
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $instance = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($PSScriptRoot.ToLowerInvariant())))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose() }
    if ($health.application -ne 'kube-together' -or $health.instance -ne $instance) { throw 'This port belongs to a different application or checkout.' }
    $session = Invoke-RestMethod -Uri "$address/api/session" -TimeoutSec 3
    $null = Invoke-RestMethod -Uri "$address/api/shutdown" -Method Post -ContentType 'application/json' -Body '{}' -Headers @{Origin=$address; 'X-Lab-Token'=$session.token} -TimeoutSec 3
    Write-Host 'Local service stopped. The cluster and your learner progress remain available.'
    exit 0
}
catch { Write-Error "Could not stop the local service: $($_.Exception.Message). An active operation must finish first." -ErrorAction Continue; exit 1 }
