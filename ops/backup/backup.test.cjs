const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { connection, copyCounts, exportStorage, restore, toolFailure } = require('./backup.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leadly-backup-test-'));
let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('PASS ' + name); };
function storage(rows, files = {}) { return { storage: { listBuckets: async () => ({ data: [{ id: 'avatars', public: false }] }), from: () => ({ list: async () => ({ data: rows }), download: async key => ({ data: new Blob([files[key] || 'avatar']) }) }) } }; }
(async () => { try {
  await test('restore rejects hosted databases and non-isolated names before reading any archive', async () => {
    for (const url of ['postgres://postgres:secret@db.leezcyaqhozguvcehcpd.supabase.co/postgres', 'postgres://u@127.0.0.1/postgres', 'postgres://u@localhost/leadly_restore_ok?host=production.example']) await assert.rejects(() => restore({ databaseUrl: url }), /restore_target|invalid_database/);
    assert.equal(connection('postgres://u@127.0.0.1/leadly_restore_case', 'restore').PGDATABASE, 'leadly_restore_case');
  });
  await test('source connection is fixed to the approved Supabase project and password stays out of command arguments', () => {
    const env = connection('postgresql://postgres.leezcyaqhozguvcehcpd:my%40password@aws-1-eu.pooler.supabase.com:5432/postgres', 'backup'); assert.equal(env.PGPASSWORD, 'my@password'); assert.equal(env.PGSSLMODE, 'verify-full');
    assert.throws(() => connection('postgres://u:p@other.example/postgres', 'backup'));
  });
  await test('hosted backups verify the hostname with the official Supabase CA and isolated restores stay local', () => {
    const { X509Certificate } = require('node:crypto');
    const env = connection('postgresql://postgres.leezcyaqhozguvcehcpd:fixture@aws-1-eu.pooler.supabase.com:5432/postgres?sslmode=require', 'backup');
    assert.equal(env.PGSSLMODE, 'verify-full'); assert.equal(env.PGSSLROOTCERT, path.join(__dirname, 'supabase-ca-2021.crt'));
    const certificate = new X509Certificate(fs.readFileSync(env.PGSSLROOTCERT));
    assert.equal(certificate.ca, true); assert.equal(certificate.fingerprint256, '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
    assert(Date.parse(certificate.validTo) > Date.now());
    const isolated = connection('postgres://u@127.0.0.1/leadly_restore_fixture', 'restore');
    assert.equal(isolated.PGSSLMODE, 'disable'); assert.equal(isolated.PGSSLROOTCERT, undefined);
  });
  await test('an inherited libpq address cannot redirect an isolated restore to another host', () => {
    const original = process.env.PGHOSTADDR;
    try {
      process.env.PGHOSTADDR = '192.0.2.1';
      const env = connection('postgres://u@127.0.0.1/leadly_restore_fixture', 'restore');
      assert.equal(env.PGHOST, '127.0.0.1'); assert.equal(env.PGHOSTADDR, undefined);
    } finally { if (original === undefined) delete process.env.PGHOSTADDR; else process.env.PGHOSTADDR = original; }
  });
  await test('malformed connection strings fail with fixed codes instead of exposing input', () => {
    assert.throws(() => connection('not-a-connection-private-password', 'backup'), { message: 'invalid_database_connection' });
    assert.throws(() => connection('postgres://u:bad%password@127.0.0.1/leadly_restore_fixture', 'restore'), { message: 'invalid_database_url_encoding' });
  });
  await test('database failures expose a fixed diagnosis without printing credentials or tool output', () => {
    const privateText = 'postgres://private-user:private-password@private.example/private-db';
    for (const [text, expected] of [['password authentication failed', 'authentication'], ['certificate verify failed', 'certificate'], ['aborting because of server version mismatch', 'client_version_mismatch'], ['permission denied for table private_users', 'permission_denied'], ['connection refused', 'connection']]) {
      const code = toolFailure('/usr/bin/pg_dump', text + privateText);
      assert.equal(code, 'backup_database_' + expected + (['authentication', 'certificate', 'connection'].includes(expected) ? '_failed' : ''));
      assert(!code.includes('private'));
    }
    assert.equal(toolFailure('pg_dump', privateText), 'backup_tool_failed_pg_dump');
  });
  await test('row counts include escaped multiline records and empty tables without printing their contents', () => {
    assert.deepEqual(copyCounts('COPY public.notes (id, note) FROM stdin;\n1\tprivate\\ntext\n2\t\\\\.\n\\.\nCOPY auth.users (id) FROM stdin;\n\\.\n'), { 'public.notes': 2, 'auth.users': 0 }); assert.throws(() => copyCounts('not a dump'));
  });
  await test('Storage export hashes bytes and preserves private bucket paths', async () => {
    const r = await exportStorage(storage([{ id: 'object', name: 'avatar.webp', metadata: { size: 6 } }]), path.join(root, 'ok')); assert.equal(r.files.length, 1); assert.equal(r.files[0].sha256.length, 64); assert.equal(r.buckets[0].public, false); assert.equal(fs.statSync(path.join(root, 'ok/files/avatars/avatar.webp')).mode & 0o777, 0o600);
  });
  await test('untrusted Storage names cannot escape the backup directory', async () => {
    for (const name of ['../secret', '..', '/etc/passwd', 'x\\y']) await assert.rejects(() => exportStorage(storage([{ id: 'object', name, metadata: {} }]), path.join(root, 'bad')), /unsafe_storage_path/);
  });
  await test('download and size failures stop backup instead of silently omitting a file', async () => {
    await assert.rejects(() => exportStorage(storage([{ id: 'object', name: 'a', metadata: { size: 20 } }]), path.join(root, 'limit'), { maxBytes: 5 }), /limit_exceeded/);
    const s = storage([{ id: 'object', name: 'a', metadata: {} }]); s.storage.from = () => ({ list: async () => ({ data: [{ id: 'object', name: 'a', metadata: {} }] }), download: async () => ({ error: true }) }); await assert.rejects(() => exportStorage(s, path.join(root, 'download')), /download_failed/);
  });
  await test('changing Storage during export invalidates the backup', async () => {
    let calls = 0; const s = storage([]); s.storage.from = () => ({ list: async () => ({ data: ++calls === 1 ? [{ id: 'object', name: 'a', updated_at: 'old', metadata: {} }] : [{ id: 'object', name: 'a', updated_at: 'new', metadata: {} }] }), download: async () => ({ data: new Blob(['x']) }) }); await assert.rejects(() => exportStorage(s, path.join(root, 'changed')), /changed_during_backup/);
  });
  console.log('RESULT ' + n + ' backup safety checks');
} finally { fs.rmSync(root, { recursive: true, force: true }); } })().catch(e => { console.error(e); process.exitCode = 1; });
