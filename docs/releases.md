# Releases and change history

## Contributor workflow

Every implementation PR targeting `main` needs exactly one of `major`, `minor`,
or `patch`, plus a new reviewed `changes/<issue>-description.json` file:

```json
{
  "type": "fixed",
  "description": "Explain the user-visible change and any required action.",
  "issues": [4],
  "breaking": false
}
```

Supported types are `added`, `changed`, `fixed`, `removed`, `deprecated`, and
`security`. Set `breaking` to true for a breaking change and describe migration
steps in the entry and relevant documentation. Never edit or reuse an already
merged entry for a different change; add another file. Unrelated labels may
coexist with the single bump label.

| Label | Previous 1.2.3 | Result |
| --- | --- | --- |
| `major` | 1.2.3 | 2.0.0 |
| `minor` | 1.2.3 | 1.3.0 |
| `patch` | 1.2.3 | 1.2.4 |

`release-policy.json` anchors the start of automation at the final commit before
these workflows were introduced. Earlier training work is described accurately
in the initial entries and ships in the first release. The version baseline is
`0.0.0`; a first `minor` PR produces `v0.1.0`. The development package.json version
does not allocate release numbers. Release tags and frozen release metadata are
the version source of truth. Do not create or move release tags manually.

Update affected instructions and screenshots in each PR, or explain why they are
unaffected. See [AGENTS.md](../AGENTS.md). These rules apply to documentation and
dependency PRs too: routine maintenance generally uses `patch`.

## What runs on GitHub

**Validate release metadata** runs the fast label/changelog check on PR creation,
code/metadata updates and label changes. Its concurrency group is separate from
code validation, so a label change cannot cancel a running code test.

**Validate application** runs on PR creation/code changes/reopening/readiness,
pushes to `main`, or a manual dispatch. It does not subscribe to label or title/body
edit events. Together the workflows provide:

- **Release label and changelog**: exactly one bump label and a valid new change entry.
- **Windows tests**: locked dependencies, syntax, unit/regression tests, browser
  tests, PowerShell/course checks, and an extracted-package startup test.
- **Windows ZIP smoke test**: build a preview ZIP and checksum, extract it, launch
  the local service, verify its frontend/version, and stop the test service.

PR artifacts are previews, not published releases. They expire after seven days.
The preview version may change if another PR is released before merge.
The preview job reads the current PR labels after tests finish, rather than a
possibly label-free creation event. If a valid label is added only after packaging
has already failed, rerun that failed application-validation run manually; label
changes deliberately do not launch another full test/package run. The latest fast
metadata check must also pass before merge.
If a PR is retargeted to a different base, push a new commit or rerun its application
validation explicitly. Metadata edits never replace code checks with skipped jobs.

**CodeQL** scans JavaScript/TypeScript on PRs to `main`, pushes to `main`, and a
weekly schedule. It reports security findings but is not currently a required
merge check; maintainers review alerts and triage them as described in the
[security scanning guide](security.md). PowerShell lab scripts remain outside
CodeQL coverage.

**Publish versioned release** runs after a push/merge to `main` and can be rerun
manually from Actions. It processes all merged PRs after the release baseline in
Git ancestry order, including merges that arrived while another run was active.
One publisher runs at a time; coalescing pending triggers cannot lose a PR because
each run drains all unreleased merges, not just the triggering commit.

For each unreleased PR, the publisher validates its label/entry, extracts the exact
merged commit into a clean workspace, runs the Windows validation suites, builds
and smoke-tests the package, and only then creates or resumes its tagged draft.
It uploads all assets before publishing. Closing an unmerged PR never releases it.
A direct commit to `main` without a merged PR stops publishing with an actionable
error; it is not assigned an invented release label.

