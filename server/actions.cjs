const path = require('node:path');

const actions = [
  {id: 'prerequisites', title: 'Check prerequisites', script: 'Check-Prerequisites.ps1', initial: 'Checking your environment', args: ['-CheckNetwork']},
  {id: 'install', title: 'Install prerequisites', script: 'Setup-Lab.ps1', initial: 'Preparing prerequisites', args: ['-PrerequisitesOnly']},
  {id: 'setup', title: 'Set up cluster & labs', script: 'Setup-Lab.ps1', initial: 'Preparing the lab environment', scenario: true},
  {id: 'deploy', title: 'Start / reset scenarios', script: 'Deploy-Lab.ps1', initial: 'Preparing scenarios', scenario: true},
  {id: 'check', title: 'Check scenarios', script: 'Check-Lab.ps1', initial: 'Checking scenarios', scenario: true, state: true},
  {id: 'delete', title: 'Delete scenarios', script: 'Delete-Lab.ps1', initial: 'Removing selected namespaces', scenario: true, destructive: true},
  {id: 'delete-cluster', title: 'Delete entire cluster', script: 'Delete-Lab.ps1', initial: 'Removing the dedicated cluster', args: ['-DeleteCluster'], destructive: true}
];

function validateAction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected an action object.');
  if (Object.keys(input).some(key => !['action', 'scenario', 'state', 'confirmation'].includes(key))) throw new Error('Unknown action parameter.');
  const action = actions.find(item => item.id === input.action);
  if (!action) throw new Error('Unknown lab action.');
  const scenario = input.scenario ?? 'All';
  const state = input.state ?? 'Healthy';
  if (!['All', '1', '2', '3'].includes(scenario)) throw new Error('Select All or scenario 1, 2, or 3.');
  if (!['Healthy', 'Broken'].includes(state)) throw new Error('Select Healthy or Broken.');
  if (!action.scenario && scenario !== 'All') throw new Error('This action applies to the entire environment.');
  if (!action.state && input.state !== undefined) throw new Error('State is only valid when checking scenarios.');
  if (action.destructive && input.confirmation !== `${action.id}:${scenario}`) throw new Error('Confirm the exact deletion scope first.');
  return {action: action.id, scenario, ...(action.state ? {state} : {})};
}

function commandFor(root, input) {
  const action = actions.find(item => item.id === input.action);
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(root, 'training/troubleshooting', action.script), ...(action.args || [])];
  if (action.scenario) args.push('-Scenario', input.scenario);
  if (action.state) args.push('-State', input.state);
  return {file: 'powershell.exe', args};
}

module.exports = {actions, validateAction, commandFor};
