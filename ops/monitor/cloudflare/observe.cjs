const path = require('node:path');
const { spawn } = require('node:child_process');
const statuses = new Set(['ok', 'degraded', 'unavailable']);

function naturalEvidence(event, { since, now = Date.now() }) {
  if (!Array.isArray(event?.logs)) return null;
  for (const log of event.logs) {
    if (!Array.isArray(log.message)) continue;
    for (const message of log.message) {
      if (typeof message !== 'string' || message.length > 4096) continue;
      let report; try { report = JSON.parse(message); } catch { continue; }
      if (!report || !statuses.has(report.status) || !statuses.has(report.site) ||
          report.backup !== 'ok' || !['none', 'sent'].includes(report.notification) ||
          !['live', 'cached'].includes(report.backupVerification) ||
          !Number.isSafeInteger(report.snapshotAt) || report.snapshotAt > now + 60000 ||
          report.snapshotAt < now - 24 * 3600000 ||
          !Number.isSafeInteger(report.backupVerifiedAt) || report.backupVerifiedAt < since ||
          report.backupVerifiedAt > now + 60000 || report.backupVerifiedAt < now - 16 * 60000) continue;
      return { naturalExecutionVerified: true, backupReadVerified: true, siteStatus: report.site,
        backupStatus: 'ok', snapshotAt: report.snapshotAt, backupVerifiedAt: report.backupVerifiedAt,
        observedAt: now, notification: report.notification };
    }
  }
  return null;
}

// Wrangler JSON events may be pretty-printed and split across stdout chunks.
// Frame complete objects while respecting strings, then discard raw log text.
function jsonEvents(consume) {
  let text = '', depth = 0, quoted = false, escaped = false;
  return chunk => {
    for (const char of String(chunk)) {
      if (!depth) { if (char !== '{') continue; text = '{'; depth = 1; continue; }
      text += char;
      if (text.length > 1024 * 1024) throw Error('oversized_monitor_tail_event');
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        let event; try { event = JSON.parse(text); } catch { text = ''; continue; }
        text = ''; consume(event);
      }
    }
  };
}

async function observe({ accountId, since, env = process.env, timeoutMs = 7 * 60000,
  startTail, now = Date.now } = {}) {
  if (!/^[a-f0-9]{32}$/.test(accountId || '') || !Number.isSafeInteger(since) || since <= 0 ||
      !env.CLOUDFLARE_API_TOKEN || !env.LEADLY_WRANGLER_BIN) throw Error('monitor_observe_not_configured');
  const args = [env.LEADLY_WRANGLER_BIN, 'tail', 'leadly-owner-monitor', '--config',
    path.join(__dirname, 'wrangler.jsonc'), '--format', 'json', '--sampling-rate', '1'];
  const child = (startTail || ((args, options) => spawn(process.execPath, args, options)))(args, {
    env: { ...env, CLOUDFLARE_ACCOUNT_ID: accountId, WRANGLER_SEND_METRICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, evidence) => {
      if (settled) return;
      settled = true; clearTimeout(timer); child.kill('SIGTERM');
      if (error) reject(error); else resolve(evidence);
    };
    const timer = setTimeout(() => finish(Error('natural_monitor_observation_timeout')), timeoutMs);
    const consume = jsonEvents(event => {
      const evidence = naturalEvidence(event, { since, now: now() });
      if (evidence) finish(null, evidence);
    });
    child.stdout.on('data', data => { try { consume(data); } catch { finish(Error('invalid_monitor_tail_stream')); } });
    // Consume stderr without logging account details, CLI output or credentials.
    child.stderr.on('data', () => {});
    child.on('error', () => finish(Error('monitor_tail_failed')));
    child.on('close', () => finish(Error('monitor_tail_ended_before_verification')));
  });
}

module.exports = { observe, naturalEvidence, jsonEvents };
