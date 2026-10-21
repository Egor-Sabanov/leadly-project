const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { exportStorage } = require('./storage.cjs');
const project = 'leezcyaqhozguvcehcpd';

function toolFailure(command, stderr = '') {
  const name = path.basename(command);
  if (['pg_dump', 'psql'].includes(name)) {
    if (/password authentication failed|no password supplied|SASL authentication failed|Tenant or user not found/i.test(stderr)) return 'backup_database_authentication_failed';
    if (/certificate verify failed|root certificate file|certificate verification failed/i.test(stderr)) return 'backup_database_certificate_failed';
    if (/server version mismatch/i.test(stderr)) return 'backup_database_client_version_mismatch';
    if (/permission denied for|must be owner of/i.test(stderr)) return 'backup_database_permission_denied';
    if (/could not translate host name|Name or service not known|Network is unreachable|Connection timed out|timeout expired|connection refused/i.test(stderr)) return 'backup_database_connection_failed';
  }
  // Never return a command, URI, username, SQL statement or tool stderr.
  return 'backup_tool_failed_' + name;
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 600000, maxBuffer: 256 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(toolFailure(command, result.stderr));
  return result.stdout;
}
function tool(name) { return process.env.LEADLY_PG_BIN ? path.join(process.env.LEADLY_PG_BIN, name) : name; }
function connection(value, mode) {
  let url;
  try { url = new URL(value || 'invalid'); } catch { throw new Error('invalid_database_connection'); }
  const decode = value => { try { return decodeURIComponent(value); } catch { throw new Error('invalid_database_url_encoding'); } };
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash || [...url.searchParams.keys()].some(k => k !== 'sslmode')) throw new Error('invalid_database_connection');
  const database = decode(url.pathname.slice(1));
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (mode === 'restore' && (!local || !/^leadly_restore_[a-z0-9_]+$/.test(database))) throw new Error('restore_target_must_be_isolated_local_database');
  if (mode === 'fixture' && (!local || !/^leadly_fixture_[a-z0-9_]+$/.test(database))) throw new Error('invalid_fixture_database');
  if (mode === 'backup' && !(url.hostname === 'db.' + project + '.supabase.co' || (url.hostname.endsWith('.pooler.supabase.com') && decode(url.username) === 'postgres.' + project))) throw new Error('unexpected_source_project');
  const env = { ...process.env, PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432', PGUSER: decode(url.username), PGPASSWORD: decode(url.password), PGDATABASE: database, PGCONNECT_TIMEOUT: '15', PGSSLMODE: local ? 'disable' : 'verify-full', PGAPPNAME: 'leadly-backup' };
  // Empty service-file selectors are errors in libpq, not disabled selectors.
  delete env.PGSERVICE; delete env.PGSERVICEFILE; delete env.PGOPTIONS; delete env.PGHOSTADDR;
  if (local) delete env.PGSSLROOTCERT; else env.PGSSLROOTCERT = path.join(__dirname, 'supabase-ca-2021.crt');
  return env;
}
const identifier = s => '"' + s.replace(/"/g, '""') + '"';
function sql(env, statement) { return run(tool('psql'), ['--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement], { env }).trim(); }
function copyCounts(text) {
  const counts = {}; let current = null;
  for (const line of text.split('\n')) {
    const match = /^COPY (public|auth|storage)\.([a-z_][a-z0-9_]*) \(.+\) FROM stdin;$/.exec(line);
    if (match) { current = match[1] + '.' + match[2]; counts[current] = 0; }
    else if (line === '\\.') current = null;
    else if (current) counts[current]++;
  }
  if (!Object.keys(counts).length) throw new Error('archive_has_no_expected_tables');
  return counts;
}
function gpgHome(root) { const home = path.join(root, 'gpg'); fs.mkdirSync(home, { mode: 0o700 }); return home; }
function keyFingerprint(home, keyFile) {
  run('gpg', ['--batch', '--homedir', home, '--import', keyFile]);
  const keys = run('gpg', ['--batch', '--homedir', home, '--with-colons', '--list-keys']);
  if (keys.split('\n').filter(s => s.startsWith('pub:')).length !== 1) throw new Error('exactly_one_backup_key_required');
  return keys.split('\n').find(s => s.startsWith('fpr:')).split(':')[9];
}
function digest(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

async function backup(options) {
  const env = connection(options.databaseUrl, options.fixture ? 'fixture' : 'backup');
  if (!options.publicKey || !options.output || fs.existsSync(options.output)) throw new Error('backup_output_or_key_invalid');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'leadly-backup-')); fs.chmodSync(work, 0o700);
  let stage = 'dump';
  try {
    const payload = path.join(work, 'payload'); fs.mkdirSync(payload, { mode: 0o700 });
    const dump = path.join(payload, 'database.dump');
    run(tool('pg_dump'), ['--format=custom', '--no-owner', '--schema=public', '--schema=auth', '--schema=storage', '--file', dump], { env: { ...env, PGOPTIONS: '-c default_transaction_read_only=on' } });
    stage = 'manifest';
    const tables = copyCounts(run(tool('pg_restore'), ['--data-only', '--file=-', dump]));
    const roles = JSON.parse(sql(env, "select coalesce(json_agg(json_build_object('name',rolname,'bypassRls',rolbypassrls)),'[]'::json) from pg_roles where rolname not like 'pg_%'"));
    stage = 'storage';
    const storage = await options.storage(payload);
    const manifest = { version: 1, createdAt: new Date().toISOString(), project, scopes: ['public', 'auth', 'storage'], crossServiceSnapshot: false, tables, roles, storage, databaseSha256: digest(dump) };
    fs.writeFileSync(path.join(payload, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
    stage = 'verification';
    const verified = options.verifyDatabaseUrl ? verifyPayload(payload, connection(options.verifyDatabaseUrl, 'restore')) : null;
    stage = 'encryption';
    const archive = path.join(work, 'payload.tar'); run('tar', ['-cf', archive, '-C', payload, '.']);
    const home = gpgHome(work), fingerprint = keyFingerprint(home, options.publicKey);
    fs.mkdirSync(path.dirname(options.output), { recursive: true, mode: 0o700 });
    run('gpg', ['--batch', '--homedir', home, '--trust-model', 'always', '--recipient', fingerprint, '--output', options.output, '--encrypt', archive]); fs.chmodSync(options.output, 0o600);
    return { encrypted: true, tableCount: Object.keys(tables).length, storageFiles: storage.files.length, bytes: fs.statSync(options.output).size, publicKeyFingerprint: fingerprint, restoredBeforeEncryption: verified?.restored === true };
  } catch (error) {
    throw new Error(/^[a-z_]+$/.test(error?.message || '') ? error.message : 'backup_' + stage + '_failed');
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}
async function restore(options) {
  // This check precedes reading/decrypting the backup or opening any connection.
  const env = connection(options.databaseUrl, 'restore');
  if (!options.privateKey || !options.input || !options.destination || fs.existsSync(options.destination)) throw new Error('restore_input_or_destination_invalid');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'leadly-restore-')); fs.chmodSync(work, 0o700);
  try {
    const home = gpgHome(work); keyFingerprint(home, options.privateKey);
    const archive = path.join(work, 'payload.tar');
    const pass = options.passphraseFile ? ['--pinentry-mode', 'loopback', '--passphrase-file', options.passphraseFile] : [];
    run('gpg', ['--batch', '--homedir', home, ...pass, '--output', archive, '--decrypt', options.input]);
    const payload = path.join(work, 'payload'); fs.mkdirSync(payload, { mode: 0o700 });
    run('python3', [path.join(__dirname, 'unpack.py'), archive, payload]);
    const result = verifyPayload(payload, env);
    fs.mkdirSync(options.destination, { mode: 0o700 });
    if (fs.existsSync(path.join(payload, 'files'))) fs.cpSync(path.join(payload, 'files'), path.join(options.destination, 'files'), { recursive: true, force: false, errorOnExist: true });
    return result;
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}
function verifyPayload(payload, env) {
    const m = JSON.parse(fs.readFileSync(path.join(payload, 'manifest.json'), 'utf8'));
    if (m.version !== 1 || m.project !== project || !m.databaseSha256 || digest(path.join(payload, 'database.dump')) !== m.databaseSha256) throw new Error('backup_integrity_failed');
    for (const file of m.storage.files) {
      const target = path.resolve(payload, file.path);
      if (!target.startsWith(payload + path.sep + 'files' + path.sep) || fs.statSync(target).size !== file.size || digest(target) !== file.sha256) throw new Error('backup_integrity_failed');
    }
    const occupied = sql(env, "select (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)')+(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema'))+(select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname not in ('pg_catalog','information_schema'))+(select count(*) from pg_namespace where nspname not in ('public','pg_catalog','information_schema') and nspname !~ '^pg_(toast|temp)')");
    if (occupied !== '0') throw new Error('restore_database_is_not_empty');
    // A new PostgreSQL database has this empty schema; pg_dump recreates it.
    // No CASCADE: an unexpected object stops restoration instead of being deleted.
    sql(env, 'drop schema if exists public');
    for (const role of m.roles) {
      if (typeof role.name !== 'string' || role.name.startsWith('pg_') || typeof role.bypassRls !== 'boolean') throw new Error('invalid_backup_roles');
      const exists = sql(env, 'select count(*) from pg_roles where rolname=' + "'" + role.name.replace(/'/g, "''") + "'");
      if (exists === '0') sql(env, 'create role ' + identifier(role.name) + (role.bypassRls ? ' bypassrls' : '') + ' nologin');
    }
    // Managed cron/Vault/net schemas were excluded; no imported schedule can send messages.
    run(tool('pg_restore'), ['--exit-on-error', '--no-owner', '--dbname', env.PGDATABASE, path.join(payload, 'database.dump')], { env });
    let tables = 0;
    for (const [table, count] of Object.entries(m.tables)) {
      const parts = table.split('.'); if (parts.length !== 2 || !['public', 'auth', 'storage'].includes(parts[0])) throw new Error('invalid_table_manifest');
      if (Number(sql(env, 'select count(*) from ' + parts.map(identifier).join('.'))) !== count) throw new Error('restored_row_count_mismatch'); tables++;
    }
    if (Object.hasOwn(m.tables, 'storage.objects')) {
      const objects = JSON.parse(sql(env, "select coalesce(json_agg(json_build_object('bucket',bucket_id,'name',name,'id',id,'updatedAt',updated_at,'etag',metadata->>'eTag')),'[]'::json) from storage.objects"));
      if (objects.length !== m.storage.files.length) throw new Error('storage_snapshot_mismatch');
      for (const object of objects) {
        const file = m.storage.files.find(f => f.bucket === object.bucket && f.name === object.name);
        if (!file || file.id !== object.id || Date.parse(file.updatedAt) !== Date.parse(object.updatedAt) || file.serverETag !== object.etag) throw new Error('storage_snapshot_mismatch');
      }
    }
    return { restored: true, isolated: true, tablesVerified: tables, storageFilesVerified: m.storage.files.length, productionWritten: false };
}
module.exports = { backup, restore, connection, copyCounts, exportStorage, toolFailure };
if (require.main === module) {
  process.umask(0o077);
  const action = process.argv[2];
  (async () => {
    if (action === 'backup') {
      const { createClient } = require('@supabase/supabase-js');
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (new URL(url).hostname !== project + '.supabase.co') throw new Error('unexpected_storage_project');
      const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) } });
      if (!process.env.LEADLY_BACKUP_VERIFY_DATABASE_URL) throw new Error('isolated_verification_database_required');
      return backup({ databaseUrl: process.env.LEADLY_BACKUP_DATABASE_URL, verifyDatabaseUrl: process.env.LEADLY_BACKUP_VERIFY_DATABASE_URL, publicKey: process.env.LEADLY_BACKUP_PUBLIC_KEY_FILE, output: process.env.LEADLY_BACKUP_OUTPUT, storage: payload => exportStorage(db, payload) });
    }
    if (action === 'restore') return restore({ databaseUrl: process.env.LEADLY_RESTORE_DATABASE_URL, privateKey: process.env.LEADLY_BACKUP_PRIVATE_KEY_FILE, passphraseFile: process.env.LEADLY_BACKUP_PASSPHRASE_FILE, input: process.env.LEADLY_BACKUP_INPUT, destination: process.env.LEADLY_RESTORE_FILES });
    throw new Error('choose_backup_or_restore');
  })().then(report => console.log(JSON.stringify(report))).catch(error => { console.error(JSON.stringify({ completed: false, error: /^[a-z_]+$/.test(error.message) ? error.message : 'backup_operation_failed' })); process.exitCode = 1; });
}
