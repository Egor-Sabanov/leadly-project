const statuses = new Set(['ok', 'degraded', 'unavailable']);
const emptyState = () => ({ version: 1, lastStatus: null, noticeStatus: null, lastAttemptAt: 0, retryAfter: 0, pending: false });

function siteOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !url.hostname.endsWith('.vercel.app')) throw new Error('invalid_site');
  return url.origin;
}
async function limitedJson(response) {
  if (Number(response.headers.get('content-length')) > 16000) throw new Error('oversized_response');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty_response');
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 16000) { await reader.cancel(); throw new Error('oversized_response'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}
function validateState(value) {
  if (value == null) return emptyState();
  if (value.version !== 1 || ![null, ...statuses].includes(value.lastStatus) || ![null, ...statuses].includes(value.noticeStatus) || !Number.isSafeInteger(value.lastAttemptAt) || value.lastAttemptAt < 0 || !Number.isSafeInteger(value.retryAfter) || value.retryAfter < 0 || typeof value.pending !== "boolean") throw new Error("invalid_state");
  return { ...value };
}
// Manual redirects work in Node and Workers; status checks below reject 3xx.
async function probe(site, fetcher = fetch, now = Date.now()) {
  try {
    const response = await fetcher(site + '/api/status', { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'LEADLY-Operations-Monitor/1.0' } });
    const data = await limitedJson(response);
    const timestamp = Date.parse(data.checkedAt);
    if (!statuses.has(data.status) || !Number.isFinite(timestamp) || timestamp > now + 60000 || timestamp < now - 120000 || (data.status === 'ok' ? response.status !== 200 : response.status !== 503)) return 'unavailable';
    return data.status;
  } catch { return 'unavailable'; }
}
async function runMonitor(options) {
  const { loadState, saveState: persistState, token, chatId, fetcher = fetch, now = Date.now(), delay = ms => new Promise(resolve => setTimeout(resolve, ms)), test = false } = options;
  const site = siteOrigin(options.site);
  if (!/^\d+:[A-Za-z0-9_-]{20,100}$/.test(token || '') || !/^[1-9]\d{0,15}$/.test(chatId || '')) throw new Error('monitor_not_configured');
  const state = validateState(await loadState());
  // A killed or ambiguous send must not be blindly repeated after a runner restart.
  if (state.pending) { state.pending = false; state.retryAfter = Math.max(state.retryAfter, state.lastAttemptAt + 6 * 3600000); await persistState({ ...state }); }
  let status = await probe(site, fetcher, now);
  if (status !== 'ok') { await delay(10000); status = await probe(site, fetcher, now + 10000); }
  const previousNotice = state.noticeStatus;
  const recovery = status === 'ok' && state.noticeStatus && state.noticeStatus !== 'ok';
  const needed = test || recovery || (status !== 'ok' && (state.noticeStatus !== status || now - state.lastAttemptAt >= 6 * 3600000));
  state.lastStatus = status;
  if (!needed || now < state.retryAfter) { await persistState({ ...state }); return { status, notification: 'none' }; }
  try {
    const verified = await fetcher('https://api.telegram.org/bot' + token + '/getMe', { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const bot = await limitedJson(verified);
    if (!verified.ok || bot.ok !== true || bot.result?.is_bot !== true || !Number.isSafeInteger(bot.result?.id) || bot.result.id <= 0 || typeof bot.result?.username !== 'string' || bot.result.username.toLowerCase() !== 'leadly_work_bot') throw new Error('wrong_bot');
  } catch { await persistState({ ...state }); return { status, notification: 'verification_failed' }; }
  const text = test ? '🔔 LEADLY: служебные уведомления подключены. Сбои и восстановление будут приходить в этот чат.' : status === 'ok' ? '✅ LEADLY снова работает. Сайт, вход и обновление ленты отвечают штатно.' : status === 'degraded' ? '⚠️ LEADLY: обновление ленты или доставка требуют проверки. Посмотри журнал запусков; отдельные источники могут быть недоступны.' : '🚨 LEADLY не отвечает штатно. Не удалось подтвердить доступность сайта, входа или базы. Нужна проверка.';
  state.pending = true; state.lastAttemptAt = now; state.noticeStatus = status; state.retryAfter = 0; await persistState({ ...state });
  try {
    const response = await fetcher('https://api.telegram.org/bot' + token + '/sendMessage', { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }) });
    const body = await limitedJson(response);
    state.pending = false;
    if (response.ok && body.ok === true && Number.isSafeInteger(body.result?.message_id) && body.result.message_id > 0 && String(body.result?.chat?.id) === chatId) {
      await persistState({ ...state }); return { status, notification: 'sent' };
    }
    if (body.ok === false && body.error_code === 429) {
      const seconds = Number.isSafeInteger(body.parameters?.retry_after) && body.parameters.retry_after > 0 ? body.parameters.retry_after : 60;
      state.noticeStatus = previousNotice; state.retryAfter = Math.min(Number.MAX_SAFE_INTEGER, now + seconds * 1000);
      await persistState({ ...state }); return { status, notification: 'rate_limited' };
    }
    state.retryAfter = now + 6 * 3600000; await persistState({ ...state }); return { status, notification: 'uncertain' };
  } catch {
    state.pending = false; state.retryAfter = now + 6 * 3600000; await persistState({ ...state }); return { status, notification: 'uncertain' };
  }
}
module.exports = { runMonitor, probe, siteOrigin, validateState };
