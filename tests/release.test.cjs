const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {parseVersion, releaseLabel, bumpVersion, validateChange, metadataFrom, releaseNotes, changelogFor, planReleases} = require('../scripts/release/core.cjs');
const {stagePackage, packageZip} = require('../scripts/release/package.cjs');
const {readChanges} = require('../scripts/release/git.cjs');
const {publish, candidatesSince, ensureTag, uploadAssets, associatedPulls, checkPublicationAuthorization} = require('../scripts/release/publish.cjs');
const {GitHub, API_VERSION} = require('../scripts/release/github.cjs');
const {smokeZip} = require('../scripts/release/smoke.cjs');

const root = path.resolve(__dirname, '..');
const repository = 'igusSsV2/k8s-training';
const change = {type: 'added', description: 'A useful feature.', issues: [4, 10], breaking: false};
const metadata = {schema: 1, pr: 16, sha: 'a'.repeat(40), previousVersion: '0.0.0', version: '0.1.0', bump: 'minor', date: '2026-11-17'};
function temporary() { return fs.mkdtempSync(path.join(os.tmpdir(), 'k8s release test ')); }

test('GitHub authorization diagnostics expose the cause without exposing the token', async () => {
  const token = 'test-only-sensitive-token';
  const github = new GitHub({repository, token, fetchRequest: async () => ({ok: false, status: 403, json: async () => ({message: `Resource not accessible by integration ${token}`})})});
  await assert.rejects(github.request('git/refs', {method: 'POST', body: {ref: 'refs/tags/v0.1.0', sha: metadata.sha}}), error => {
    assert.match(error.message, /403.*git\/refs.*Resource not accessible/);
    assert.ok(!error.message.includes(token));
    return true;
  });
});

test('historical workflow publication requires an explicit scoped publishing credential before building', () => {
  const temp = temporary();
  const git = (...args) => execFileSync('git', ['-C', temp, ...args], {encoding: 'utf8'}).trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  fs.mkdirSync(path.join(temp, '.github/workflows'), {recursive: true});
  fs.writeFileSync(path.join(temp, '.github/workflows/build.yml'), 'name: initial');
  git('add', '.'); git('commit', '-m', 'Initial'); const previous = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(temp, '.github/workflows/build.yml'), 'name: changed');
  git('add', '.'); git('commit', '-m', 'Changed workflows');
  const plans = [{published: false, metadata: {...metadata, sha: previous}}];
  assert.throws(() => checkPublicationAuthorization(temp, plans, 'github-token'), /RELEASE_PUBLISH_TOKEN/);
  assert.doesNotThrow(() => checkPublicationAuthorization(temp, plans, 'repository-secret'));
  assert.doesNotThrow(() => checkPublicationAuthorization(temp, [{...plans[0], published: true}], 'github-token'));
  assert.doesNotThrow(() => checkPublicationAuthorization(temp, [{published: false, metadata: {...metadata, sha: git('rev-parse', 'HEAD')}}], 'github-token'));
});

