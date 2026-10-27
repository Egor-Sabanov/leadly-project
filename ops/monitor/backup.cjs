const { limitedJson } = require('./core.cjs');

const repository = 'Egor-Sabanov/leadly-project';
const api = 'https://api.github.com/repos/' + repository;
const refreshMs = 15 * 60000;
const maxAgeMs = 24 * 3600000;
const verificationGraceMs = 3600000;
const pendingLimitMs = 3600000;
const freshCache = () => ({ version: 1, checkedAt: 0, verifiedAt: 0, nextCheckAt: 0,
  latest: null, snapshot: null, problem: null, error: null });
const problems = new Set(['missing', 'failed', 'unverified', 'stalled']);
const runStatuses = new Set(['completed', 'queued', 'in_progress', 'waiting', 'pending', 'requested']);
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;
const safeTime = value => Number.isSafeInteger(value) && value >= 0;

function cacheState(value) {
  if (!value || value.version !== 1 || !['checkedAt', 'verifiedAt', 'nextCheckAt'].every(key => safeTime(value[key])) ||
      !(value.problem === null || problems.has(value.problem)) ||
      !(value.error === null || ['api_unavailable', 'rate_limited'].includes(value.error))) return freshCache();
  const latest = value.latest;
  if (latest && (!positiveId(latest.id) || !positiveId(latest.attempt) || !safeTime(latest.createdAt) ||
      !safeTime(latest.startedAt) || latest.startedAt < latest.createdAt || !runStatuses.has(latest.status) ||
      !(latest.conclusion === null || typeof latest.conclusion === 'string'))) return freshCache();
  const snapshot = value.snapshot;
  if (snapshot && (!positiveId(snapshot.runId) || !positiveId(snapshot.attempt) || !positiveId(snapshot.artifactId) ||
      !safeTime(snapshot.snapshotAt) || !safeTime(snapshot.artifactAt) || !safeTime(snapshot.expiresAt) ||
      snapshot.snapshotAt > snapshot.artifactAt || snapshot.artifactAt >= snapshot.expiresAt ||
      !positiveId(snapshot.size) || snapshot.size > 34 * 1024 * 1024 || !/^[a-f0-9]{40}$/.test(snapshot.sha || ''))) return freshCache();
  return { version: 1, checkedAt: value.checkedAt, verifiedAt: value.verifiedAt, nextCheckAt: value.nextCheckAt,
    latest: latest ? { id: latest.id, attempt: latest.attempt, createdAt: latest.createdAt,
      startedAt: latest.startedAt, status: latest.status, conclusion: latest.conclusion } : null,
    snapshot: snapshot ? { runId: snapshot.runId, attempt: snapshot.attempt, artifactId: snapshot.artifactId,
      snapshotAt: snapshot.snapshotAt, artifactAt: snapshot.artifactAt, expiresAt: snapshot.expiresAt,
      size: snapshot.size, sha: snapshot.sha } : null, problem: value.problem, error: value.error };
}

function evaluate(cache, now) {
  let status = 'ok';
  if (cache.error && (!cache.verifiedAt || now - cache.verifiedAt >= verificationGraceMs)) status = 'unavailable';
  else if (cache.latest?.status === 'completed' && cache.latest.conclusion !== 'success') status = 'failed';
  else if (cache.problem) status = cache.problem;
  else if (!cache.snapshot) status = cache.error ? 'unavailable' : 'missing';
  else if (cache.snapshot.expiresAt <= now || now - cache.snapshot.snapshotAt > maxAgeMs) status = 'stale';
  else if (cache.latest && cache.latest.status !== 'completed' && now - cache.latest.startedAt > pendingLimitMs) status = 'stalled';
  return { status, snapshotAt: cache.snapshot?.snapshotAt ?? null,
    artifactId: cache.snapshot?.artifactId ?? null, runId: cache.latest?.id ?? null,
    verifiedAt: cache.verifiedAt || null, verification: cache.error || cache.checkedAt !== now ? 'cached' : 'live',
    nextCheckAt: cache.nextCheckAt };
}

