$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$toolRoot = Join-Path $repoRoot '.tools/quality'
$null = New-Item -ItemType Directory -Path $toolRoot -Force

function Get-Sha256Digest {
    param([string]$Path)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try { return [BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $sha256.Dispose() }
}

function Expand-QualityArchive {
    param([string]$Archive, [string]$Destination)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($Archive, $Destination)
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    $managedPython = Get-ChildItem -LiteralPath (Join-Path $repoRoot '.tools/python') -Filter python.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($managedPython) { $python = [pscustomobject]@{ Source = $managedPython.FullName } }
}
if (-not $python) { throw 'Python 3.13 is required for yamllint. Install Python and retry.' }
$venv = Join-Path $toolRoot 'python'
$venvPython = Join-Path $venv 'Scripts/python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) {
    & $python.Source -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated quality-tool Python environment.' }
}
& $venvPython -m pip install --disable-pip-version-check --requirement (Join-Path $repoRoot 'requirements-quality.txt')
if ($LASTEXITCODE -ne 0) { throw 'Could not install pinned yamllint 1.38.0.' }

$actionlintVersion = '1.7.12'
$actionlintPath = Join-Path $toolRoot 'actionlint.exe'
$actionlintZip = Join-Path $toolRoot "actionlint_$($actionlintVersion)_windows_amd64.zip"
$actionlintUrl = "https://github.com/rhysd/actionlint/releases/download/v$actionlintVersion/actionlint_$($actionlintVersion)_windows_amd64.zip"
$expectedHash = '6E7241B51E6817EA6A047693D8E6FED13B31819C9A0DD6C5A726E1592D22F6E9'
if (-not (Test-Path -LiteralPath $actionlintPath)) {
    Invoke-WebRequest -Uri $actionlintUrl -OutFile $actionlintZip
    $actualHash = Get-Sha256Digest $actionlintZip
    if ($actualHash -ne $expectedHash) { Remove-Item -LiteralPath $actionlintZip -Force; throw 'actionlint archive checksum did not match the pinned release.' }
    $extractRoot = Join-Path $toolRoot ('actionlint-extract-' + [guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $extractRoot
    Expand-QualityArchive $actionlintZip $extractRoot
    Move-Item -LiteralPath (Join-Path $extractRoot 'actionlint.exe') -Destination $actionlintPath -Force
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
    Remove-Item -LiteralPath $actionlintZip -Force
}

$moduleRoot = Join-Path $toolRoot 'Modules'
$analyzerPath = Join-Path $moduleRoot 'PSScriptAnalyzer/1.24.0/PSScriptAnalyzer.psd1'
if (-not (Test-Path -LiteralPath $analyzerPath)) {
    $analyzerDirectory = Split-Path $analyzerPath -Parent
    $analyzerArchive = Join-Path $toolRoot 'PSScriptAnalyzer.1.24.0.zip'
    $analyzerUrl = 'https://github.com/PowerShell/PSScriptAnalyzer/releases/download/1.24.0/PSScriptAnalyzer.1.24.0.nupkg'
    $expectedAnalyzerHash = 'E86C97D44BB1BC8A1DE35E753B85EA1D938F6F9F881639A181507E079BCA4556'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $analyzerUrl -OutFile $analyzerArchive -UseBasicParsing -TimeoutSec 180
    $actualAnalyzerHash = Get-Sha256Digest $analyzerArchive
    if ($actualAnalyzerHash -ne $expectedAnalyzerHash) { Remove-Item -LiteralPath $analyzerArchive -Force; throw 'PSScriptAnalyzer archive checksum did not match the pinned release.' }
    $extractRoot = Join-Path $toolRoot ('psscriptanalyzer-extract-' + [guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $extractRoot
    Expand-QualityArchive $analyzerArchive $extractRoot
    $null = New-Item -ItemType Directory -Path $analyzerDirectory -Force
    Get-ChildItem -LiteralPath $extractRoot | Move-Item -Destination $analyzerDirectory -Force
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
    Remove-Item -LiteralPath $analyzerArchive -Force
}
Write-Host 'Quality tools ready: yamllint 1.38.0, actionlint 1.7.12, PSScriptAnalyzer 1.24.0.'
