# Repository instructions

## GitHub workflow

Apply this workflow to every new unit of work in `igusSsV2/k8s-training`:

1. Create a GitHub issue describing the problem, intended outcome, and acceptance criteria before implementation. Reuse an existing issue when continuing the same task.
2. Create a dedicated branch from the latest `main`. Include the issue number in the branch name, such as `fix/issue-12-service-check` or `docs/issue-15-lab-guide`.
3. Make focused changes and run the checks appropriate to them. Commit and push to the task branch; do not commit or push task changes directly to `main`.
4. Open a pull request targeting `main`. Explain the resulting behavior and relevant validation, and link the issue with `Closes #N` when the PR resolves it.
5. Report the issue, branch, and pull request links to the user. Leave merging to the user unless explicitly authorized to merge.

The agreed integration branch is `main`. Do not rename it to `master`.
Do not create a new issue or branch for every follow-up within the same task;
continue the existing issue and pull request until that work is complete.
If GitHub authentication or permissions prevent a step, finish independent local
work and report the precise blocker without claiming the remote action succeeded.

## Project and checks

Run commands from this repository's root. The dashboard is in `dist/`, guided
lessons and reference resources are in `training/`, and standalone incident
automation is in `training/troubleshooting/`. See `README.md` for prerequisites
and exact setup, validation, and cleanup commands.

- Dashboard changes: run Node syntax checks and `node --test tests/app.test.cjs`.
- Guided course changes: run `powershell -NoProfile -File training/scripts/Test-Course.ps1`. After lesson/setup edits, run `node training/scripts/Sync-Course.cjs` and the dashboard tests.
- Incident automation changes: run `powershell -NoProfile -File training/troubleshooting/Test-Lab.ps1` and applicable runtime checks. Use `Test-Lifecycle.ps1` when verifying setup, faults, repairs, reset isolation, or cleanup; it resets the three incident namespaces.
- Documentation-only changes: check links, commands, and `git diff --check`; do not reset a learner's cluster solely to test documentation.

Never claim runtime success from static checks. Keep tools, kubeconfigs,
credentials, real tokens, and local environment files out of Git. Preserve the
explicit training cluster contexts and namespace boundaries in automation.