function readRun(run, now) {
  const createdAt = timestamp(run.created_at), startedAt = timestamp(run.run_started_at || run.created_at);
  if (!positiveId(run.id) || !positiveId(run.run_attempt) || run.head_branch !== 'main' ||
      run.repository?.full_name !== repository || run.path !== '.github/workflows/backup.yml' ||
      !['schedule', 'workflow_dispatch'].includes(run.event) || !/^[a-f0-9]{40}$/.test(run.head_sha || '') ||
      !Number.isFinite(createdAt) || !Number.isFinite(startedAt) || startedAt < createdAt ||
      createdAt > now + 60000 || startedAt > now + 60000 ||
      !runStatuses.has(run.status) ||
      !(run.conclusion === null || typeof run.conclusion === 'string')) throw new Error('invalid_backup_run');
  return { id: run.id, attempt: run.run_attempt, createdAt, startedAt, status: run.status,
    conclusion: run.conclusion, sha: run.head_sha };
}

async function request(path, fetcher, now, token) {
  if (!/^\/actions\/(?:workflows\/backup\.yml\/runs\?branch=main&per_page=5|runs\/[1-9]\d*\/(?:artifacts\?per_page=100|jobs\?filter=latest&per_page=5))$/.test(path)) throw new Error('invalid_backup_api_path');
  if (token && (typeof token !== 'string' || !/^[A-Za-z0-9_]{8,512}$/.test(token))) throw new Error('invalid_backup_read_token');
  const response = await fetcher(api + path, { redirect: 'manual', signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'LEADLY-Backup-Monitor/1.0', Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
  if (response.status !== 200) {
    const error = new Error('backup_api_unavailable');
    const retry = Number(response.headers.get('retry-after'));
    const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
    if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) {
      error.rateLimited = true;
      error.retryAt = Math.max(now + refreshMs,
        Number.isSafeInteger(retry) && retry > 0 && retry < 86400 ? now + retry * 1000 : 0,
        Number.isSafeInteger(reset) && reset > now && reset < now + 86400000 ? reset : 0);
    }
    throw error;
  }
  return limitedJson(response, 256 * 1024);
}

async function snapshotFor(run, fetcher, now, token) {
  const data = await request('/actions/runs/' + run.id + '/artifacts?per_page=100', fetcher, now, token);
  if (!Array.isArray(data.artifacts) || data.artifacts.length > 100 || data.total_count !== data.artifacts.length) throw new Error('invalid_backup_artifacts');
  const candidates = data.artifacts.filter(item => item.name === 'leadly-encrypted-backup-' + run.id && !item.expired);
  if (candidates.length !== 1) return { problem: 'missing' };
  const artifact = candidates[0], artifactAt = timestamp(artifact.created_at), expiresAt = timestamp(artifact.expires_at);
  if (!positiveId(artifact.id) || !positiveId(artifact.size_in_bytes) || artifact.size_in_bytes > 34 * 1024 * 1024 ||
      artifact.workflow_run?.id !== run.id || artifact.workflow_run?.head_branch !== 'main' ||
      artifact.workflow_run?.head_sha !== run.sha || !Number.isFinite(artifactAt) || !Number.isFinite(expiresAt) ||
      artifactAt < run.startedAt || artifactAt > now + 60000 || expiresAt <= now) return { problem: 'unverified' };
  const jobs = await request('/actions/runs/' + run.id + '/jobs?filter=latest&per_page=5', fetcher, now, token);
  if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length || jobs.jobs.length !== 1) return { problem: 'unverified' };
  const job = jobs.jobs[0];
  if (job.name !== 'backup' || job.run_id !== run.id || job.conclusion !== 'success' || !Array.isArray(job.steps)) return { problem: 'unverified' };
  const copy = job.steps.filter(step => step.name === 'Snapshot, restore and encrypt');
  const upload = job.steps.filter(step => step.name === 'Keep only the encrypted verified archive');
  if (copy.length !== 1 || upload.length !== 1 || copy[0].conclusion !== 'success' || upload[0].conclusion !== 'success') return { problem: 'unverified' };
  const snapshotAt = timestamp(copy[0].started_at), finishedAt = timestamp(copy[0].completed_at);
  if (!Number.isFinite(snapshotAt) || !Number.isFinite(finishedAt) || snapshotAt < run.startedAt ||
      finishedAt < snapshotAt || artifactAt < finishedAt) return { problem: 'unverified' };
  return { snapshot: { runId: run.id, attempt: run.attempt, artifactId: artifact.id, snapshotAt,
    artifactAt, expiresAt, size: artifact.size_in_bytes, sha: run.sha } };
}

