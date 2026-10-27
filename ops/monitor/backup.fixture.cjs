// Synthetic public metadata for the unit and native Workers fixtures.
function backupFixture(now = Date.now(), { id = 1001, age = 3600000 } = {}) {
  const snapshotAt = now - age;
  const startedAt = snapshotAt - 30000;
  const iso = time => new Date(time).toISOString();
  const sha = 'a'.repeat(40);
  const run = { id, run_attempt: 1, event: 'schedule', status: 'completed', conclusion: 'success',
    head_branch: 'main', head_sha: sha, path: '.github/workflows/backup.yml',
    repository: { full_name: 'Egor-Sabanov/leadly-project' },
    created_at: iso(startedAt), run_started_at: iso(startedAt), updated_at: iso(snapshotAt + 20000) };
  const artifact = { id: id + 10000, name: 'leadly-encrypted-backup-' + id, expired: false,
    created_at: iso(snapshotAt + 15000), expires_at: iso(now + 14 * 86400000), size_in_bytes: 1024,
    workflow_run: { id, head_branch: 'main', head_sha: sha } };
  const job = { run_id: id, name: 'backup', conclusion: 'success', steps: [
    { name: 'Snapshot, restore and encrypt', conclusion: 'success', started_at: iso(snapshotAt), completed_at: iso(snapshotAt + 10000) },
    { name: 'Keep only the encrypted verified archive', conclusion: 'success', started_at: iso(snapshotAt + 10000), completed_at: iso(snapshotAt + 16000) },
  ] };
  const cache = { version: 1, checkedAt: now, verifiedAt: now, nextCheckAt: now + 15 * 60000,
    latest: { id, attempt: 1, createdAt: startedAt, startedAt, status: 'completed', conclusion: 'success' },
    snapshot: { runId: id, attempt: 1, artifactId: artifact.id, snapshotAt,
      artifactAt: snapshotAt + 15000, expiresAt: now + 14 * 86400000, size: 1024, sha },
    problem: null, error: null };
  return { now, run, artifact, job, cache };
}
function fixturePayload(url, fixtures) {
  const path = new URL(url).pathname;
  if (path.endsWith('/workflows/backup.yml/runs')) return { total_count: fixtures.length, workflow_runs: fixtures.map(f => f.run) };
  const match = /\/runs\/(\d+)\/(artifacts|jobs)$/.exec(path);
  const fixture = match && fixtures.find(f => f.run.id === Number(match[1]));
  if (!fixture) throw new Error('unexpected_fixture_destination');
  return match[2] === 'artifacts' ? { total_count: fixture.artifact ? 1 : 0, artifacts: fixture.artifact ? [fixture.artifact] : [] }
    : { total_count: fixture.job ? 1 : 0, jobs: fixture.job ? [fixture.job] : [] };
}
module.exports = { backupFixture, fixturePayload };
