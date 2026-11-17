const path = require('node:path');
const {spawn} = require('node:child_process');
const {Operations} = require('../../server/operations.cjs');
const {createApp} = require('../../server/index.cjs');

// Browser tests exercise the real HTTP/SSE/process plumbing with a deterministic
// child process, never a learner's actual Docker installation or cluster.
const operations = new Operations({
  root: path.resolve(__dirname, '../..'),
  spawnProcess(file, args) {
    const action = args.find(item => item.endsWith('.ps1'));
    const failing = action.endsWith('Check-Lab.ps1') && args.includes('Healthy');
    const fixture = `console.log('KUBE_EVENT {"type":"step","message":"Checking Docker Linux engine"}'); setTimeout(() => { console.log('Fixture operation finished'); process.exitCode = ${failing ? 1 : 0}; }, 1800);`;
    return spawn(process.execPath, ['-e', fixture], {stdio: ['ignore', 'pipe', 'pipe']});
  }
});
createApp({operations}).server.listen(8788, '127.0.0.1');
