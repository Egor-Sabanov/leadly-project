import backup from '../backup.cjs';
import core from '../core.cjs';
export default { async fetch(request) {
  if (new URL(request.url).pathname === '/health') return new Response('ready');
  if (new URL(request.url).pathname !== '/probe') return new Response('Not found', { status: 404 });
  const calls = []; let cache;
  const fetcher = async (url, options) => {
    const stage = url.includes('/workflows/') ? 'runs' : url.includes('/artifacts?') ? 'artifacts' : 'jobs';
    let response;
    try { response = await fetch(url, options); }
    catch { calls.push({ stage, status: null, fetchFailed: true }); throw Error('probe_upstream_fetch_failed'); }
    const item = { stage, status: response.status };
    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    if (Number.isSafeInteger(remaining)) item.remaining = remaining;
    if (response.status === 200) {
      try {
        const body = await core.limitedJson(response.clone(), 256 * 1024);
        if (stage === 'runs') {
          item.arrayPresent = Array.isArray(body.workflow_runs);
          item.count = body.workflow_runs?.length;
          item.repositoriesMatch = body.workflow_runs?.every(run => run.repository?.full_name === 'Egor-Sabanov/leadly-project');
          item.pathsMatch = body.workflow_runs?.every(run => run.path === '.github/workflows/backup.yml');
          item.attemptsPresent = body.workflow_runs?.every(run => Number.isSafeInteger(run.run_attempt));
        }
        if (stage === 'artifacts') { item.count = body.artifacts?.length; item.totalCount = body.total_count; item.metadataPresent = body.artifacts?.every(artifact => Boolean(artifact.workflow_run?.head_sha)); }
        if (stage === 'jobs') { item.count = body.jobs?.length; item.totalCount = body.total_count; }
      } catch { item.jsonInvalid = true; }
    }
    calls.push(item); return response;
  };
  const result = await backup.probeBackup({ loadCache: async () => null, saveCache: async value => { cache = value; }, fetcher });
  return Response.json({ cloudflareBackupProbe: { status: result.status, error: cache?.error, calls } });
} };
