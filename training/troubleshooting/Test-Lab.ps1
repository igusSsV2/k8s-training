# Dependency-free regression checks; no cluster required.
. "$PSScriptRoot/Common.ps1"
$ErrorActionPreference = 'Stop'
foreach ($script in Get-ChildItem -LiteralPath $PSScriptRoot -Filter *.ps1) {
    $tokens = $null
    $errors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$errors)
    Assert-Lab ($errors.Count -eq 0) "PowerShell parses: $($script.Name)"
}
Assert-Lab ((Get-Scenarios All).Count -eq 3) 'All selects three scenarios'
Assert-Lab ((Get-Scenarios 2)[0] -eq 2) 'Single-scenario selection stays isolated'

. "$PSScriptRoot/Prerequisites.ps1"
Assert-PrerequisiteReport @([pscustomobject]@{Name='ready'; Ready=$true})
$rejected = $false
try { Assert-PrerequisiteReport @([pscustomobject]@{Name='Docker'; Ready=$false}) }
catch { $rejected = $_.Exception.Message -match 'Docker' }
Assert-Lab $rejected 'Missing prerequisite blocks setup with its name'
$probe = Invoke-HostProbe (Join-Path $PSHOME 'powershell.exe') @('-NoProfile', '-Command', "[Console]::Error.WriteLine('diagnostic'); exit 0")
Assert-Lab ($probe.ExitCode -eq 0 -and $probe.Text -match 'diagnostic') 'Successful native probe can write diagnostics to stderr'
$probe = Invoke-HostProbe (Join-Path $PSHOME 'powershell.exe') @('-NoProfile', '-Command', "[Console]::Error.WriteLine('unavailable'); exit 7")
Assert-Lab ($probe.ExitCode -eq 7) 'Failed native probe reports its exit without aborting all checks'

$snapshot = @{
    Deployment=@{metadata=@{generation=2}; status=@{observedGeneration=2; readyReplicas=2}; spec=@{template=@{spec=@{containers=@(@{
        image='nginx:training-tag-does-not-exist'; readinessProbe=@{httpGet=@{path='/'}}
    })}}}}
    Service=@{spec=@{selector=@{app='web'}}}
    Pods=@{items=@(@{status=@{containerStatuses=@(@{image='nginx:training-tag-does-not-exist'; state=@{waiting=@{reason='ImagePullBackOff'}}})}})}
    ReadyEndpoints=@()
}
Assert-Lab (Test-FaultObserved 1 $snapshot) 'Failed image pull is recognized'
$snapshot.Pods.items[0].status.containerStatuses[0].state.waiting.reason = 'ContainerCreating'
Assert-Lab (-not (Test-FaultObserved 1 $snapshot)) 'Container startup alone does not prove an image failure'
$snapshot.Service.spec.selector.app = 'missing'
Assert-Lab (Test-FaultObserved 2 $snapshot) 'Broken selector with healthy backend is recognized'
$snapshot.Deployment.status.readyReplicas = 0
Assert-Lab (-not (Test-FaultObserved 2 $snapshot)) 'Unhealthy backend cannot pass selector-only scenario'
$snapshot.Deployment.spec.template.spec.containers[0].readinessProbe.httpGet.path = '/missing'
$snapshot.Pods.items = @(@{
    spec=@{containers=@(@{readinessProbe=@{httpGet=@{path='/missing'}}})}
    status=@{containerStatuses=@(@{ready=$false; state=@{running=@{startedAt='now'}}})}
})
Assert-Lab (Test-FaultObserved 3 $snapshot) 'Running but unready application is recognized'
$snapshot.ReadyEndpoints = @(@{addresses=@('10.0.0.1')})
Assert-Lab (-not (Test-FaultObserved 3 $snapshot)) 'Readiness outage requires no Ready endpoints'

# Inspect the actual patch bytes used by Windows native commands.
$null = New-Item -ItemType Directory -Path $ToolsRoot -Force
function Invoke-LabKube {
    param([string[]]$Arguments)
    $index = [array]::IndexOf($Arguments, '--patch-file')
    if ($index -lt 0) { throw 'Unexpected command in patch test' }
    $raw = Get-Content -Raw -LiteralPath $Arguments[$index + 1]
    Assert-Lab ($raw.TrimStart().StartsWith('[')) 'Native patch input is a JSON array even for one operation'
    $script:CapturedPatch = $raw | ConvertFrom-Json
    Assert-Lab ($Arguments[1] -match '^trouble-[123]$') 'Patch is limited to a scenario namespace'
}
foreach ($number in 1..3) {
    Set-LabFault $number
    Assert-Lab (@($CapturedPatch).Count -ge 1) "Scenario $number serializes a JSON patch array"
}
Assert-Lab (@($CapturedPatch | Where-Object { $_.path -eq '/spec/strategy' -and $_.value.type -eq 'Recreate' }).Count -eq 1) 'Readiness scenario removes old Ready replicas'

# Reject foreign namespaces before reset/deletion and tolerate already absent ones.
function Invoke-LabKube {
    param([string[]]$Arguments)
    return $script:NamespaceJson
}
$script:NamespaceJson = '{"metadata":{"labels":{"training.kube-together/owner":"someone-else"}}}'
$rejected = $false
try { Assert-OwnedNamespace 'trouble-1' } catch { $rejected = $true }
Assert-Lab $rejected 'Namespace ownership mismatch is rejected'
$script:NamespaceJson = ''
Assert-OwnedNamespace 'trouble-1' -AllowMissing
$rejected = $false
try { Assert-OwnedNamespace 'trouble-1' } catch { $rejected = $true }
Assert-Lab $rejected 'Required missing namespace is rejected'
$script:NamespaceJson = '{"metadata":{"labels":{"training.kube-together/owner":"troubleshooting"}}}'
Assert-OwnedNamespace 'trouble-1'

# Native failures must propagate rather than print a false success.
function Find-LabTool {
    param([string]$Name)
    return (Join-Path $PSHOME 'powershell.exe')
}
$rejected = $false
try { $null = Invoke-LabTool test @('-NoProfile', '-Command', 'exit 7') }
catch { $rejected = $_.Exception.Message -match 'exit 7' }
Assert-Lab $rejected 'Nonzero native exit fails the operation'
$global:LASTEXITCODE = 0
Assert-Lab ((Get-Content -Raw (Join-Path $PSScriptRoot 'baseline.yaml')) -notmatch "`t") 'Manifest uses spaces'
Write-Host 'Regression checks passed. These checks do not prove live cluster behavior.'
