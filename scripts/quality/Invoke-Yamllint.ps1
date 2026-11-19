$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$python = Join-Path $repoRoot '.tools/quality/python/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Run scripts/quality/Setup-QualityTools.ps1 first.' }
& $python -m yamllint -s (Join-Path $repoRoot '.github') (Join-Path $repoRoot 'training/manifests') (Join-Path $repoRoot 'training/troubleshooting')
exit $LASTEXITCODE
