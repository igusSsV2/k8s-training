(() => {
  const byId = id => document.getElementById(id);
  const labels = {pending: 'Starting', running: 'Running', succeeded: 'Succeeded', failed: 'Failed', 'needs-action': 'Action needed'};
  let token;
  let connected = false;
  let operation = null;
  let confirmation = null;
  let submitted = false;

  function render() {
    const busy = submitted || ['pending', 'running'].includes(operation?.status);
    document.querySelectorAll('[data-lab-action]').forEach(button => { button.disabled = !connected || busy; });
    byId('confirm-delete').disabled = !connected || busy;
    byId('lab-scenario').disabled = busy;
    byId('lab-state').disabled = busy;
    byId('operation-title').textContent = operation?.title || 'Your activity will appear here';
    byId('operation-status').textContent = operation ? labels[operation.status] : 'Idle';
    byId('operation-status').dataset.status = operation?.status || 'idle';
    byId('operation-step').textContent = operation?.step || 'Choose an action to get started.';
    byId('operation-message').textContent = operation?.message || 'Run a prerequisite check before setting up your first cluster.';
    byId('operation-meta').textContent = operation
      ? `${operation.scenario === 'All' ? 'All scenarios' : `Scenario ${operation.scenario}`}${operation.state ? ` · ${operation.state}` : ''} · Started ${new Date(operation.startedAt).toLocaleTimeString()}${operation.finishedAt ? ` · Exit ${operation.exitCode ?? 'unavailable'}` : ''}`
      : 'Dedicated cluster: k8s-troubleshooting';
    byId('operation-progress').hidden = !['pending', 'running'].includes(operation?.status);
    const log = byId('operation-log');
    const follow = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.textContent = operation?.logs.map(line => `${new Date(line.at).toLocaleTimeString()}  ${line.stream.toUpperCase()}  ${line.message}`).join('\n') || 'No activity yet.';
    if (follow) log.scrollTop = log.scrollHeight;
  }

  function connection(ready, message) {
    connected = ready;
    byId('service-status').textContent = message;
    byId('service-status').dataset.connected = String(ready);
    render();
  }

  async function start(selection) {
    submitted = true;
    byId('control-error').textContent = '';
    render();
    try {
      const response = await fetch('/api/operations', {
        method: 'POST', headers: {'Content-Type': 'application/json', 'X-Lab-Token': token}, body: JSON.stringify(selection)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The action could not be started.');
      // The stream can already have a newer state than the pending POST response.
      if (!operation || operation.id !== result.id) operation = result;
    } catch (error) { byId('control-error').textContent = error.message; }
    finally { submitted = false; render(); }
  }

  document.querySelectorAll('[data-lab-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.labAction;
      const selection = {action};
      if (['setup', 'deploy', 'check', 'delete'].includes(action)) selection.scenario = byId('lab-scenario').value;
      if (action === 'check') selection.state = byId('lab-state').value;
      if (['delete', 'delete-cluster'].includes(action)) {
        selection.confirmation = `${action}:${selection.scenario || 'All'}`;
        confirmation = selection;
        byId('deletion-scope').textContent = action === 'delete-cluster'
          ? 'Delete the entire k8s-troubleshooting cluster, including all resources you added to it. Your lab work will be discarded.'
          : `Delete ${selection.scenario === 'All' ? 'all three scenario namespaces' : `namespace trouble-${selection.scenario}`} and their lab resources. Other scenarios and the cluster will remain.`;
        byId('delete-dialog').showModal();
      } else start(selection);
    });
  });
  byId('cancel-delete').addEventListener('click', () => byId('delete-dialog').close());
  byId('confirm-delete').addEventListener('click', () => { byId('delete-dialog').close(); if (confirmation) start(confirmation); confirmation = null; });
  byId('lab-controls-nav').addEventListener('click', () => byId('lab-controls').scrollIntoView({behavior: 'smooth'}));
  byId('retry-service').addEventListener('click', () => location.reload());
  render();

  async function connect() {
    if (location.protocol === 'file:') {
      byId('service-help').hidden = false;
      connection(false, 'Static lessons only');
      return;
    }
    try {
      const response = await fetch('/api/session');
      if (!response.ok) throw new Error('The local service is unavailable.');
      const session = await response.json();
      token = session.token;
      operation = session.operation;
      if (operation) {
        byId('lab-scenario').value = operation.scenario;
        if (operation.state) byId('lab-state').value = operation.state;
      }
      const events = new EventSource('/api/events');
      events.addEventListener('operation', event => {
        operation = JSON.parse(event.data);
        byId('service-help').hidden = true;
        connection(true, 'Local service connected');
      });
      events.onerror = () => { byId('service-help').hidden = false; connection(false, 'Reconnecting to local service…'); };
      // If a service restart issued a new token, refresh it before allowing a POST.
      events.onopen = async () => {
        try {
          const fresh = await fetch('/api/session');
          if (!fresh.ok) throw new Error();
          token = (await fresh.json()).token;
        } catch { connection(false, 'Waiting for local service'); }
      };
    } catch {
      byId('service-help').hidden = false;
      connection(false, 'Local service unavailable');
    }
  }
  connect();
})();
