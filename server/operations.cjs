const {EventEmitter} = require('node:events');
const {spawn} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const {StringDecoder} = require('node:string_decoder');
const {actions, validateAction, commandFor} = require('./actions.cjs');

function redact(text) {
  // eslint-disable-next-line no-control-regex -- Strip terminal color codes before showing subprocess output.
  return String(text).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/(?:gh[pousr]_[\w]+|github_pat_[\w]+)/g, '[redacted]')
    .replace(/((?:authorization|password|token|client-key-data|client-certificate-data|certificate-authority-data)\s*[:=]\s*)(?:Bearer\s+)?[^\s,;]+/gi, '$1[redacted]')
    .slice(0, 2000);
}

class Operations extends EventEmitter {
  constructor({root, spawnProcess = spawn}) {
    super();
    this.root = root;
    this.spawnProcess = spawnProcess;
    this.operation = null;
    this.closing = false;
  }

  snapshot() { return this.operation ? structuredClone(this.operation) : null; }

  update() { this.emit('update', this.snapshot()); }

  log(message, stream = 'stdout') {
    const op = this.operation;
    const text = redact(message);
    if (!text.trim()) return;
    op.logs.push({at: new Date().toISOString(), stream, message: text});
    if (op.logs.length > 500) op.logs.shift();
    this.update();
  }

  line(line, stream) {
    if (line.startsWith('KUBE_EVENT ')) {
      try {
        const event = JSON.parse(line.slice(11));
        if (event.type === 'step' && typeof event.message === 'string') {
          this.operation.step = redact(event.message);
          this.log(event.message, 'step');
          return;
        }
        if (event.type === 'guidance' && typeof event.message === 'string') {
          this.log(event.message, 'guidance');
          return;
        }
      } catch { /* Treat malformed output as a regular log line. */ }
    }
    this.log(line, stream);
  }

  start(input) {
    const selection = validateAction(input);
    if (this.closing || this.operation?.status === 'running' || this.operation?.status === 'pending') {
      const error = new Error('Another operation is active. Wait for it to finish before starting a new action.');
      error.statusCode = 409;
      throw error;
    }
    const definition = actions.find(item => item.id === selection.action);
    this.operation = {
      id: randomUUID(), ...selection, title: definition.title, status: 'pending',
      step: definition.initial, startedAt: new Date().toISOString(), finishedAt: null,
      exitCode: null, message: 'Starting background PowerShell process.', logs: []
    };
    this.update();
    const initial = this.snapshot();
    // Yield so subscribers can see the pending state before process output arrives.
    setImmediate(() => this.run(selection));
    return initial;
  }

  run(selection) {
    const op = this.operation;
    const command = commandFor(this.root, selection);
    op.status = 'running';
    op.message = 'PowerShell is running in the background.';
    this.update();
    try {
      const child = this.spawnProcess(command.file, command.args, {
        cwd: this.root, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
        env: {...process.env, KUBE_LAB_EVENTS: '1', NO_COLOR: '1'}
      });
      for (const [stream, name] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) {
        const decoder = new StringDecoder('utf8');
        let pending = '';
        stream.on('data', chunk => {
          pending += decoder.write(chunk);
          const lines = pending.split(/\r?\n/);
          pending = lines.pop();
          for (const line of lines) this.line(line, name);
          if (pending.length > 4000) { this.line(pending, name); pending = ''; }
        });
        stream.on('end', () => { pending += decoder.end(); if (pending) this.line(pending, name); });
      }
      child.once('error', error => this.finish(null, error.code === 'ENOENT'
        ? 'Windows PowerShell is unavailable. Run the local service on Windows with PowerShell installed.'
        : `Could not start PowerShell: ${redact(error.message)}`));
      child.once('close', (code, signal) => {
        if (op.finishedAt) return;
        this.finish(code, signal ? `PowerShell stopped (${signal}). Inspect the lab before retrying.` : null);
      });
    } catch (error) { this.finish(null, `Could not start PowerShell: ${redact(error.message)}`); }
  }

  finish(code, error) {
    const op = this.operation;
    if (op.finishedAt) return;
    op.exitCode = code;
    op.finishedAt = new Date().toISOString();
    const guidance = [...op.logs].reverse().find(item => item.stream === 'guidance')?.message;
    if (error) {
      op.status = 'failed'; op.message = error;
    } else if (code === 2) {
      op.status = 'needs-action'; op.message = 'Restart Windows, then retry this action. Setup never restarts Windows automatically.';
    } else if (code === 3 || guidance) {
      op.status = 'needs-action'; op.message = guidance || 'Complete the requested host setup step, then retry.';
    } else if (code === 0) {
      op.status = 'succeeded';
      op.message = ['setup', 'deploy'].includes(op.action) || (op.action === 'check' && op.state === 'Broken')
        ? 'Ready for troubleshooting (intentionally broken).'
        : op.action === 'check' ? 'Repair checks passed. Complete your explain-back evidence too.' : 'Operation completed successfully.';
    } else {
      op.status = 'failed'; op.message = 'The script reported a failure. Review the activity log, resolve the cause, and retry.';
    }
    this.update();
    this.emit('finished');
  }
}

module.exports = {Operations, redact};
