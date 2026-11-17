# K8s Training - Kube Together

Hands-on Kubernetes practice for beginners on Windows: eight guided lessons,
a browser dashboard, and three independently deployable troubleshooting incidents.
Run commands in PowerShell from this repository's root directory.

## Start the troubleshooting labs

```powershell
git clone https://github.com/igusssv2/k8s-training.git
cd k8s-training
# Inspect prerequisites without installing anything:
powershell -NoProfile -File training/troubleshooting/Check-Prerequisites.ps1 -CheckNetwork
# Install/start prerequisites, create the cluster, and deploy all three incidents:
powershell -NoProfile -File training/troubleshooting/Setup-Lab.ps1
```

Setup supports Windows x64, WSL 2 and Docker Desktop with Linux containers.
It installs missing Docker Desktop through winget, starts its engine, downloads
SHA-256-verified kind/kubectl into ignored `.tools/`, and creates a dedicated local
cluster. WSL installation requires an administrator terminal; setup never elevates
or restarts Windows automatically. Docker onboarding may require manual completion.
Allow about 4 CPU cores, 8 GB RAM, 15 GB disk and public internet access.
No cloud account, npm dependencies, or application build is needed.

| Scenario | Incident | Namespace |
| --- | --- | --- |
| 1 | A release is stuck while the old version still serves traffic | `trouble-1` |
| 2 | Healthy Pods cannot be reached through their Service | `trouble-2` |
| 3 | Containers run but the application never becomes ready | `trouble-3` |

A successful setup leaves the scenarios **deliberately broken** for you to repair.
Read the [incident briefs and command guide](training/troubleshooting/README.md).

```powershell
# Verify your repair (defaults to Healthy):
powershell -NoProfile -File training/troubleshooting/Check-Lab.ps1 -Scenario 1
# Verify that all intended faults are present:
powershell -NoProfile -File training/troubleshooting/Check-Lab.ps1 -State Broken
# Reset one exercise:
powershell -NoProfile -File training/troubleshooting/Deploy-Lab.ps1 -Scenario 2
# Remove namespaces, or remove the entire dedicated cluster:
powershell -NoProfile -File training/troubleshooting/Delete-Lab.ps1
powershell -NoProfile -File training/troubleshooting/Delete-Lab.ps1 -DeleteCluster
```

`Setup-Lab.ps1 -PrerequisitesOnly` installs/checks prerequisites without touching
exercises. Setup/deploy can be repeated to reset labs. Checks return exit 0 on
success and 1 on failure; setup returns 2 when a Windows restart is needed.
The dedicated cluster is `k8s-troubleshooting`; its credentials stay in ignored
`.tools/k8s-troubleshooting/kubeconfig`. All scripts target that file and context.

## Guided eight-session course

Open `Run-K8Training.cmd` or `dist/index.html` for the learning dashboard.
Follow the [course plan](training/README.md) and [environment setup](training/SETUP.md).
The guided course uses its own cluster, `k8training`, separate from the incidents.

Lessons cover Pods/controllers, scaling, Services/DNS, configuration/Secrets,
probes/rollouts, storage/Jobs, RBAC, and an incident capstone.
Progress and journals are stored per learner in the browser. Use Export progress
and Import backup when changing browsers or moving the local HTML file.
The dashboard guides terminal work and does not execute cluster commands.

## Repository and validation

- `dist/`: static dashboard and bundled lessons.
- `training/labs/`: guided exercises 01-08.
- `training/manifests/`: reference resources for the guided course.
- `training/troubleshooting/`: prerequisite, setup, deployment, check and cleanup scripts.
- `tests/`: dashboard regression tests using Node's built-in runner.

Node.js is needed only for dashboard development checks. No npm install or build
is required. Run syntax, course-file, and regression checks from repository root:

```powershell
node --check dist/app.js
node --check dist/course.js
node --test tests/app.test.cjs
powershell -NoProfile -File training/scripts/Test-Course.ps1
powershell -NoProfile -File training/troubleshooting/Test-Lab.ps1
```

After editing guided lessons or SETUP.md, regenerate the checked-in bundle:

```powershell
node training/scripts/Sync-Course.cjs
```

PowerShell parsing and YAML whitespace checks provide basic linting; no external
formatter or linter is required. Formatting conventions are in `.editorconfig`.
The full live acceptance test resets all three namespaces, validates baselines,
faults, recovery and reset isolation, then removes the namespaces twice:

```powershell
powershell -NoProfile -File training/troubleshooting/Test-Lifecycle.ps1
```

It leaves the dedicated cluster running and empty. Run Setup or Deploy afterward
to prepare the incidents again. Never commit kubeconfigs, real tokens, credentials,
or local environment files. Practice Secrets contain fake values only.
