$ErrorActionPreference = 'Stop'
$courseRoot = Split-Path $PSScriptRoot -Parent
$required = @('README.md', 'SETUP.md', 'TASKS.md', 'evidence/TEMPLATE.md',
    'manifests/web.yaml', 'manifests/config.yaml', 'manifests/service.yaml',
    'manifests/storage.yaml', 'manifests/rbac.yaml')
foreach ($number in 1..8) { $required += ('labs/{0:D2}.md' -f $number) }
foreach ($relative in $required) {
    $path = Join-Path $courseRoot $relative
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing $relative" }
    if ((Get-Item -LiteralPath $path).Length -eq 0) { throw "Empty $relative" }
}
foreach ($script in Get-ChildItem -LiteralPath $PSScriptRoot -Filter *.ps1) {
    $tokens = $null
    $parseErrors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile(
        $script.FullName, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count -gt 0) { throw ($parseErrors | Out-String) }
}
$checker = Get-Content -Raw (Join-Path $PSScriptRoot 'Check.ps1')
if ($checker -notmatch "kind-k8training" -or $checker -notmatch 'ValidateRange\(1, 8\)') {
    throw 'Runtime checker must restrict lab range and target the training context.'
}
foreach ($manifest in Get-ChildItem (Join-Path $courseRoot 'manifests') -Filter *.yaml) {
    if ((Get-Content -Raw $manifest.FullName).Contains("`t")) {
        throw "YAML must use spaces: $($manifest.Name)"
    }
}
Write-Host 'PASS: required course files, PowerShell syntax, checker guardrails and YAML whitespace.'
Write-Host 'Kubernetes schema and runtime behavior were not validated by this static check.'
