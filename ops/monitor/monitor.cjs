const fs = require('node:fs');
const path = require('node:path');

const { runMonitor, probe, siteOrigin, validateState } = require("./core.cjs");

function readState(file) {
  if (!fs.existsSync(file)) return validateState(null);
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('unsafe_state');
  return validateState(JSON.parse(fs.readFileSync(file, 'utf8')));
}
function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.tmp-' + process.pid;
  fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
}
function monitor(options) {
  return runMonitor({ ...options, loadState: () => readState(options.file), saveState: state => saveState(options.file, state) });
}
module.exports = { monitor, probe, readState, siteOrigin };
if (require.main === module) {
  const file = process.env.LEADLY_MONITOR_STATE || path.join(process.cwd(), '.monitor-state', 'state.json');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  let lock;
  try { lock = fs.openSync(file + '.lock', 'wx', 0o600); }
  catch { console.error('Monitor state is already in use'); process.exitCode = 1; }
  if (lock !== undefined) monitor({ file, token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID, site: process.env.LEADLY_SITE_URL || 'https://leadly-topaz-seven.vercel.app', test: process.argv.includes('--test') })
    .then(result => { console.log(JSON.stringify(result)); if (result.status !== 'ok' || ['uncertain', 'rate_limited', 'verification_failed'].includes(result.notification)) process.exitCode = 1; })
    .catch(() => { console.error('Operations monitor could not complete; check configuration and protected state'); process.exitCode = 1; })
    .finally(() => { fs.closeSync(lock); fs.unlinkSync(file + '.lock'); });
}
