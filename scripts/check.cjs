const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

let count = 0;
function check(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (/\.(?:cjs|js)$/.test(file)) {
      execFileSync(process.execPath, ['--check', file], {stdio: 'inherit'});
      count++;
    }
  }
}
for (const directory of ['server', 'scripts', 'tests', 'dist']) check(directory);
console.log(`PASS: syntax checked ${count} JavaScript files.`);