test('release API requests pin the PR response contract required for merge identity', async () => {
  let captured;
  const github = new GitHub({repository, token: 'test-only', fetchRequest: async (url, options) => {
    captured = {url, options}; return {ok: true, status: 200, json: async () => []};
  }});
  await github.list('commits/test/pulls');
  assert.equal(API_VERSION, '2022-11-28');
  assert.equal(captured.options.headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.ok(captured.url.startsWith(`https://api.github.com/repos/${repository}/`));
});

test('merged PR discovery retries missing associations but distinguishes an incompatible schema', async () => {
  const merged = {number: 16, merged_at: '2026-11-17T20:00:00Z', base: {ref: 'main'}, merge_commit_sha: metadata.sha};
  let reads = 0; const waits = [];
  const result = await associatedPulls({list: async () => ++reads === 1 ? [] : [merged]}, metadata.sha, 'main', {sleep: async delay => waits.push(delay)});
  assert.deepEqual(result, [merged]); assert.equal(reads, 2); assert.deepEqual(waits, [500]);
  reads = 0;
  const missing = await associatedPulls({list: async () => { reads++; return []; }}, metadata.sha, 'main', {sleep: async () => {}});
  assert.deepEqual(missing, []); assert.equal(reads, 3);
  await assert.rejects(associatedPulls({list: async () => [{...merged, merge_commit_sha: undefined}]}, metadata.sha, 'main'), /pinned REST API contract/);
});

test('exactly one supported release label is required, independent of other labels', () => {
  assert.equal(releaseLabel([{name: 'enhancement'}, {name: 'minor'}]), 'minor');
  for (const labels of [[], ['bug'], ['major', 'minor'], ['patch', 'minor'], ['PATCH']]) assert.throws(() => releaseLabel(labels));
});

test('semantic versions increment numerically and reset lower components', () => {
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(bumpVersion('1.2.9', 'patch'), '1.2.10');
  assert.equal(bumpVersion('0.0.0', 'minor'), '0.1.0');
  for (const value of ['v1.2.3', '01.2.3', '1.2', '1.2.3-beta.1', '../1.2.3', '9007199254740992.0.0']) assert.throws(() => parseVersion(value));
});

test('changelog entries validate structure and include breaking changes, PRs, issues and cumulative versions', () => {
  assert.equal(validateChange(change), change);
  assert.throws(() => validateChange({...change, type: 'anything'}));
  assert.throws(() => validateChange({...change, breaking: 'yes'}));
  assert.throws(() => validateChange({...change, issues: [-1]}));
  assert.throws(() => validateChange({...change, token: 'unexpected'}));
  const notes = releaseNotes(metadata, [{...change, breaking: true}], repository);
  assert.deepEqual(metadataFrom(notes), metadata);
  assert.match(notes, /Breaking changes/);
  assert.match(notes, /issues\/4/);
  assert.match(notes, /pull\/16/);
  const history = changelogFor([notes, releaseNotes({...metadata, version: '0.0.1', bump: 'patch', pr: 15}, [change], repository)]);
  assert.match(history, /\[v0.1.0\] - 2026-11-17/);
  assert.match(history, /\[v0.0.1\]/);
  assert.ok(!history.includes('<!-- kube-release'));
});

test('queued merges receive ordered distinct versions and retries preserve released identities', () => {
  const candidates = [
    {pr: 16, sha: 'a'.repeat(40), labels: ['minor'], date: metadata.date},
    {pr: 17, sha: 'b'.repeat(40), labels: ['patch'], date: metadata.date},
    {pr: 18, sha: 'c'.repeat(40), labels: ['major'], date: metadata.date}
  ];
  assert.deepEqual(planReleases(candidates, []).map(plan => plan.metadata.version), ['0.1.0', '0.1.1', '1.0.0']);
  const draft = {id: 1, tag_name: 'v0.1.0', body: releaseNotes(metadata, [change], repository), draft: true};
  const retry = planReleases([{...candidates[0], labels: ['major']}], [draft])[0];
  assert.equal(retry.metadata.version, '0.1.0');
  assert.equal(retry.published, false);
  assert.equal(planReleases([candidates[0]], [{...draft, draft: false}])[0].published, true);
  assert.throws(() => planReleases([{...candidates[0], sha: 'b'.repeat(40)}], [draft]), /disagrees/);
  assert.throws(() => planReleases([candidates[0]], [{...draft, body: 'Foreign release'}]), /another release/);
  assert.throws(() => planReleases([candidates[0]], [draft, {...draft, id: 2}]), /Multiple releases/);
});

test('tags are idempotent and conflicting tags cannot be overwritten', async () => {
  const writes = [];
  await ensureTag({request: async (route, options) => { if (!options?.body) return null; writes.push(options.body); }}, metadata);
  assert.deepEqual(writes, [{ref: 'refs/tags/v0.1.0', sha: metadata.sha}]);
  await ensureTag({request: async () => ({object: {type: 'commit', sha: metadata.sha}})}, metadata);
  await assert.rejects(ensureTag({request: async () => ({object: {type: 'commit', sha: 'b'.repeat(40)}})}, metadata), /not be overwritten/);
});

test('draft asset recovery refuses published or unidentified releases', async () => {
  const github = {list: async () => { throw new Error('Must not mutate published assets'); }};
  await assert.rejects(uploadAssets(github, {draft: false, body: releaseNotes(metadata, [change], repository)}, []), /Only an identified draft/);
  await assert.rejects(uploadAssets(github, {draft: true, body: 'foreign draft'}, []), /Only an identified draft/);
});

test('package stages only runtime sources and generated, matching version metadata', () => {
  const temp = temporary();
  const destination = path.join(temp, 'package');
  const changelog = changelogFor([releaseNotes(metadata, [change], repository)]);
  stagePackage({root, directory: destination, metadata, changelog, published: false});
  const manifest = JSON.parse(fs.readFileSync(path.join(destination, 'package.json')));
  assert.equal(manifest.version, metadata.version);
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.equal(manifest.license, sourceManifest.license);
  if (fs.existsSync(path.join(root, 'LICENSE'))) assert.equal(fs.readFileSync(path.join(destination, 'LICENSE'), 'utf8'), fs.readFileSync(path.join(root, 'LICENSE'), 'utf8'));
  assert.equal(manifest.devDependencies, undefined);
  assert.deepEqual(Object.keys(manifest.scripts), ['start']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(destination, 'release.json'))).version, metadata.version);
  assert.equal(fs.readFileSync(path.join(destination, 'CHANGELOG.md'), 'utf8'), changelog);
  for (const excluded of ['.git', '.tools', '.openai', '.env', 'node_modules', 'tests', 'package-lock.json']) assert.equal(fs.existsSync(path.join(destination, excluded)), false);
  assert.ok(fs.existsSync(path.join(destination, 'Start-K8Training.ps1')));
  assert.ok(fs.existsSync(path.join(destination, 'server/index.cjs')));
});

