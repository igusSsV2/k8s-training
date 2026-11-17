const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {metadataFrom, planReleases, releaseNotes, changelogFor} = require('./core.cjs');
const {git, readChanges} = require('./git.cjs');
const {GitHub} = require('./github.cjs');
const {packageZip} = require('./package.cjs');
const {smokeZip} = require('./smoke.cjs');

async function associatedPulls(github, sha, branch, {attempts = 3, sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))} = {}) {
  let associated = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    associated = await github.list(`commits/${sha}/pulls`);
    const merged = associated.filter(pr => pr.merged_at && pr.base.ref === branch);
    if (merged.some(pr => !/^[a-f0-9]{40}$/.test(pr.merge_commit_sha || ''))) {
      throw new Error('GitHub merged PR response lacks merge_commit_sha. Check the pinned REST API contract; this is not evidence of a direct push.');
    }
    if (merged.length) return associated;
    if (attempt + 1 < attempts) await sleep(500 * (attempt + 1));
  }
  return associated;
}

async function candidatesSince(root, policy, github) {
  const commits = git(root, ['rev-list', '--first-parent', '--reverse', `${policy.baselineCommit}..HEAD`]).split('\n').filter(Boolean);
  git(root, ['merge-base', '--is-ancestor', policy.baselineCommit, 'HEAD']);
  const candidates = [];
  let previous = policy.baselineCommit;
  for (const sha of commits) {
    const associated = await associatedPulls(github, sha, policy.branch);
    const merged = associated.filter(pr => pr.merged_at && pr.base.ref === policy.branch);
    const pr = merged.find(item => item.merge_commit_sha === sha);
    if (!pr) {
      if (merged.some(item => commits.includes(item.merge_commit_sha))) continue; // Earlier commit of a rebased PR.
      throw new Error(`Commit ${sha} has no merged PR to ${policy.branch}. Release processing stopped.`);
    }
    candidates.push({pr: pr.number, sha, labels: pr.labels, date: pr.merged_at.slice(0, 10), changes: readChanges(root, previous, sha)});
    previous = sha;
  }
  return candidates;
}

async function ensureTag(github, metadata) {
  const tag = `v${metadata.version}`;
  const existing = await github.request(`git/ref/tags/${tag}`, {optional: true});
  if (existing) {
    if (existing.object.type !== 'commit' || existing.object.sha !== metadata.sha) throw new Error(`Tag ${tag} points to another commit. It will not be overwritten.`);
  } else await github.request('git/refs', {method: 'POST', body: {ref: `refs/tags/${tag}`, sha: metadata.sha}});
}

async function uploadAssets(github, release, files) {
  if (!release.draft || !metadataFrom(release.body)) throw new Error('Only an identified draft may have its assets replaced.');
  const previous = await github.list(`releases/${release.id}/assets`);
  // Only a verified draft belonging to this exact PR/commit reaches this function.
  for (const asset of previous) await github.request(`releases/assets/${asset.id}`, {method: 'DELETE'});
  for (const file of files) {
    const route = `${release.upload_url.replace(/\{.*$/, '')}?name=${encodeURIComponent(path.basename(file))}`;
    await github.request(route, {method: 'POST', bytes: fs.readFileSync(file), contentType: file.endsWith('.zip') ? 'application/zip' : 'text/plain'});
  }
}

function validateSource(source) {
  const env = {...process.env}; delete env.GH_TOKEN; delete env.GITHUB_TOKEN;
  const options = {cwd: source, stdio: 'inherit', env};
  const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  for (const args of [['ci', '--ignore-scripts'], ['run', 'check'], ['test']]) execFileSync(process.execPath, [npm, ...args], options);
  execFileSync(process.execPath, [path.join(source, 'node_modules/@playwright/test/cli.js'), 'install', 'chromium'], options);
  execFileSync(process.execPath, [npm, 'run', 'test:browser'], options);
  for (const script of ['training/scripts/Test-Course.ps1', 'training/troubleshooting/Test-Lab.ps1']) {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(source, script)], options);
  }
}

async function preparePackage({root, metadata, notes, history}) {
  const workRoot = path.join(root, '.tools'); fs.mkdirSync(workRoot, {recursive: true});
  const work = fs.mkdtempSync(path.join(workRoot, `release-${metadata.version}-`));
  const source = path.join(work, 'source');
  const sourceZip = path.join(work, 'source.zip');
  execFileSync('git', ['-C', root, 'archive', '--format=zip', '-o', sourceZip, metadata.sha]);
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'Expand-Source.ps1'), '-Archive', sourceZip, '-Destination', source], {stdio: 'inherit'});
  validateSource(source);
  const result = packageZip({root: source, output: path.join(work, 'assets'), metadata, changelog: changelogFor([notes, ...history]), published: true});
  await smokeZip({archive: result.archive, version: metadata.version, directory: path.join(work, 'smoke')});
  return result;
}

async function publish({root = path.resolve(__dirname, '../..'), github, prepare = preparePackage} = {}) {
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'release-policy.json'), 'utf8'));
  if (!github) {
    if (process.env.GITHUB_REPOSITORY?.toLowerCase() !== policy.repository.toLowerCase()) throw new Error('Release workflow repository does not match release-policy.json.');
    github = new GitHub({repository: policy.repository, token: process.env.GH_TOKEN});
  }
  const existing = await github.list('releases');
  if (existing.some(release => !release.draft && !release.prerelease && /^v\d+\.\d+\.\d+$/.test(release.tag_name) && !metadataFrom(release.body))) throw new Error('A stable release exists without pipeline identity metadata. Review/import that release before publishing.');
  const plans = planReleases(await candidatesSince(root, policy, github), existing, policy.initialVersion);
  const history = [];
  for (const plan of plans) {
    const {metadata} = plan;
    const notes = plan.release?.body || releaseNotes(metadata, plan.changes, policy.repository);
    const filename = `k8s-training-v${metadata.version}-windows-x64.zip`;
    if (plan.published) {
      await ensureTag(github, metadata);
      const assets = await github.list(`releases/${plan.release.id}/assets`);
      if (![filename, `${filename}.sha256`, 'CHANGELOG.md'].every(name => assets.some(asset => asset.name === name && asset.state === 'uploaded'))) throw new Error(`Published v${metadata.version} has incomplete assets; refusing to overwrite it.`);
      console.log(`Already published: v${metadata.version} (PR #${metadata.pr}).`);
      history.unshift(notes); continue;
    }
    const result = await prepare({root, metadata, notes, history});
    await ensureTag(github, metadata);
    const release = plan.release || await github.request('releases', {method: 'POST', body: {tag_name: `v${metadata.version}`, target_commitish: metadata.sha, name: `K8s Training v${metadata.version}`, body: notes, draft: true, prerelease: false}});
    if (!release.draft || metadataFrom(release.body)?.sha !== metadata.sha || metadataFrom(release.body)?.pr !== metadata.pr) throw new Error('Draft identity changed; refusing to upload.');
    await uploadAssets(github, release, [result.archive, result.checksum, result.changelog]);
    await github.request(`releases/${release.id}`, {method: 'PATCH', body: {draft: false, make_latest: 'true'}});
    history.unshift(notes);
    console.log(`Published v${metadata.version} from PR #${metadata.pr}.`);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Published [v${metadata.version}](https://github.com/${policy.repository}/releases/tag/v${metadata.version}) from PR #${metadata.pr}.\n\n`);
  }
  if (!plans.length) console.log('No merged PRs after the release baseline.');
}

if (require.main === module) publish().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {publish, candidatesSince, ensureTag, uploadAssets, associatedPulls};
