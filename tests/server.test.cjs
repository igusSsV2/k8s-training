const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter, once} = require('node:events');
const {PassThrough} = require('node:stream');
const {spawn} = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const {Operations, redact} = require('../server/operations.cjs');
const {validateAction, commandFor} = require('../server/actions.cjs');
const {createApp} = require('../server/index.cjs');

const root = path.resolve(__dirname, '..');
function fakeProcess() {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.finish = code => { child.stdout.end(); child.stderr.end(); setImmediate(() => child.emit('close', code, null)); };
  return child;
}

test('actions reject command injection and ambiguous destructive scope', () => {
  for (const input of [
    {action: 'exec'}, {action: 'deploy', scenario: '1; whoami'},
    {action: 'deploy', script: 'evil.ps1'}, {action: 'prerequisites', scenario: '1'},
    {action: 'deploy', state: 'Broken'}, {action: 'delete', scenario: '2'},
    {action: 'delete-cluster', confirmation: 'delete:All'}
  ]) assert.throws(() => validateAction(input));
  const selection = validateAction({action: 'delete', scenario: '2', confirmation: 'delete:2'});
  const command = commandFor(root, selection);
  assert.equal(command.file, 'powershell.exe');
  assert.deepEqual(command.args.slice(-2), ['-Scenario', '2']);
  assert.ok(command.args.includes('-NonInteractive'));
});

test('operations stream partial UTF-8 lines and real steps, redact secrets, and reject overlap', async () => {
  const child = fakeProcess();
  let options;
  const manager = new Operations({root, spawnProcess: (file, args, config) => { options = config; return child; }});
  const pending = manager.start({action: 'deploy', scenario: '2'});
  assert.equal(pending.status, 'pending');
  assert.throws(() => manager.start({action: 'check'}), /active/);
  await new Promise(setImmediate);
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  child.stdout.write('KUBE_EVENT {"type":"step","message":"Deploying');
  assert.notEqual(manager.snapshot().step, 'Deploying scenario 2');
  child.stdout.write(' scenario 2"}\r\ntoken=top-secret\n');
  const bytes = Buffer.from('café\n');
  child.stdout.write(bytes.subarray(0, 4)); child.stdout.write(bytes.subarray(4));
  assert.equal(manager.snapshot().step, 'Deploying scenario 2');
  assert.ok(!JSON.stringify(manager.snapshot()).includes('top-secret'));
  assert.equal(manager.snapshot().logs.at(-1).message, 'café');
  const finished = once(manager, 'finished'); child.finish(0); await finished;
  assert.equal(manager.snapshot().status, 'succeeded');
  assert.match(manager.snapshot().message, /intentionally broken/);
  const copy = manager.snapshot(); copy.logs.length = 0;
  assert.ok(manager.snapshot().logs.length > 0);
});

test('exit codes and manual guidance distinguish failure, restart and action needed', async () => {
  for (const [code, guidance, expected] of [[1, null, 'failed'], [2, null, 'needs-action'], [1, 'Complete Docker onboarding', 'needs-action'], [0, null, 'succeeded']]) {
    const child = fakeProcess();
    const manager = new Operations({root, spawnProcess: () => child});
    manager.start({action: 'prerequisites'}); await new Promise(setImmediate);
    if (guidance) child.stdout.write(`KUBE_EVENT ${JSON.stringify({type: 'guidance', message: guidance})}\n`);
    const finished = once(manager, 'finished'); child.finish(code); await finished;
    assert.equal(manager.snapshot().status, expected);
    assert.equal(manager.snapshot().exitCode, code);
    if (guidance) assert.equal(manager.snapshot().message, guidance);
  }
});

test('process spawn failure terminates the operation and permits retry', async () => {
  const child = fakeProcess();
  const manager = new Operations({root, spawnProcess: () => child});
  manager.start({action: 'prerequisites'}); await new Promise(setImmediate);
  child.emit('error', Object.assign(new Error('missing'), {code: 'ENOENT'}));
  assert.equal(manager.snapshot().status, 'failed');
  assert.equal(manager.snapshot().exitCode, null);
  assert.match(manager.snapshot().message, /PowerShell is unavailable/);
  assert.doesNotThrow(() => manager.start({action: 'prerequisites'}));
});

