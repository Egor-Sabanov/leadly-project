/* All feeds, DNS and database writes are local mocks. No live API or email. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const load = require('./ts-loader.cjs').createTsLoader();
const { isCronAuthorized, retryIngestion, TransientIngestError } = load(path.join(__dirname, '../lib/sources/ingest-runtime.ts'));
const secret = 'local-test-cron-secret-at-least-16';
const ru = (link = 'https://example.com/projects/1') => `<item><title>Нужен монтаж рекламного видеоролика</title><description>Ищем специалиста по монтажу видео. Бюджет 10000 рублей.</description><link>${link}</link></item>`;
const english = '<item><title>Looking for a video editor</title><description>Please edit an English video advertisement.</description><link>https://example.com/english/1</link></item>';
const feed = (...items) => `<rss><channel>${items.join('')}</channel></rss>`;
const source = fs.readFileSync(path.join(__dirname, '../app/api/cron/ingest/route.ts'), 'utf8');

function harness(options = {}) {
  const requests = [], writes = [], logs = [], records = new Map();
  let databaseAttempts = 0;
  const env = {
    CRON_SECRET: secret,
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-only',
    LEADLY_RSS_FEEDS: 'https://www.fl.ru/rss/all.xml',
    ...options.env,
  };
  const supabase = {
    from(table) {
      assert.ok(['opportunities', 'opportunity_sources'].includes(table), 'Never write user-owned tables');
      return {
        upsert(rows, conflict) {
          if (table === 'opportunity_sources') return { select: () => ({ single: async () => ({ data: options.sourceError ? null : { id: 'fixture-source' }, error: options.sourceError ? { message: 'private-db-error' } : null }) }) };
          databaseAttempts++;
          assert.equal(conflict.onConflict, 'canonical_key');
          assert.equal(conflict.ignoreDuplicates, false);
          assert.ok(Array.isArray(rows), 'RSS uses one batch');
          assert.equal(new Set(rows.map(row => row.canonical_key)).size, rows.length);
          const status = options.databaseStatus?.(databaseAttempts) ?? 200;
          if (status === 0 || status >= 400) return Promise.resolve({ error: { message: 'private-db-error' }, status });
          writes.push(rows);
          for (const row of rows) records.set(row.canonical_key, row);
          return Promise.resolve({ error: null, status });
        },
      };
    },
  };
  const sandbox = {
    require(id) {
      if (id.startsWith('@/')) return load(path.join(__dirname, '..', id.slice(2) + '.ts'));
      if (id === '@supabase/supabase-js') return { createClient: () => supabase };
      if (id === 'next/server') return { NextResponse: Response };
      if (id === 'node:dns/promises') return { lookup: async () => [{ address: '1.1.1.1' }] };
      return require(id);
    },
    exports: {}, module: { exports: {} }, process: { env },
    URL, TextDecoder, Uint8Array, AbortSignal, Date,
    console: { info: text => logs.push(JSON.parse(text)) },
    fetch: async (url, init) => {
      requests.push(String(url));
      assert.equal(init.redirect, 'manual');
      assert.ok(init.signal instanceof AbortSignal);
      return options.response?.(String(url), requests.length) ?? new Response(feed(ru()));
    },
  };
  vm.runInNewContext(ts.transpileModule(`${source}\nmodule.exports={GET};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  return {
    requests, writes, logs, records, env,
    databaseAttempts: () => databaseAttempts,
    async run(header = `Bearer ${secret}`) {
      const response = await sandbox.module.exports.GET(new Request('https://leadly.example/api/cron/ingest', { headers: header ? { authorization: header } : {} }));
      return { response, body: await response.json() };
    },
  };
}

const tests = [
  ['cron rejects absent, weak and incorrect credentials', async () => {
    assert.equal(isCronAuthorized('short', 'Bearer short'), false);
    assert.equal(isCronAuthorized(secret, null), false);
    assert.equal(isCronAuthorized(secret, `Bearer ${secret}x`), false);
    assert.equal(isCronAuthorized(secret, `Bearer ${secret}`), true);
    const h = harness();
    for (const header of [null, 'Bearer wrong', secret]) assert.equal((await h.run(header)).response.status, 401);
    assert.equal(h.requests.length, 0); assert.equal(h.writes.length, 0);
  }],
  ['Russian filtering, canonical dedupe and batch preserve idempotency', async () => {
    const h = harness({ response: () => new Response(feed(ru(), ru('https://example.com/projects/1?utm_source=test'), english)) });
    const first = await h.run(), second = await h.run();
    assert.equal(first.response.status, 200);
    assert.equal(first.body.imported, 1); assert.equal(first.body.skipped, 2);
    assert.equal(second.body.imported, 1); assert.equal(h.records.size, 1);
    assert.equal(h.writes.length, 2); assert.equal(h.writes[0][0].raw_metadata.content_language, 'ru');
    assert.equal(h.writes[0][0].type, 'project');
    assert.notEqual(first.body.runId, second.body.runId);
    assert.ok(first.body.finishedAt && first.body.durationMs >= 0);
    assert.equal(first.response.headers.get('cache-control'), 'no-store, max-age=0');
    assert.deepEqual(h.logs.map(row => row.event), ['ingestion_started', 'ingestion_finished', 'ingestion_started', 'ingestion_finished']);
    assert.ok(!JSON.stringify(h.logs).includes(secret));
  }],
  ['one invalid source does not prevent a valid source importing', async () => {
    const h = harness({ env: { LEADLY_RSS_FEEDS: 'http://localhost/private?token=never-log,https://example.com/feed' } });
    const { response, body } = await h.run();
    assert.equal(response.status, 502); assert.equal(body.status, 'partial');
    assert.equal(body.feedsFailed, 1); assert.equal(body.imported, 1); assert.equal(h.requests.length, 1);
    assert.ok(!JSON.stringify(body).includes('never-log'));
  }],
  ['a transient upstream error retries once then succeeds', async () => {
    const h = harness({ response: (_url, attempt) => attempt === 1 ? new Response('', { status: 503 }) : new Response(feed(ru())) });
    assert.equal((await h.run()).response.status, 200); assert.equal(h.requests.length, 2);
  }],
  ['persistent upstream failure is bounded and produces HTTP failure', async () => {
    const h = harness({ response: () => new Response('', { status: 503 }) });
    const { response, body } = await h.run();
    assert.equal(response.status, 502); assert.equal(body.status, 'failed');
    assert.equal(h.requests.length, 2); assert.equal(h.writes.length, 0);
  }],
  ['permission denial is not retried and other feeds still run', async () => {
    const h = harness({ env: { LEADLY_RSS_FEEDS: 'https://denied.example/feed,https://example.com/feed' }, response: url => url.includes('denied.example') ? new Response('', { status: 403 }) : new Response(feed(ru())) });
    const { body } = await h.run();
    assert.equal(h.requests.length, 2); assert.equal(body.status, 'partial'); assert.equal(body.imported, 1);
  }],
  ['a transient database error retries the atomic batch', async () => {
    for (const transient of [0, 503]) {
      const h = harness({ databaseStatus: attempt => attempt === 1 ? transient : 200 });
      assert.equal((await h.run()).response.status, 200);
      assert.equal(h.databaseAttempts(), 2); assert.equal(h.records.size, 1);
    }
  }],
  ['schema failure is not retried and does not leak database diagnostics', async () => {
    const h = harness({ databaseStatus: () => 400 });
    const { response, body } = await h.run();
    assert.equal(response.status, 502); assert.equal(body.imported, 0);
    assert.equal(h.databaseAttempts(), 1); assert.ok(!JSON.stringify(body).includes('private-db-error'));
  }],
  ['source write failure does not import orphan opportunities', async () => {
    const h = harness({ sourceError: true });
    const { response, body } = await h.run();
    assert.equal(response.status, 502); assert.equal(h.writes.length, 0);
    assert.ok(!JSON.stringify(body).includes('private-db-error'));
  }],
  ['empty XML is a source failure and foreign-only content is skipped', async () => {
    const empty = await harness({ response: () => new Response('<rss/>') }).run();
    assert.equal(empty.response.status, 502);
    const foreign = await harness({ response: () => new Response(feed(english)) }).run();
    assert.equal(foreign.response.status, 200); assert.equal(foreign.body.skipped, 1); assert.equal(foreign.body.imported, 0);
  }],
  ['expired overall deadline prevents starting work or retries', async () => {
    const controller = new AbortController(); controller.abort();
    let calls = 0;
    await assert.rejects(() => retryIngestion(async () => { calls++; }, controller.signal));
    assert.equal(calls, 0);
    const during = new AbortController();
    await assert.rejects(() => retryIngestion(async () => { calls++; during.abort(); throw new TransientIngestError('fixture'); }, during.signal));
    assert.equal(calls, 1);
  }],
  ['deployment includes one daily protected ingestion route', () => {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
    assert.deepEqual(config.crons, [{ path: '/api/cron/ingest', schedule: '0 6 * * *' }]);
    assert.match(source, /export const maxDuration = 300/);
  }],
];

(async () => {
  let passed = 0;
  for (const [name, test] of tests) {
    try { await test(); passed++; console.log('PASS', name); }
    catch (error) { console.error('FAIL', name, error.message); process.exitCode = 1; }
  }
  console.log(`RESULT ${passed}/${tests.length} scheduled ingestion checks passed`);
})();
