// The 2026-03-10 contract removes merge_commit_sha from REST PR responses.
// This publisher requires that field to verify the exact merged source commit.
const API_VERSION = '2022-11-28';

class GitHub {
  constructor({repository, token, fetchRequest = fetch}) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token) throw new Error('GitHub repository and token are required.');
    this.repository = repository;
    this.token = token;
    this.fetchRequest = fetchRequest;
  }

  async request(route, {method = 'GET', body, bytes, contentType = 'application/json', optional = false} = {}) {
    const url = route.startsWith('https://uploads.github.com/') ? route : `https://api.github.com/repos/${this.repository}/${route}`;
    const response = await this.fetchRequest(url, {
      method, headers: {Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': API_VERSION, 'User-Agent': 'k8s-training-release', ...(body || bytes ? {'Content-Type': contentType} : {})},
      ...(bytes ? {body: bytes} : body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(60000)
    });
    if (optional && response.status === 404) return null;
    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        if (typeof payload.message === 'string') detail = payload.message.replaceAll(this.token, '[redacted]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 400);
      } catch { /* Some GitHub errors have no JSON response body. */ }
      throw new Error(`GitHub ${method} request failed (${response.status}) for ${route.split('?')[0]}.${detail ? ` ${detail}` : ''}`);
    }
    return response.status === 204 ? null : response.json();
  }

  async list(route) {
    const items = [];
    for (let page = 1; ; page++) {
      const batch = await this.request(`${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      items.push(...batch);
      if (batch.length < 100) return items;
    }
  }
}

module.exports = {GitHub, API_VERSION};