async function probeBackup({ loadCache, saveCache, fetcher = fetch, now = Date.now(), token }) {
  let cache = cacheState(await loadCache());
  if (cache.checkedAt > now + 60000 || cache.verifiedAt > now + 60000 ||
      (cache.snapshot && cache.snapshot.artifactAt > now + 60000) ||
      (cache.latest && cache.latest.startedAt > now + 60000)) cache = freshCache();
  const cached = evaluate(cache, now);
  const crossedDeadline = !cache.error && ['stale', 'stalled'].includes(cached.status) &&
    evaluate(cache, cache.checkedAt).status === 'ok';
  // Recheck at a deadline before warning from cached evidence. A new archive
  // may have arrived since the previous poll. Provider backoff still wins.
  if (cache.nextCheckAt > now && !crossedDeadline) return cached;
  const next = { ...cache, checkedAt: now, nextCheckAt: now + refreshMs, error: null };
  try {
    const data = await request('/actions/workflows/backup.yml/runs?branch=main&per_page=5', fetcher, now, token);
    if (!Array.isArray(data.workflow_runs) || data.workflow_runs.length > 5) throw new Error('invalid_backup_runs');
    const runs = data.workflow_runs.filter(run => ['schedule', 'workflow_dispatch'].includes(run.event))
      .map(run => readRun(run, now)).sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
    next.latest = runs[0] || null;
    next.problem = !runs.length ? 'missing' : runs[0].status === 'completed' && runs[0].conclusion !== 'success' ? 'failed' : null;
    // Revalidate the artifact every poll: deletion must not stay green in cache.
    next.snapshot = null;
    for (const run of runs) {
      if (run.status !== 'completed' || run.conclusion !== 'success') continue;
      const found = await snapshotFor(run, fetcher, now, token);
      if (run.id === next.latest.id && found.problem) next.problem = found.problem;
      if (found.snapshot) { next.snapshot = found.snapshot; break; }
    }
    next.verifiedAt = now;
  } catch (error) {
    next.error = error.rateLimited ? 'rate_limited' : 'api_unavailable';
    next.nextCheckAt = Math.max(next.nextCheckAt, error.retryAt || 0);
    // Never replace known evidence with a partially parsed response.
    next.latest = cache.latest; next.snapshot = cache.snapshot; next.problem = cache.problem;
  }
  cache = cacheState(next);
  await saveCache(cache);
  return evaluate(cache, now);
}

function monitorCheck(siteStatus, backup, now) {
  const status = siteStatus === 'unavailable' ? 'unavailable' : siteStatus !== 'ok' || backup.status !== 'ok' ? 'degraded' : 'ok';
  const descriptions = {
    missing: 'Не найден проверенный зашифрованный архив последнего запуска.',
    failed: 'Последний запуск резервного копирования завершился с ошибкой или был пропущен.',
    unverified: 'Архив последнего запуска не прошёл проверку метаданных или шагов копирования.',
    stalled: 'Резервное копирование ожидает выполнения или работает дольше часа.',
    stale: 'Последняя проверенная резервная копия старше 24 часов или срок её хранения истёк.',
    unavailable: 'Не удаётся проверить свежесть резервных копий через GitHub.',
  };
  let text = status === 'ok' ? '✅ LEADLY: сайт, вход, обновление ленты и резервная копия снова в порядке.' :
    (siteStatus === 'unavailable' ? '🚨 LEADLY требует проверки.' : '⚠️ LEADLY требует проверки.');
  if (status !== 'ok') {
    text += '\n' + (siteStatus === 'ok' ? 'Сайт, вход и обновление ленты отвечают штатно.' :
      siteStatus === 'degraded' ? 'Обновление ленты или доставка требуют проверки.' : 'Не подтверждена доступность сайта, входа или базы.');
    text += '\n' + (backup.status === 'ok' ? 'Проверенная резервная копия актуальна.' : descriptions[backup.status]);
    if (backup.snapshotAt != null) {
      const minutes = Math.max(0, Math.floor((now - backup.snapshotAt) / 60000));
      text += '\nВозраст последней проверенной копии: ' + Math.floor(minutes / 60) + ' ч ' + minutes % 60 + ' мин.';
    }
    if (backup.status !== 'ok' && positiveId(backup.runId))
      text += '\nПоследний известный запуск: https://github.com/' + repository + '/actions/runs/' + backup.runId;
  }
  return { status, key: 'site:' + siteStatus + '|backup:' + backup.status, text,
    ...(backup.status === 'ok' ? { legacyStatus: siteStatus } : {}) };
}

module.exports = { probeBackup, monitorCheck, cacheState, evaluate, maxAgeMs, refreshMs, verificationGraceMs };
