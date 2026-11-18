$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$toolRoot = Join-Path $repoRoot '.tools/quality'
$null = New-Item -ItemType Directory -Path $toolRoot -Force

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
    $actualHash = (Get-FileHash -LiteralPath $actionlintZip -Algorithm SHA256).Hash
    if ($actualHash -ne $expectedHash) { Remove-Item -LiteralPath $actionlintZip -Force; throw 'actionlint archive checksum did not match the pinned release.' }
    Expand-Archive -LiteralPath $actionlintZip -DestinationPath $toolRoot -Force
    Remove-Item -LiteralPath $actionlintZip -Force
}

$moduleRoot = Join-Path $toolRoot 'Modules'
$analyzerPath = Join-Path $moduleRoot 'PSScriptAnalyzer/1.24.0/PSScriptAnalyzer.psd1'
if (-not (Test-Path -LiteralPath $analyzerPath)) {
    $null = New-Item -ItemType Directory -Path $moduleRoot -Force
    $cachedAnalyzer = Join-Path $repoRoot '.tools/psmodules/PSScriptAnalyzer/1.24.0'
    if (Test-Path -LiteralPath $cachedAnalyzer) {
        Copy-Item -LiteralPath $cachedAnalyzer -Destination (Join-Path $moduleRoot 'PSScriptAnalyzer/1.24.0') -Recurse
    } else {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
        Install-Module -Name PSScriptAnalyzer -RequiredVersion 1.24.0 -Scope CurrentUser -Force -Confirm:$false
        $installedAnalyzer = Get-Module -ListAvailable PSScriptAnalyzer | Where-Object { $_.Version -eq [version]'1.24.0' } | Select-Object -First 1
        if (-not $installedAnalyzer) { throw 'PSScriptAnalyzer 1.24.0 was installed but could not be located.' }
        Copy-Item -LiteralPath $installedAnalyzer.ModuleBase -Destination (Join-Path $moduleRoot 'PSScriptAnalyzer/1.24.0') -Recurse
    }
}
Write-Host 'Quality tools ready: yamllint 1.38.0, actionlint 1.7.12, PSScriptAnalyzer 1.24.0.'
