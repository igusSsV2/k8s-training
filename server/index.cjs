const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID, createHash} = require('node:crypto');
const {Operations} = require('./operations.cjs');
const {actions} = require('./actions.cjs');

const root = path.resolve(__dirname, '..');
const instance = createHash('sha256').update(root.toLowerCase()).digest('hex');
const staticFiles = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/style.css', ['style.css', 'text/css']], ['/control.css', ['control.css', 'text/css']], ['/icons.css', ['icons.css', 'text/css']],
  ['/app.js', ['app.js', 'text/javascript']], ['/course.js', ['course.js', 'text/javascript']],
  ['/control.js', ['control.js', 'text/javascript']]
]);

function createApp({operations = new Operations({root})} = {}) {
  const token = randomUUID();
  const clients = new Set();
  function broadcast(operation) {
    const frame = `event: operation\ndata: ${JSON.stringify(operation)}\n\n`;
    for (const client of clients) {
      if (client.writableLength > 1024 * 1024) { client.destroy(); clients.delete(client); }
      else client.write(frame);
    }
  }
  operations.on('update', broadcast);
  const server = http.createServer(async (request, response) => {
    const json = (status, value) => { response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'}); response.end(JSON.stringify(value)); };
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
    const port = server.address()?.port;
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!allowedHosts.includes(request.headers.host)) return json(403, {error: 'Invalid local host.'});
    const origin = `http://${request.headers.host}`;
    if (request.headers.origin && request.headers.origin !== origin) return json(403, {error: 'Only the local dashboard may access this service.'});
    let url;
    try { url = new URL(request.url, origin); } catch { return json(400, {error: 'Invalid URL.'}); }
    try {
      if (request.method === 'GET' && url.pathname === '/api/health') return json(200, {application: 'kube-together', instance});
      if (request.method === 'GET' && url.pathname === '/api/version') {
        const releaseFile = path.join(root, 'release.json');
        const release = fs.existsSync(releaseFile) ? JSON.parse(fs.readFileSync(releaseFile, 'utf8')) : null;
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        return json(200, {version: release?.version || manifest.version, channel: release ? release.published ? 'release' : 'preview' : 'development', changelog: '/changelog'});
      }
      if (request.method === 'GET' && url.pathname === '/changelog') {
        response.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
        fs.createReadStream(path.join(root, 'CHANGELOG.md')).on('error', () => response.destroy()).pipe(response);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/session') return json(200, {
        token, actions: actions.map(({id, title, scenario, state, destructive}) => ({id, title, scenario: !!scenario, state: !!state, destructive: !!destructive})),
        operation: operations.snapshot()
      });
      if (request.method === 'GET' && url.pathname === '/api/events') {
        response.writeHead(200, {'Content-Type': 'text/event-stream', Connection: 'keep-alive'});
        response.write(`retry: 2000\nevent: operation\ndata: ${JSON.stringify(operations.snapshot())}\n\n`);
        clients.add(response);
        const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15000);
        request.on('close', () => { clearInterval(heartbeat); clients.delete(response); });
        return;
      }
      if (request.method === 'POST' && ['/api/operations', '/api/shutdown'].includes(url.pathname)) {
        if (request.headers.origin !== origin || request.headers['x-lab-token'] !== token) return json(403, {error: 'Reload the local dashboard before starting an action.'});
        if (request.headers['content-type']?.split(';')[0] !== 'application/json') return json(415, {error: 'Expected JSON.'});
        let body = '';
        for await (const chunk of request) {
          body += chunk.toString('utf8');
          if (Buffer.byteLength(body) > 2048) return json(413, {error: 'Request too large.'});
        }
        let selection;
        try { selection = JSON.parse(body); } catch { return json(400, {error: 'Invalid JSON.'}); }
        if (url.pathname === '/api/shutdown') {
          if (['pending', 'running'].includes(operations.operation?.status)) return json(409, {error: 'Wait for the active operation to finish before stopping the service.'});
          operations.closing = true;
          json(202, {message: 'Local service is stopping.'});
          setImmediate(() => { closeStreams(); server.close(); });
          return;
        }
        return json(202, operations.start(selection));
      }
      const asset = staticFiles.get(url.pathname);
      if (request.method === 'GET' && asset) {
        response.writeHead(200, {'Content-Type': `${asset[1]}; charset=utf-8`});
        fs.createReadStream(path.join(root, 'dist', asset[0])).on('error', () => response.destroy()).pipe(response);
        return;
      }
      json(404, {error: 'Not found.'});
    } catch (error) { json(error.statusCode || 400, {error: error.message}); }
  });
  server.on('close', () => { operations.off('update', broadcast); });
  function closeStreams() { for (const client of clients) client.end(); }
  return {server, operations, closeStreams};
}

if (require.main === module) {
  const port = Number(process.env.KUBE_TOGETHER_PORT || 8787);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a port between 1024 and 65535.');
  const app = createApp();
  app.server.on('error', error => { console.error(`Could not start local service: ${error.message}`); process.exitCode = 1; });
  app.server.listen(port, '127.0.0.1', () => console.log(`Kube Together: http://127.0.0.1:${port}`));
  let stopping = false;
  function stop() {
    if (stopping) return;
    stopping = true;
    app.operations.closing = true;
    const finish = () => { app.closeStreams(); app.server.close(); };
    if (['running', 'pending'].includes(app.operations.operation?.status)) {
      console.log('Waiting for the active lab operation to finish before shutting down.');
      app.operations.once('finished', finish);
    } else finish();
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

module.exports = {createApp};
