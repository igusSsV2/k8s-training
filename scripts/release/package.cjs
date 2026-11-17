const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {parseVersion} = require('./core.cjs');

const allowed = ['dist', 'server', 'training', 'docs', 'README.md', 'AGENTS.md', 'Start-K8Training.ps1', 'Stop-K8Training.ps1', 'Run-K8Training.cmd', 'LICENSE'];

function copySource(source, target) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Package sources must not be symlinks: ${source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, {recursive: true});
    for (const entry of fs.readdirSync(source).sort()) {
      if (/^(?:\.tools|\.git|\.openai|node_modules|\.env(?:\..*)?|kubeconfig(?:\..*)?)$/.test(entry) || /\.(?:pem|key)$/.test(entry)) throw new Error(`Local-only file in package sources: ${entry}`);
      copySource(path.join(source, entry), path.join(target, entry));
    }
  } else if (stat.isFile()) fs.copyFileSync(source, target);
  else throw new Error(`Unsupported package source: ${source}`);
}

function stagePackage({root, directory, metadata, changelog, published = false}) {
  parseVersion(metadata.version);
  if (fs.existsSync(directory)) throw new Error('Package staging directory already exists. Use a fresh directory.');
  fs.mkdirSync(directory, {recursive: true});
  for (const relative of allowed) {
    // Earlier commits predate license selection; don't retroactively relicense them.
    if (relative === 'LICENSE' && !fs.existsSync(path.join(root, relative))) continue;
    copySource(path.join(root, relative), path.join(directory, relative));
  }
  const original = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (Object.keys(original.dependencies || {}).length) throw new Error('Runtime dependencies need an explicit packaging strategy before publishing.');
  const manifest = {name: original.name, version: metadata.version, private: true, description: original.description, engines: original.engines, scripts: {start: original.scripts.start}, ...(original.license ? {license: original.license} : {})};
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'release.json'), JSON.stringify({...metadata, platform: 'windows', architecture: 'x64', published}, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'CHANGELOG.md'), changelog);
  return directory;
}

function packageZip({root, output, metadata, changelog, published}) {
  fs.mkdirSync(output, {recursive: true});
  const directory = path.join(output, 'k8s-training');
  stagePackage({root, directory, metadata, changelog, published});
  const filename = `k8s-training-v${metadata.version}-windows-x64.zip`;
  const archive = path.join(output, filename);
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'Compress-Package.ps1'), '-Source', directory, '-Destination', archive], {stdio: 'inherit'});
  const sha256 = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  fs.writeFileSync(`${archive}.sha256`, `${sha256}  ${filename}\n`);
  fs.writeFileSync(path.join(output, 'CHANGELOG.md'), changelog);
  return {archive, checksum: `${archive}.sha256`, changelog: path.join(output, 'CHANGELOG.md'), directory, sha256};
}

module.exports = {allowed, copySource, stagePackage, packageZip};
