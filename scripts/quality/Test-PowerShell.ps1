$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$modulePath = Join-Path $repoRoot '.tools/quality/Modules/PSScriptAnalyzer/1.24.0/PSScriptAnalyzer.psd1'
if (-not (Test-Path -LiteralPath $modulePath)) { throw 'Run scripts/quality/Setup-QualityTools.ps1 first.' }
Import-Module $modulePath -Force
$settings = Join-Path $repoRoot 'PSScriptAnalyzerSettings.psd1'
$files = @(
    Get-ChildItem -LiteralPath (Join-Path $repoRoot 'training') -Filter '*.ps1' -Recurse
    Get-ChildItem -LiteralPath $repoRoot -Filter '*.ps1' -File
    Get-ChildItem -LiteralPath (Join-Path $repoRoot 'scripts') -Filter '*.ps1' -Recurse
)
$findings = @(
    foreach ($file in $files) {
        if ($file.Name -eq 'Test-Lab.ps1') {
            Invoke-ScriptAnalyzer -Path $file.FullName -Settings $settings -Severity Error, Warning -ExcludeRule PSReviewUnusedParameter
        } else {
            Invoke-ScriptAnalyzer -Path $file.FullName -Settings $settings -Severity Error, Warning
        }
    }
)
if ($findings.Count) {
    $findings | Format-Table -AutoSize | Out-String | Write-Host
    throw "PSScriptAnalyzer reported $($findings.Count) finding(s)."
}
Write-Host "PASS: PSScriptAnalyzer checked $($files.Count) PowerShell files."
