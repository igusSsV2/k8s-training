const fs = require('node:fs');
const path = require('node:path');
const {bumpVersion, releaseLabel, validateChange, releaseNotes, changelogFor} = require('./core.cjs');
const {git, readChanges} = require('./git.cjs');
const {packageZip} = require('./package.cjs');
const {smokeZip} = require('./smoke.cjs');

async function preview() {
  const root = path.resolve(__dirname, '../..');
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'release-policy.json'), 'utf8'));
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : null;
  const pr = event?.pull_request;
  const label = pr ? releaseLabel(pr.labels) : 'patch';
  const tags = git(root, ['tag', '--merged', 'HEAD', '--list', 'v*', '--sort=-version:refname']).split('\n');
  const latest = tags.find(tag => /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag));
  const metadata = {schema: 1, pr: pr?.number || 1, sha: git(root, ['rev-parse', 'HEAD']), previousVersion: latest?.slice(1) || policy.initialVersion, bump: label, date: new Date().toISOString().slice(0, 10)};
  metadata.version = bumpVersion(metadata.previousVersion, label);
  const changes = pr ? readChanges(root, pr.base.sha, pr.head.sha) : fs.readdirSync(path.join(root, 'changes')).filter(name => name.endsWith('.json')).map(name => validateChange(JSON.parse(fs.readFileSync(path.join(root, 'changes', name), 'utf8'))));
  const outputRoot = path.join(root, '.tools'); fs.mkdirSync(outputRoot, {recursive: true});
  const output = fs.mkdtempSync(path.join(outputRoot, 'package-preview-'));
  const packageResult = packageZip({root, output, metadata, changelog: changelogFor([releaseNotes(metadata, changes, policy.repository)]), published: false});
  await smokeZip({archive: packageResult.archive, version: metadata.version, directory: path.join(output, 'extracted')});
  console.log(`Preview ZIP: ${packageResult.archive}\nSHA-256: ${packageResult.sha256}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `directory=${output}\n`);
}

preview().catch(error => { console.error(error.message); process.exitCode = 1; });
