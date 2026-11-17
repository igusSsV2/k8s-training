# Dependency maintenance

Dependabot is configured in `.github/dependabot.yml` for the repository's actual
dependency ecosystems:

| Ecosystem | Files | Schedule (Buenos Aires) |
| --- | --- | --- |
| npm | Root package.json/package-lock.json | Monday 09:00 |
| GitHub Actions | .github/workflows/ | Monday 09:30 |

Compatible minor/patch dependency upgrades are grouped per ecosystem; major
upgrades remain separate for review. Each ecosystem permits at most five open
version-update PRs. Dependabot alerts and automatic security-fix PRs are enabled
in repository settings. Security-fix timing follows GitHub's vulnerability
handling rather than waiting for the weekly version-update schedule.

## Review and release workflow

Updates target `main` and receive `dependencies` and `patch` labels. `patch` means
an application maintenance release; it does not claim that the dependency itself
had only a patch bump. If adopting an update changes this application's public
behavior incompatibly, replace `patch` with the appropriate single release label
after reviewing the effect. Do not leave two bump labels on a PR.

Automatic merging is disabled. Maintainers must inspect release notes, link/create
an issue for the maintenance work, add a reviewed `changes/<issue>-description.json`
entry to the update branch, and resolve any CI failures before merging. Dependabot
does not generate this application's change entry automatically: a missing entry
intentionally fails release-metadata validation until a maintainer adds it.
Normal branch protection and applicable lint/test/package checks still apply.

Example change entry:

```json
{
  "type": "changed",
  "description": "Update the browser test runner and verify the dashboard tests.",
  "issues": [9],
  "breaking": false
}
```

## Versions outside Dependabot's scope

The pinned kind/kubectl downloads, kind node image digest and lab container tags
are embedded in PowerShell/YAML teaching resources, not package-manager manifests.
They are reviewed manually in an issue-linked PR. Update compatible tool/client/
cluster versions together, verify published download checksums, run the local
checks and appropriate disposable-cluster lifecycle tests, and update setup/release
documentation. Do not assume a green npm update also validates those versions.

The configuration begins taking effect after it is merged into `main`. Review
Dependabot's update logs and the repository's dependency graph/security settings
to verify processing; a future scheduled PR cannot be proven by local tests alone.
