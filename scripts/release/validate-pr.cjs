const fs = require('node:fs');
const path = require('node:path');
const {releaseLabel} = require('./core.cjs');
const {readChanges} = require('./git.cjs');

try {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  if (!pr || pr.base.ref !== 'main') throw new Error('Expected a pull request to main.');
  const bump = releaseLabel(pr.labels);
  const changes = readChanges(path.resolve(__dirname, '../..'), pr.base.sha, pr.head.sha);
  console.log(`PASS: ${bump} release label and ${changes.length} changelog entry/entries.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
