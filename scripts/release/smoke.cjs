const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {execFileSync} = require('node:child_process');

async function smokeZip({archive, version, directory}) {
  const env = {...process.env}; delete env.GH_TOKEN; delete env.GITHUB_TOKEN;
  const options = {stdio: 'inherit', env};
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'Expand-Source.ps1'), '-Archive', archive, '-Destination', directory], options);
  const root = path.join(directory, 'k8s-training');
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
  if (metadata.version !== version || !fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').includes(`## [v${version}]`)) throw new Error('Extracted package version/changelog mismatch.');
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(root, 'Start-K8Training.ps1'), '-Port', String(port), '-NoBrowser'], options);
    const response = await fetch(`http://127.0.0.1:${port}/api/version`);
    const actual = await response.json();
    if (!response.ok || actual.version !== version) throw new Error('Extracted service did not report the packaged version.');
    const page = await fetch(`http://127.0.0.1:${port}/`);
    if (!page.ok || !(await page.text()).includes('Your lab, under control.')) throw new Error('Extracted frontend did not load.');
    console.log(`PASS: extracted v${version} launches and serves its frontend.`);
  } finally {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(root, 'Stop-K8Training.ps1'), '-Port', String(port)], options);
  }
}

module.exports = {smokeZip};
