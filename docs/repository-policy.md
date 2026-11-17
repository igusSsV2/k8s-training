# Repository visibility and protections

Verified on 2026-11-17:

- The owner made `igusSsV2/k8s-training` public.
- Changes to `main` require a pull request, including for administrators.
- Required checks are `Release label and changelog`, `Windows tests`, and
  `Windows ZIP smoke test`; branches must be up to date before merging.
- No separate approving reviewer is required, allowing the owner to merge their
  own PR after checks pass.
- Force pushes and deletion of `main` are disabled.
- Automatic PR merging is disabled.
- Dependabot dependency alerts/graph and automatic security-fix PRs are enabled.

These settings were read back through GitHub's API. Written contributor
instructions supplement them; they are not a replacement for server-side rules.
New quality-check names must be added to the protection policy after the
corresponding workflow is available and verified.

## Publication review

A checksum-verified Gitleaks 8.30.1 scan of available Git history (`--all`, with
redacted output) found no secret matches. A separate scan of exported issue/PR
bodies, comments and review comments also found no secret matches. The tracked
dashboard screenshot was reviewed; tools, kubeconfigs and hosting metadata remain
excluded from Git. This records the performed checks, not a guarantee that every
possible sensitive value can be identified by automated scanning.

Git history contains a personal author email in addition to the GitHub noreply
identity. Its value is not repeated here. History has not been rewritten: changing
historical identities would alter commit IDs and require a deliberate recovery
plan for release metadata and existing links. Future local commits are configured
with the GitHub noreply identity; the owner's GitHub merge/email preferences are
separate account settings.

The owner selected the MIT license. See the root [LICENSE](../LICENSE); release
packages include that file and matching package metadata. Earlier commits that
predate license selection are not rewritten. Historical author-privacy changes
remain an owner choice; no history rewrite is part of the publication/configuration work.

## Public release access

Public source and published GitHub Release assets can be read without private
repository credentials. Do not embed a token in the website or package. An
unreleased draft or a repository later made private still requires authorized
access. `package.json` retains `private: true` to prevent accidental npm publishing;
that field does not control GitHub repository visibility.

See [release operations](releases.md) and [dependency maintenance](dependencies.md).