test('committed changelog entries and merge candidates are read in ancestry order', async () => {
  const temp = temporary();
  const git = (...args) => execFileSync('git', ['-C', temp, ...args], {encoding: 'utf8'}).trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  fs.writeFileSync(path.join(temp, 'README.md'), 'baseline'); git('add', '.'); git('commit', '-m', 'Baseline');
  const baseline = git('rev-parse', 'HEAD');
  fs.mkdirSync(path.join(temp, 'changes'));
  fs.writeFileSync(path.join(temp, 'changes/4-test.json'), JSON.stringify(change)); git('add', '.'); git('commit', '-m', 'Feature');
  const first = git('rev-parse', 'HEAD');
  assert.deepEqual(readChanges(temp, baseline, first), [change]);
  const pr = {number: 16, labels: [{name: 'minor'}], merged_at: '2026-11-17T20:00:00Z', merge_commit_sha: first, base: {ref: 'main'}};
  const candidates = await candidatesSince(temp, {baselineCommit: baseline, branch: 'main'}, {list: async () => [pr]});
  assert.equal(candidates[0].sha, first);
  await assert.rejects(candidatesSince(temp, {baselineCommit: baseline, branch: 'main'}, {list: async () => []}), /no merged PR/);
  assert.throws(() => readChanges(temp, first, first), /Add a new/);
});

test('Windows ZIP checksum and extracted startup match the release version', {skip: process.platform !== 'win32', timeout: 60000}, async () => {
  const temp = temporary();
  const result = packageZip({root, output: path.join(temp, 'assets'), metadata, changelog: changelogFor([releaseNotes(metadata, [change], repository)]), published: false});
  assert.equal(createHash('sha256').update(fs.readFileSync(result.archive)).digest('hex'), result.sha256);
  assert.equal(fs.readFileSync(result.checksum, 'utf8'), `${result.sha256}  ${path.basename(result.archive)}\n`);
  await smokeZip({archive: result.archive, version: metadata.version, directory: path.join(temp, 'extracted')});
});

