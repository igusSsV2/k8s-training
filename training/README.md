# Kubernetes together

Eight sessions, 60-90 minutes each, about four weeks at two sessions per week.
For three independently deployable troubleshooting incidents with their own
cluster, setup, cleanup and repair checks, see [troubleshooting](troubleshooting/README.md).
Assumption: you are beginners using Windows PowerShell. One computer is enough.
On two computers, create a separate cluster on each and compare results.

## How each session works

Spend 10 minutes explaining the concept, 35 minutes building, 20 minutes breaking
and fixing, and 10 minutes explaining the result to each other.
Alternate driver (types commands) and navigator (predicts results and reviews).
Swap halfway through. Both people must explain the lab without reading commands.

| Session | Topic                              | Practical outcome                            |
| ------- | ---------------------------------- | -------------------------------------------- |
| 01      | Containers, cluster, desired state | Explain nodes, Pods and controllers          |
| 02      | Deployments and recovery           | Scale and observe a replacement Pod          |
| 03      | Services and DNS                   | Reach the application through a stable name  |
| 04      | Configuration and Secrets          | Change content without rebuilding an image   |
| 05      | Probes, resources and rollout      | Diagnose a failed rollout and recover        |
| 06      | Persistent storage and Jobs        | Keep data after replacing a writer Pod       |
| 07      | ServiceAccounts and RBAC           | Prove allowed and forbidden operations       |
| 08      | Incident capstone                  | Repair three faults and explain the evidence |

Start with [SETUP.md](SETUP.md), then [labs/01.md](labs/01.md).
Labs 01-05 and 08 share one application. Labs 06-07 add independent resources.
Do them in order. Reference manifests are working examples; read the challenge
before opening them. This course covers foundations, not production readiness
or a complete certification syllabus.

## Codex workflow

Open this repository in Codex and use [TASKS.md](TASKS.md). Ask for hints first.
Record predictions, commands, failures and explanations in [evidence/TEMPLATE.md](evidence/TEMPLATE.md).
Do not paste real credentials or kubeconfig content into evidence.
A green script is only part of passing: both learners must complete the manual
checks and explain why the repair worked.

## Commands from repository root

No application build or package dependency installation is required.
Prerequisites and optional Windows installation commands are in SETUP.md.

```powershell
# Start the lab cluster after installing prerequisites
kind create cluster --name k8training --wait 120s
powershell -NoProfile -File training/scripts/Check.ps1 -Lab 1
# Run checks after each lab (1 through 8)
powershell -NoProfile -File training/scripts/Check.ps1 -Lab 3
# Static checks: PowerShell parsing and course-file completeness
powershell -NoProfile -File training/scripts/Test-Course.ps1
# Schema validation/lint against your running cluster, without applying resources
kubectl --context kind-k8training apply --dry-run=server -n k8training -f training/manifests/
```

Create the namespace in lab 01 before running the schema check.
The static check does not validate Kubernetes schemas. No formatter dependency
is needed; use two spaces in YAML and four in PowerShell (.editorconfig).
Runtime checks need internet access for public container images. Tags are fixed
for teaching but are not immutable digests or security maintenance guarantees.

## Reset and cleanup

To restart the application, delete only this lab namespace and repeat lab 01:
`kubectl --context kind-k8training delete namespace k8training`.
This also destroys the lab PVC and its data. To remove the entire local course
cluster: `kind delete cluster --name k8training`.
Use these only when you intend to discard the corresponding lab work.

## Official references

- https://kubernetes.io/docs/tutorials/kubernetes-basics/
- https://kubernetes.io/docs/concepts/
- https://kind.sigs.k8s.io/docs/user/quick-start/
- https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/

Next steps after this course: Ingress/Gateway API, Helm, metrics and HPA,
NetworkPolicy with a supporting CNI, GitOps, backups and multi-node operations.
