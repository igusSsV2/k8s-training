# Portable Windows x64 tools; no elevation or persistent PATH changes.
. "$PSScriptRoot/Common.ps1"
try {
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'This installer targets Windows x64.' }
    $null = New-Item -ItemType Directory -Path $ToolsRoot -Force
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $downloads = @(
        @{Name='kind'; Url='https://github.com/kubernetes-sigs/kind/releases/download/v0.31.0/kind-windows-amd64'; ChecksumSuffix='.sha256sum'},
        @{Name='kubectl'; Url='https://dl.k8s.io/release/v1.35.0/bin/windows/amd64/kubectl.exe'; ChecksumSuffix='.sha256'}
    )
    foreach ($download in $downloads) {
        $target = Join-Path $ToolsRoot ($download.Name + '.exe')
        $temporary = "$target.$([guid]::NewGuid().ToString('N')).download"
        $checksumFile = "$temporary.sha256"
        try {
            & curl.exe --fail --silent --show-error --location --retry 2 --connect-timeout 15 --max-time 180 --output $checksumFile ($download.Url + $download.ChecksumSuffix)
            if ($LASTEXITCODE -ne 0) { throw "Cannot download checksum for $($download.Name)" }
            $checksum = Get-Content -Raw -LiteralPath $checksumFile
            $expected = ($checksum.Trim() -split '\s+')[0]
            if ($expected -notmatch '^[a-fA-F0-9]{64}$') { throw "Invalid checksum for $($download.Name)" }
            if (Test-Path -LiteralPath $target) {
                if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $expected) {
                    Write-Host "Already installed and verified: $($download.Name)"
                    continue
                }
            }
            & curl.exe --fail --silent --show-error --location --retry 2 --connect-timeout 15 --max-time 180 --output $temporary $download.Url
            if ($LASTEXITCODE -ne 0) { throw "Cannot download $($download.Name)" }
            $actual = (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash
            if ($expected -notmatch '^[a-fA-F0-9]{64}$' -or $actual -ne $expected) { throw "Checksum mismatch for $($download.Name)" }
            Move-Item -LiteralPath $temporary -Destination $target -Force
            Write-Host "Installed verified $($download.Name) at $target"
        }
        finally {
            Remove-Item -LiteralPath $temporary -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $checksumFile -ErrorAction SilentlyContinue
        }
    }
    Write-Host 'Tools ready. Docker Desktop must be installed, started, and using Linux containers.'
    exit 0
}
catch { Write-Error $_.Exception.Message -ErrorAction Continue; exit 1 }
