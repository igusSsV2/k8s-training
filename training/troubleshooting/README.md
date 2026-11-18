# Three troubleshooting incidents

These independent exercises include their own disposable kind cluster
`k8s-troubleshooting`, namespaces `trouble-1` through `trouble-3`, application
configuration, HTTP Services, fault injection, and checks. They do not depend
on completion of labs 01-07. Allow 20-30 minutes per incident.

All commands below run from the repository root in Windows PowerShell. No cloud
account, application build, npm installation, or credentials are required.
The existing `k8training` course cluster is separate.

## Prerequisites and deployment

Install and start Docker Desktop with WSL 2 and Linux containers as described
in [SETUP.md](../SETUP.md). Reserve approximately 4 CPU cores, 8 GB RAM and
15 GB free disk. Internet access is needed for tools and public images.
Setup can request WSL installation when already running as administrator.
Windows elevation, reboots, and Docker Desktop onboarding remain manual steps.

Run the read-only prerequisite check, or run setup to install missing prerequisites
and deploy everything:

```powershell
powershell -NoProfile -File training/troubleshooting/Check-Prerequisites.ps1 -CheckNetwork
powershell -NoProfile -File training/troubleshooting/Setup-Lab.ps1
# Install/start prerequisites without creating or resetting exercises:
powershell -NoProfile -File training/troubleshooting/Setup-Lab.ps1 -PrerequisitesOnly
```

Setup checks Windows x64 and WSL, installs Docker Desktop through winget if
missing, starts its Linux engine, installs verified portable kind/kubectl, checks
download connectivity, and creates/deploys the cluster. Repeating setup resets
the selected exercises; use `-Scenario 2` to select only one.
If WSL must be installed, setup requires an administrator terminal and returns
exit code 2 after requesting installation. It never elevates or reboots itself.
Docker onboarding/license acceptance and switching from Windows to Linux
containers may still require you to use Docker Desktop. Exit 0 means success;
exit 1 means a failed check/action. Low disk space produces a warning.
Computer Use availability and this chat's permissions cannot be enabled by these scripts.

If prerequisites are already installed, the separate tool and deployment steps are:

```powershell
powershell -NoProfile -File training/troubleshooting/Install-Tools.ps1
powershell -NoProfile -File training/troubleshooting/Deploy-Lab.ps1
```

Deploy creates the cluster if absent, checks its node, provisions each app,
proves internal DNS/HTTP works, injects faults, and verifies the broken state.
A successful deploy means the exercises are deliberately broken, ready to solve.
Failure returns exit code 1. A failed deployment leaves resources for diagnosis;
rerun deployment after resolving the host or network problem.