Required-check enforcement is a separate repository setting. Configure the three
check names above when branch protection is available (issue #6/#15). On a private
repository whose plan does not permit branch protection, checks still run and the
publisher independently rejects missing/ambiguous labels and failing validation.
Do not describe an unprotected branch as merge-protected.

## Download and launch

On the repository's Releases page, download:

- `k8s-training-vX.Y.Z-windows-x64.zip`
- The matching `.zip.sha256` file.
- Optionally the standalone `CHANGELOG.md` asset (also inside the ZIP).

The repository is now public, so published release assets do not require private
repository credentials. Drafts and any future private visibility still require
authorized access. See [repository policy](repository-policy.md). The application
currently supports Windows x64; macOS/Linux support is tracked in issue #12.

Verify and extract from a PowerShell terminal, replacing the example version:

```powershell
Get-FileHash .\k8s-training-v0.1.0-windows-x64.zip -Algorithm SHA256
Get-Content .\k8s-training-v0.1.0-windows-x64.zip.sha256
# Compare the hash values before extracting.
Expand-Archive .\k8s-training-v0.1.0-windows-x64.zip -DestinationPath .\release-v0.1.0
cd .\release-v0.1.0\k8s-training
powershell -NoProfile -File Start-K8Training.ps1
```

Node.js 22+ is a host prerequisite. No npm install is needed to run a release;
runtime uses Node built-ins. Lab setup still needs Docker/WSL as documented in the
README. Source-development test commands require a Git checkout; release ZIPs
contain runtime code, launchers, course/scripts, documentation, generated version
metadata and history, but exclude development dependencies/tests and local data.

The website's **Change history** link opens the complete changelog shipped with
that installation. Development checkouts and PR previews are labelled separately
from published versions. There is no automatic updater yet (issue #5).

## Changelog ownership

`changes/` holds immutable reviewed entries. GitHub Release notes record one
version's changes with its PR/issues and frozen version identity. Every release
ZIP and standalone `CHANGELOG.md` asset contains cumulative dated sections for
all releases through that version, newest first.

The checked-in root `CHANGELOG.md` is an index and unversioned baseline summary.
Published dated history is generated into release assets, rather than committing
generated version changes directly to `main` or inventing release dates in a PR.
The date in each generated section is the merged PR's UTC date; GitHub separately
shows when the release was actually published. This keeps retries consistent.
Do not add a manually maintained `Unreleased` list to the root index: reviewed
entries in `changes/` remain pending until a real release is published, and the
releases page links to the dated history after publication.

## Failure recovery

### Historical workflow commits and the publishing credential

GitHub requires **Workflows: write** when a release/tag target has workflow files
that differ from the current default branch. The oldest unreleased commit in
this repository has that difference. The built-in `GITHUB_TOKEN` cannot receive
this permission, even when its job has `contents: write`.

The owner must configure an expiring fine-grained token as follows:

1. In GitHub **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens**, create a token with a short expiry, resource owner
   `igusSsV2`, and **Only select repositories → k8s-training**.
2. Grant repository **Contents: Read and write** and **Workflows: Read and write**;
   Metadata read access is implicit. Also grant **Pull requests: Read-only** for
   merge/label discovery. No account-wide or administration permission is needed.
3. In this repository, **Settings → Secrets and variables → Actions**, add the
   repository secret **RELEASE_PUBLISH_TOKEN**. Enter the token there, not in a
   file, PR, issue, log or chat message.
4. Merge the authorization fix and run **Publish versioned release** on `main`.
   Verify the actual release URL and its ZIP/checksum/changelog assets.
5. Rotate the secret before expiry or remove it if this publication mode is no
   longer needed. An approved GitHub App with the same repository permissions
   can supply an installation token instead; do not copy a broad CLI login token.

The publisher uses this secret only in the trusted `main` publishing job. PR
validation continues using the restricted job token. Source tests and extracted
application startup do not inherit the publishing token. Without the secret,
ordinary current-workflow releases can still use `GITHUB_TOKEN`, but historical
workflow differences fail a preflight check before expensive validation. Branch
protection stays enabled, and changing the tag target to a different commit is
not used as an authorization workaround.

Reference: [GitHub release workflow-file permission restriction](https://docs.github.com/en/rest/releases/releases#create-a-release).

### Other failures

1. Open the failed Actions run and inspect the failing step. Nothing is published
   if validation or package startup fails.
2. If a merged PR lacks a bump label, add exactly one appropriate label to that PR,
   then rerun **Publish versioned release** on `main`.
3. A merged PR with no valid new change entry requires a corrective PR/source fix;
   do not invent historical notes or edit tags to force publication. The release
   range must be repaired deliberately before retrying.
4. A failure during upload leaves a draft. A retry recognizes the same PR, commit,
   previous version and version number, rebuilds/validates, replaces only that
   identified draft's partial assets, then publishes it. It does not bump again.
5. Published releases are skipped after verifying their tag identity and required
   assets. Existing published assets and conflicting tags are never overwritten.
   Investigate any identity/tag conflict before retrying; no force-push recovery.
6. If the concurrency pending-trigger limit cancels a trigger, dispatch the
   publisher manually; it catches up from the complete merge history.

GitHub supplies an ephemeral job token with `contents: write` and PR read access;
the publisher uses the scoped repository secret above when configured. Checkout
credentials are not persisted, and no credential belongs in Git. Repo Actions
must be enabled; organization policy can still restrict available grants.

The publisher pins REST API version `2022-11-28` because exact merge identity
depends on `merge_commit_sha`. The `2026-03-10` contract removes that field from
PR responses and caused the first post-merge run to reject PR #16 incorrectly
(issue #19). A missing field now reports a schema/contract error, separately from
a genuine unmatched commit. Empty association results are retried three times
with short backoff before rejecting the commit. After merging the fix, dispatch
the publisher on `main` (or let the merge push trigger it); it catches up with
PR #16 and subsequent merges without forcing tags or changing history.

## Local validation

```powershell
npm ci --ignore-scripts
npx playwright install chromium
npm run check
npm test
npm run test:browser
npm run package:preview
```

Local previews default to a patch above the newest reachable stable tag (or
`0.0.0`) and write into a fresh ignored `.tools/package-preview-*` directory. They
do not create tags or GitHub Releases. The Windows package smoke test uses a
temporary directory and port; it does not run lab setup or delete real clusters.
