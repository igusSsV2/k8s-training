const types = {added: 'Added', changed: 'Changed', fixed: 'Fixed', removed: 'Removed', deprecated: 'Deprecated', security: 'Security'};

function parseVersion(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error(`Invalid stable version: ${value}`);
  const parts = value.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Version component is too large.');
  return parts;
}

function releaseLabel(labels) {
  const selected = labels.map(label => typeof label === 'string' ? label : label.name).filter(name => ['major', 'minor', 'patch'].includes(name));
  if (selected.length !== 1) throw new Error('Apply exactly one release label: major, minor, or patch.');
  return selected[0];
}

function bumpVersion(previous, label) {
  const parts = parseVersion(previous);
  const index = ['major', 'minor', 'patch'].indexOf(label);
  if (index < 0) throw new Error('Unknown release bump.');
  parts[index]++;
  for (let position = index + 1; position < 3; position++) parts[position] = 0;
  if (!parts.every(Number.isSafeInteger)) throw new Error('Version component overflow.');
  return parts.join('.');
}

function validateChange(change) {
  if (!change || Array.isArray(change) || typeof change !== 'object' || Object.keys(change).some(key => !['type', 'description', 'issues', 'breaking'].includes(key))) throw new Error('Invalid changelog entry.');
  if (!Object.hasOwn(types, change.type) || typeof change.description !== 'string' || !change.description.trim() || change.description.length > 5000) throw new Error('A changelog entry needs a supported type and a description.');
  if (typeof change.breaking !== 'boolean' || !Array.isArray(change.issues) || change.issues.some(issue => !Number.isSafeInteger(issue) || issue < 1)) throw new Error('A changelog entry needs breaking (boolean) and issues (positive numbers).');
  return change;
}

function metadataFrom(body) {
  const match = body?.match(/<!-- kube-release (\{[^\n]*\}) -->/);
  if (!match) return null;
  const metadata = JSON.parse(match[1]);
  parseVersion(metadata.version); parseVersion(metadata.previousVersion);
  if (metadata.schema !== 1 || !Number.isSafeInteger(metadata.pr) || metadata.pr < 1 || !/^[a-f0-9]{40}$/.test(metadata.sha) || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.date)) throw new Error('Invalid release identity metadata.');
  if (bumpVersion(metadata.previousVersion, metadata.bump) !== metadata.version) throw new Error('Release metadata has an inconsistent bump.');
  return metadata;
}

function releaseNotes(metadata, changes, repository) {
  parseVersion(metadata.version);
  changes.forEach(validateChange);
  const lines = [`## [v${metadata.version}] - ${metadata.date}`, '', `Pull request: [#${metadata.pr}](https://github.com/${repository}/pull/${metadata.pr})`, ''];
  if (changes.some(change => change.breaking)) {
    lines.push('### Breaking changes', '', ...changes.filter(change => change.breaking).map(change => `- ${change.description}`), '');
  }
  for (const [type, heading] of Object.entries(types)) {
    const entries = changes.filter(change => change.type === type);
    if (!entries.length) continue;
    lines.push(`### ${heading}`, '', ...entries.map(change => `- ${change.description}${change.issues.length ? ` (${change.issues.map(issue => `[#${issue}](https://github.com/${repository}/issues/${issue})`).join(', ')})` : ''}`), '');
  }
  lines.push(`<!-- kube-release ${JSON.stringify(metadata)} -->`);
  return lines.join('\n') + '\n';
}

function changelogFor(notes) {
  return '# Changelog\n\nThis versioned history is generated from reviewed change entries and release metadata.\n\n## Unreleased\n\nFuture changes are tracked in the source repository\'s changes/ directory.\n\n' + notes.map(note => note.replace(/\n<!-- kube-release [^\n]* -->\n?/g, '\n').trim()).join('\n\n') + '\n';
}

function planReleases(candidates, existing, initialVersion = '0.0.0') {
  let previousVersion = initialVersion;
  const plans = [];
  for (const candidate of candidates) {
    const matches = existing.filter(release => {
      const metadata = metadataFrom(release.body);
      return metadata && metadata.pr === candidate.pr;
    });
    if (matches.length > 1) throw new Error(`Multiple releases claim PR #${candidate.pr}.`);
    const release = matches[0];
    const frozen = release && metadataFrom(release.body);
    if (frozen && (frozen.sha !== candidate.sha || frozen.previousVersion !== previousVersion || release.tag_name !== `v${frozen.version}`)) throw new Error(`Release history disagrees with PR #${candidate.pr}.`);
    const bump = frozen?.bump || releaseLabel(candidate.labels);
    const metadata = frozen || {schema: 1, pr: candidate.pr, sha: candidate.sha, previousVersion, version: bumpVersion(previousVersion, bump), bump, date: candidate.date};
    const foreign = existing.find(item => item.tag_name === `v${metadata.version}` && item !== release);
    if (foreign) throw new Error(`Version v${metadata.version} already belongs to another release.`);
    plans.push({...candidate, metadata, release, published: !!release && !release.draft});
    previousVersion = metadata.version;
  }
  return plans;
}

module.exports = {parseVersion, releaseLabel, bumpVersion, validateChange, metadataFrom, releaseNotes, changelogFor, planReleases};
