# Setup (Windows PowerShell)

Use a local disposable cluster. Plan for roughly 4 free CPU cores, 8 GB free RAM
and 15 GB disk as a comfortable starting budget, not a vendor minimum.

1. Install Docker Desktop with its WSL 2 backend and Linux containers.
   Follow https://docs.docker.com/desktop/setup/install/windows-install/ .
   Enable virtualization/WSL if its installer requests it. Check Docker's license
   terms for your situation. Start Docker Desktop and wait until it is ready.
2. Install kubectl and kind, following their official pages linked in README.
   If Windows Package Manager is available, these are installation commands:
   `winget install --exact --id Kubernetes.kubectl`
   `winget install --exact --id Kubernetes.kind`
   Docker Desktop: `winget install --exact --id Docker.DockerDesktop`.
   Installers may require elevation, WSL setup, a restart and manual acceptance.
3. Open a fresh terminal at the repository root and verify:

```powershell
docker version
docker info --format '{{.OSType}}'
kubectl version --client
kind version
kind create cluster --name k8training --wait 120s
kubectl --context kind-k8training get nodes
```

Expected: Docker server responds, OSType is linux, and one Ready node appears.
Use a kubectl client within one minor version of the cluster API server.
Record versions in your evidence. If a cluster of this name already exists,
inspect it with `kind get clusters` instead of deleting it.
If images cannot download, check Docker's proxy/network configuration.

All course commands explicitly use context kind-k8training. Do not change them
to point at a work/production cluster. You do not need a cloud account.
The course does not install software or create the cluster automatically.

Before starting, explain: image vs container; terminal working directory; YAML
indentation; HTTP ports. If unfamiliar, spend an extra session running
`docker run --rm -p 8081:80 nginx:1.28.0-alpine`, opening
http://localhost:8081, and stopping it with Ctrl+C.
