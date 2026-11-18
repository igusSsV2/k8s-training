# Security scanning

## CodeQL

The repository uses the checked-in advanced CodeQL setup in
`.github/workflows/codeql.yml`. It scans JavaScript/TypeScript on pull requests
to `main`, pushes to `main`, and weekly on Monday at 04:17 UTC. Maintainers can
also start it manually from GitHub Actions. The workflow uses GitHub's
`security-extended` query suite and reports results to the repository's code
scanning alerts and pull requests.

The analyzed code includes the hand-maintained dashboard in `dist/`, the local
HTTP service, PowerShell action validation and process orchestration in the
JavaScript server, release scripts, and training synchronization scripts.
Only `tests/fixtures/` is excluded because those files intentionally model
test-only behavior. Dependencies and local generated output are not checked in.

The workflow runs on the unprivileged `pull_request` event. It does not use
`pull_request_target`, publishing credentials, or write access to repository
contents. Its job receives only the permissions needed to check out source,
read workflow metadata, and publish code scanning results. Fork pull requests
remain subject to GitHub's read-only token rules.

CodeQL covers the JavaScript/TypeScript source only. It does not analyze the
PowerShell lab automation; PowerShell static analysis remains tracked separately
in [issue #7](https://github.com/igusSsV2/k8s-training/issues/7).

Maintainers should review new alerts in the repository's **Security → Code
scanning** page and the PR's CodeQL results. Fix actionable findings or record a
narrow, justified dismissal. Do not suppress a query or dismiss an alert solely
to make a check pass. CodeQL currently reports findings but is not a required
merge gate; consider gating after the initial results are reviewed and the
broader PR quality policy in [issue #17](https://github.com/igusSsV2/k8s-training/issues/17)
is updated.
