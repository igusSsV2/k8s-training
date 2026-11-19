$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$executable = Join-Path $repoRoot '.tools/quality/actionlint.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw 'Run scripts/quality/Setup-QualityTools.ps1 first.' }
& $executable -color
exit $LASTEXITCODE
