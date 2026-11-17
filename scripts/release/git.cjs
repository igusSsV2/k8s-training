const {execFileSync} = require('node:child_process');
const {validateChange} = require('./core.cjs');

function git(root, args) { return execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024}).trim(); }

function readChanges(root, base, head) {
  const files = git(root, ['diff', '--name-only', '--diff-filter=A', base, head, '--', 'changes/']).split('\n').filter(Boolean);
  if (!files.length) throw new Error('Add a new changes/<issue>-description.json entry in this PR.');
  return files.map(file => {
    if (!/^changes\/[a-z0-9][a-z0-9-]*\.json$/.test(file)) throw new Error(`Invalid changelog entry filename: ${file}`);
    return validateChange(JSON.parse(git(root, ['show', `${head}:${file}`])));
  });
}

module.exports = {git, readChanges};