test('real child process output and nonzero exit reach the operation result', async () => {
  const manager = new Operations({root, spawnProcess: () => spawn(process.execPath, [path.join(__dirname, 'fixtures/process.cjs')], {stdio: ['ignore', 'pipe', 'pipe']})});
  const finished = once(manager, 'finished');
  manager.start({action: 'prerequisites'});
  await finished;
  assert.equal(manager.snapshot().exitCode, 7);
  assert.equal(manager.snapshot().status, 'failed');
  assert.equal(manager.snapshot().step, 'Fixture process running');
  assert.ok(manager.snapshot().logs.some(item => item.message === 'Fixture failure evidence'));
});

test('HTTP enforces local host/origin/token, validates actions and replays active state over SSE', async t => {
  const child = fakeProcess();
  const operations = new Operations({root, spawnProcess: () => child});
  const app = createApp({operations});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => { app.closeStreams(); app.server.closeAllConnections(); app.server.close(); });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const session = await (await fetch(`${origin}/api/session`)).json();
  const version = await (await fetch(`${origin}/api/version`)).json();
  assert.equal(version.channel, 'development');
  assert.equal(version.changelog, '/changelog');
  assert.match(await (await fetch(`${origin}/changelog`)).text(), /# Changelog/);
  const iconStyles = await fetch(`${origin}/icons.css`);
  assert.equal(iconStyles.status, 200);
  assert.match(await iconStyles.text(), /\.icon-library/);
  const headers = {'Content-Type': 'application/json', Origin: origin, 'X-Lab-Token': session.token};
  assert.equal((await fetch(`${origin}/.tools/kubeconfig`)).status, 404);
  const invalidHost = await new Promise((resolve, reject) => {
    http.get(`${origin}/api/session`, {headers: {Host: 'evil.test'}}, response => {
      response.resume(); resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(invalidHost, 403);
  assert.equal((await fetch(`${origin}/api/session`, {headers: {Origin: 'https://evil.test'}})).status, 403);
  assert.equal((await fetch(`${origin}/api/operations`, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: origin}, body: '{"action":"deploy"}'})).status, 403);
  assert.equal((await fetch(`${origin}/api/operations`, {method: 'POST', headers, body: '{"action":"exec"}'})).status, 400);
  const started = await fetch(`${origin}/api/operations`, {method: 'POST', headers, body: '{"action":"prerequisites"}'});
  assert.equal(started.status, 202);
  const selected = await started.json();
  assert.equal((await fetch(`${origin}/api/operations`, {method: 'POST', headers, body: '{"action":"prerequisites"}'})).status, 409);
  assert.equal((await fetch(`${origin}/api/shutdown`, {method: 'POST', headers, body: '{}'})).status, 409);
  const controller = new AbortController();
  const events = await fetch(`${origin}/api/events`, {signal: controller.signal});
  const reader = events.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.ok(first.includes(selected.id));
  assert.ok(first.includes('event: operation'));
  child.stdout.write('KUBE_EVENT {"type":"step","message":"Live step"}\n');
  const next = new TextDecoder().decode((await reader.read()).value);
  assert.match(next, /Live step/);
  const reloaded = await (await fetch(`${origin}/api/session`)).json();
  assert.equal(reloaded.operation.id, selected.id);
  assert.equal(reloaded.operation.step, 'Live step');
  controller.abort();
  const finished = once(operations, 'finished'); child.finish(0); await finished;
});

test('redaction covers GitHub tokens and credential fields', () => {
  assert.equal(redact('Authorization: Bearer secret-value'), 'Authorization: [redacted]');
  assert.equal(redact('client-key-data: abcdef'), 'client-key-data: [redacted]');
  assert.equal(redact('ghp_exampletoken'), '[redacted]');
});
