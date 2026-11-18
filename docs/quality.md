# Code quality checks

Run commands from the repository root on Windows. Runtime use of the dashboard
does not require development dependencies; these tools are only for contributors
and CI.

## Install

Use Node.js 22 or newer, Windows PowerShell 5.1, Python 3.13 with pip, and internet
access. Install the lockfile dependencies and pinned external tools:

```powershell
npm ci
powershell -NoProfile -File scripts/quality/Setup-QualityTools.ps1
```

The setup script creates a virtual environment and installs the pinned
requirements in `requirements-quality.txt`, downloads actionlint 1.7.12 after
verifying its published SHA-256 digest, and saves PSScriptAnalyzer 1.24.0 under
the ignored `.tools/quality/` directory. Node tooling is locked by
`package-lock.json`. Review upgrades and regenerate the lockfile when changing
versions.

PSScriptAnalyzer omits only `PSAvoidUsingWriteHost`, because these scripts use
terminal output for learner-facing progress. The PowerShell regression fixture
retains two unused parameters so its mocked functions match the production
command signatures; that one file excludes only `PSReviewUnusedParameter`.
Other analyzer warnings and errors fail the check.

## Run checks

```powershell
npm run lint
npm run check
npm test
npx playwright install chromium
npm run test:browser
powershell -NoProfile -File training/scripts/Test-Course.ps1
powershell -NoProfile -File training/troubleshooting/Test-Lab.ps1
```

`npm run lint` runs ESLint, Prettier in check-only mode, CSpell, yamllint,
actionlint and PSScriptAnalyzer. Run a focused check with `npm run lint:js`,
`lint:format`, `lint:spelling`, `lint:yaml`, `lint:actions` or
`lint:powershell`. Prettier corrections can be applied locally with
`npx prettier --write README.md "docs/**/*.md" "training/**/*.md"
"changes/*.json" ".github/**/*.{yaml,yml}" package.json *.json`;
review the diff before committing. ESLint can apply safe fixes with
`npx eslint --fix dist/app.js dist/control.js server scripts tests
playwright.config.cjs`.

The Windows **Quality checks** PR job runs lint independently of the test job.
The Windows ZIP preview depends on both. Release publishing extracts the exact
source commit and repeats lint, syntax, Node, browser, course and lab regression
checks before producing a release. Live Docker/Kubernetes integration remains a
manual opt-in because it creates and mutates cluster resources:

```powershell
powershell -NoProfile -File training/troubleshooting/Test-Lifecycle.ps1
```

That lifecycle script exercises deploy, broken-state checks, recovery, reset
isolation, and idempotent cleanup in the dedicated training cluster. It leaves
the cluster running. Browser tests use deterministic process fixtures and do not
prove Docker host integration. Updater-specific tests are added with issue #5;
real host/browser smoke coverage is tracked with issue #3.