Tools and a dedicated kubeconfig live under ignored `.tools/k8s-troubleshooting/`.
Scripts always supply that kubeconfig and the explicit context; your default
kubeconfig is not edited. The cluster uses the pinned Kubernetes 1.35.0 node
image from the [kind v0.31.0 release](https://github.com/kubernetes-sigs/kind/releases/tag/v0.31.0).
These fixed versions are reproducible teaching inputs; update them together.

Prepare a convenient terminal command for investigation:

```powershell
function klab {
    & .\.tools\k8s-troubleshooting\kubectl.exe --kubeconfig .\.tools\k8s-troubleshooting\kubeconfig --context kind-k8s-troubleshooting @args
}
klab get nodes
klab get pods -A
```

## What Docker Desktop should show

This lab creates a single-node [kind](https://kind.sigs.k8s.io/docs/user/quick-start/)
cluster named `k8s-troubleshooting`. In Docker Desktop's **Containers** view,
expect one running node container named `k8s-troubleshooting-control-plane`.
That container is the Kubernetes node. Kubernetes runs the lab's Pod containers
inside the node's own container runtime, so they may not appear as separate
host-level Docker containers or images. Docker Desktop's built-in Kubernetes
cluster is a separate option and does not need to be enabled for this lab.

The dashboard starts actions and shows their output; it is not a Kubernetes
resource browser. Use the lab's dedicated tools and kubeconfig from the repository
root to inspect what is actually running:

```powershell
$kind = '.\.tools\k8s-troubleshooting\kind.exe'
$kubectl = '.\.tools\k8s-troubleshooting\kubectl.exe'
$kubeconfig = '.\.tools\k8s-troubleshooting\kubeconfig'
$context = 'kind-k8s-troubleshooting'

& $kind get clusters
& $kubectl --kubeconfig $kubeconfig --context $context get nodes -o wide
& $kubectl --kubeconfig $kubeconfig --context $context get namespaces
& $kubectl --kubeconfig $kubeconfig --context $context get pods -A -o wide
```

Expect the cluster list to include `k8s-troubleshooting`, its node to be Ready,
and namespaces `trouble-1`, `trouble-2`, and `trouble-3`. System Pods also appear
in `kube-system`. The three incident namespaces should show the intended faults:
Scenario 1 has a rollout that cannot replace the old version, Scenario 2 has
Ready Pods that its Service cannot reach, and Scenario 3 has running Pods that
are not Ready. The broken state is the starting point for the exercises.

If the cluster or kubeconfig is missing, check that Docker Desktop is running
Linux containers, then rerun setup from the repository root. Setup/deploy resets
the selected incidents, so save any repairs you want to keep before rerunning it.
The setup and cleanup commands below always use this dedicated kubeconfig; they
do not configure Docker Desktop's built-in Kubernetes cluster or edit your
default kubeconfig.

## Incident briefs (start here)

### 1. The release that never finishes

Namespace: `trouble-1`. A release is stuck, but customers can still access the
old page. Find why the new replicas cannot become available, recover the
release, and preserve availability. Explain why serving HTTP alone does not
prove a successful deployment.

Acceptance: two updated Ready replicas, no extra rollout replicas, two Ready
Service endpoints, and the expected page through in-cluster DNS/HTTP.

### 2. Healthy Pods, unreachable application

Namespace: `trouble-2`. The application Pods report Ready, but clients using
the Service cannot reach them. Find the failure between the Service and Pods,
repair it, and explain the evidence. Pod replacement should not be needed.

Acceptance: two Ready replicas, two Ready Service endpoints, and the expected
page through the Service name. Pod port forwarding alone does not prove this.

### 3. Running does not mean available

Namespace: `trouble-3`. After a deployment, containers are running but the
application is unavailable. Diagnose the health check and restore service.
Explain readiness versus liveness and why restarting alone does not fix it.

Acceptance: both replicas become Ready and the Service serves the expected
page. The scenario uses Recreate to make the readiness fault an observable
outage; discuss how a rolling strategy could protect the previous version.

Useful investigation commands (replace the namespace):

```powershell
klab -n trouble-1 get deploy,rs,pods,svc
klab -n trouble-1 describe deployment web
klab -n trouble-1 get events --sort-by=.metadata.creationTimestamp
klab -n trouble-1 get endpointslices -l kubernetes.io/service-name=web
# Use an actual Pod name from get pods:
klab -n trouble-1 describe pod POD_NAME
klab -n trouble-1 logs POD_NAME
```

Record a hypothesis, evidence, repair command, and verification for each incident
using [the evidence template](../evidence/TEMPLATE.md). Do not delete the namespace
or run Deploy as your repair. Explain the cause and user-visible effect afterward.

## Check, reset, and delete

Check your repaired scenario (Healthy is the default), or verify a deployed fault:

```powershell
powershell -NoProfile -File training/troubleshooting/Check-Lab.ps1 -Scenario 1
powershell -NoProfile -File training/troubleshooting/Check-Lab.ps1 -Scenario 2 -State Broken
# Check all repairs:
powershell -NoProfile -File training/troubleshooting/Check-Lab.ps1
# Reset only scenario 2, replacing its repair with the original fault:
powershell -NoProfile -File training/troubleshooting/Deploy-Lab.ps1 -Scenario 2
```

Broken checks inspect the actual failure state and test its expected HTTP effect.
Healthy checks wait for rollout, require two updated Ready replicas and endpoints,
then fetch and validate content from a temporary Job using the Service DNS name.
Jobs are removed afterward. Nonzero exit means the expectation was not met;
tool, DNS, or image-download problems can also fail the check and need diagnosis.
Check does not repair the app or mark browser dashboard progress.

Delete one exercise, all exercise namespaces, or the dedicated cluster:

```powershell
powershell -NoProfile -File training/troubleshooting/Delete-Lab.ps1 -Scenario 1
powershell -NoProfile -File training/troubleshooting/Delete-Lab.ps1
powershell -NoProfile -File training/troubleshooting/Delete-Lab.ps1 -DeleteCluster
```

Deletion discards the selected lab work. Namespace cleanup requires the lab
ownership label and tolerates absent namespaces. Cluster deletion removes only
`k8s-troubleshooting`, including any other resources you added to that cluster.
Repeated cleanup is safe; downloaded tools and shared Docker image caches remain.

## Maintainer validation

No build step or extra test dependencies. Syntax checks and regression tests:

```powershell
powershell -NoProfile -File training/troubleshooting/Test-Lab.ps1
```

Full runtime acceptance (uses/resets all three exercise namespaces):

```powershell
powershell -NoProfile -File training/troubleshooting/Test-Lifecycle.ps1
```

This creates the cluster, proves healthy baselines and injected failures, restores
the reference configuration, proves recovery, checks single-scenario reset isolation,
and verifies cleanup twice. It leaves the cluster empty. Run Deploy afterward
to leave all three incidents ready for a learner. Static tests cannot establish
that a cluster is working. For manifest schema validation on an existing lab:

```powershell
klab -n trouble-1 apply --dry-run=server -f training/troubleshooting/baseline.yaml
```

## Instructor reference (spoilers)

The injected faults are an invalid nginx image tag (1), a Service selector
`app=missing` (2), and readiness path `/missing` (3). The reference image and
probe configuration are in `baseline.yaml`; `/` returns the expected page.
Use targeted changes with `klab set image`, `klab edit service`, or
`klab edit deployment`, then run the Healthy check. Do not grant extra privileges
or disable health checks as a substitute for a repair.

The healthy baseline manifest is provided for instructors and lifecycle testing.
Applying it directly also replaces the scenario-specific page; restore that
ConfigMap content before expecting the Healthy content check to pass.