test('publication gates writes on validation and resumes partial uploads without bumping twice', async () => {
  const temp = temporary();
  const git = (...args) => execFileSync('git', ['-C', temp, ...args], {encoding: 'utf8'}).trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  fs.writeFileSync(path.join(temp, 'README.md'), 'baseline'); git('add', '.'); git('commit', '-m', 'Baseline');
  const baseline = git('rev-parse', 'HEAD');
  fs.mkdirSync(path.join(temp, 'changes'));
  fs.writeFileSync(path.join(temp, 'changes/4-release.json'), JSON.stringify(change)); git('add', '.'); git('commit', '-m', 'Feature');
  const sha = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(temp, 'release-policy.json'), JSON.stringify({baselineCommit: baseline, initialVersion: '0.0.0', branch: 'main', repository}));
  const pr = {number: 16, labels: [{name: 'minor'}], merged_at: '2026-11-17T20:00:00Z', merge_commit_sha: sha, base: {ref: 'main'}};
  const releases = []; const tags = {}; const assets = []; const writes = [];
  let failUpload = true;
  const github = {
    async list(route) {
      if (route === 'releases') return releases;
      if (route.startsWith('commits/')) return [pr];
      if (route === 'releases/1/assets') return assets;
      throw new Error(`Unexpected list: ${route}`);
    },
    async request(route, options = {}) {
      if (route.startsWith('git/ref/tags/')) return tags[route.slice(13)] || null;
      writes.push({route, method: options.method});
      if (route === 'git/refs') { tags[options.body.ref.slice(10)] = {object: {type: 'commit', sha: options.body.sha}}; return {}; }
      if (route === 'releases' && options.method === 'POST') {
        const release = {id: 1, ...options.body, upload_url: 'https://uploads.github.com/repos/test/releases/1/assets{?name,label}'};
        releases.push(release); return release;
      }
      if (route.startsWith('releases/assets/')) { assets.splice(assets.findIndex(asset => String(asset.id) === route.split('/').at(-1)), 1); return null; }
      if (route.startsWith('https://uploads.github.com/')) {
        const name = new URL(route).searchParams.get('name');
        if (failUpload && name.endsWith('.sha256')) throw new Error('Interrupted upload');
        const asset = {id: assets.length + 1, name, state: 'uploaded'}; assets.push(asset); return asset;
      }
      if (route === 'releases/1' && options.method === 'PATCH') { Object.assign(releases[0], options.body); return releases[0]; }
      throw new Error(`Unexpected write: ${route}`);
    }
  };
  await assert.rejects(publish({root: temp, github, prepare: async () => { throw new Error('Tests failed'); }}), /Tests failed/);
  assert.equal(writes.length, 0);
  const output = path.join(temp, 'assets'); fs.mkdirSync(output);
  const archive = path.join(output, 'k8s-training-v0.1.0-windows-x64.zip');
  const checksum = `${archive}.sha256`; const changelog = path.join(output, 'CHANGELOG.md');
  for (const file of [archive, checksum, changelog]) fs.writeFileSync(file, 'test fixture');
  const versions = [];
  const prepare = async ({metadata: actual}) => { versions.push(actual.version); return {archive, checksum, changelog}; };
  await assert.rejects(publish({root: temp, github, prepare}), /Interrupted upload/);
  assert.equal(releases.length, 1); assert.equal(releases[0].draft, true);
  failUpload = false; pr.labels = [{name: 'major'}]; // A resumed draft keeps its frozen bump.
  await publish({root: temp, github, prepare, log: message => console.log(`SIMULATED: ${message}`)});
  assert.equal(releases.length, 1); assert.equal(releases[0].draft, false);
  assert.equal(assets.length, 3);
  const afterPublication = writes.length;
  await publish({root: temp, github, prepare: async () => { throw new Error('Published release must be skipped'); }, log: () => {}});
  assert.equal(writes.length, afterPublication);
  assert.deepEqual(versions, ['0.1.0', '0.1.0']);
});
