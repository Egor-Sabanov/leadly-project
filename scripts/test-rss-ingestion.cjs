const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const dns = require('node:dns/promises');
const vm = require('node:vm');
const ts = require('typescript');

const routePath = require('node:path').join(__dirname, '..', 'app', 'api', 'cron', 'ingest', 'route.ts');
const source = fs.readFileSync(routePath, 'utf8');
const start = source.indexOf('type FeedItem =');
const end = source.indexOf('\nexport async function GET', start);
assert.ok(start >= 0 && end > start, 'Could not locate RSS helper functions in route.ts');
const helperSource = `const MAX_ITEMS_PER_FEED = 40; const MAX_DESCRIPTION = 6000; const MAX_RESPONSE_BYTES = 2_000_000; const MAX_FREELANCEHUNT_PAGES = 3; const MAX_FREELANCEHUNT_PROJECTS_PER_SYNC = 40; const FREELANCEHUNT_API_BASE = 'https://api.freelancehunt.com/v2/projects';\n${source.slice(start, end)}\nmodule.exports = { extractBudget, isPublicIp, parseFeedUrl, decodeXml, parseFeed, canonicalKey, classify, classifyFeedItem, sourceIdentity, parseSafeFreelancehuntWebUrl, safeFreelancehuntNextUrl, normalizeFreelancehuntProject, shouldSkipFreelancehuntProject, importFreelancehuntProjects, fetchFreelancehuntProjectPage };`;
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const sandbox = {
  createHash: crypto.createHash,
  isIP: net.isIP,
  lookup: dns.lookup,
  URL,
  TextDecoder,
  AbortSignal,
  fetch,
  module: { exports: {} },
  exports: {},
};
vm.runInNewContext(compiled, sandbox, { timeout: 1000 });
const { extractBudget, isPublicIp, parseFeedUrl, decodeXml, parseFeed, canonicalKey, classify, classifyFeedItem, sourceIdentity, parseSafeFreelancehuntWebUrl, safeFreelancehuntNextUrl, normalizeFreelancehuntProject, shouldSkipFreelancehuntProject, importFreelancehuntProjects, fetchFreelancehuntProjectPage } = sandbox.module.exports;

const endpointSandbox = {
  require: (id) => {
    if (id === 'node:crypto') return crypto;
    if (id === 'node:dns/promises') return dns;
    if (id === 'node:net') return net;
    if (id === '@supabase/supabase-js') return { createClient: () => ({ from: () => ({}) }) };
    if (id === 'next/server') return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } };
    return require(id);
  },
  process: { env: {} },
  module: { exports: {} },
  exports: {},
  URL, TextDecoder, AbortSignal, fetch,
};
const endpointJs = ts.transpileModule(`${source}\nmodule.exports = { GET };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(endpointJs, endpointSandbox, { timeout: 1000 });
const endpointGet = endpointSandbox.module.exports.GET;
const tests = [
  ['blocks private IPv4', () => assert.equal(isPublicIp('10.1.2.3'), false)],
  ['blocks loopback IPv4', () => assert.equal(isPublicIp('127.0.0.1'), false)],
  ['blocks link-local IPv4', () => assert.equal(isPublicIp('169.254.1.1'), false)],
  ['blocks shared IPv4', () => assert.equal(isPublicIp('100.64.0.1'), false)],
  ['blocks special IPv4 192.0.0/24', () => assert.equal(isPublicIp('192.0.0.8'), false)],
  ['blocks deprecated 6to4 IPv4', () => assert.equal(isPublicIp('192.88.99.1'), false)],
  ['blocks documentation IPv4', () => assert.equal(isPublicIp('203.0.113.10'), false)],
  ['allows public IPv4', () => assert.equal(isPublicIp('1.1.1.1'), true)],
  ['blocks IPv6 loopback', () => assert.equal(isPublicIp('::1'), false)],
  ['blocks IPv6 documentation range', () => assert.equal(isPublicIp('2001:db8::1'), false)],
  ['blocks IPv6 6to4 range', () => assert.equal(isPublicIp('2002:c000:0204::1'), false)],
  ['allows global IPv6', () => assert.equal(isPublicIp('2606:4700:4700::1111'), true)],
  ['rejects non-HTTPS feed URLs', () => assert.equal(parseFeedUrl('http://example.com/feed.xml'), null)],
  ['rejects credential-bearing URLs', () => assert.equal(parseFeedUrl('https://user:pass@example.com/feed.xml'), null)],
  ['rejects nonstandard ports', () => assert.equal(parseFeedUrl('https://example.com:8443/feed.xml'), null)],
  ['rejects localhost feed URLs', () => assert.equal(parseFeedUrl('https://localhost/feed.xml'), null)],
  ['accepts a public HTTPS hostname syntactically', () => assert.equal(parseFeedUrl('https://example.com/feed.xml').hostname, 'example.com')],
  ['does not treat year alone as budget', () => assert.equal(extractBudget('Опубликовано в 2026 году. Проект основан в 2020.').min, null)],
  ['extracts explicit RUB amount', () => assert.equal(extractBudget('Бюджет проекта 50 000 ₽').min, 50000)],
  ['extracts USD amount', () => { const b = extractBudget('Salary: $4,000 per month'); assert.equal(b.min, 4000); assert.equal(b.currency, 'USD'); }],
  ['extracts a budget range', () => { const b = extractBudget('Бюджет: от 10 000 до 25 000 рублей'); assert.equal(b.min, 10000); assert.equal(b.max, 25000); }],
  ['marks default currency provenance', () => assert.equal(extractBudget('Стоимость проекта 15000').currencyEvidence, 'defaulted_rub')],
  ['does not capture a distant year after price label', () => assert.equal(extractBudget('Цена указана отдельно, запуск в 2026 году.').min, null)],
  ['parses decimal comma', () => assert.equal(extractBudget('Цена: 1 250,50 RUB').min, 1250.5)],
  ['does not merge unrelated date range into budget', () => { const b = extractBudget('Бюджет: 50000 RUB. Сроки: 2020-2025 годы.'); assert.equal(b.min, 50000); assert.equal(b.max, 50000); }],
  ['decodes XML entities safely', () => assert.equal(decodeXml('A &amp; B &#65;'), 'A & B A')],
  ['ignores invalid XML Unicode code point instead of throwing', () => assert.equal(decodeXml('x &#99999999; y'), 'x y')],
  ['parses RSS entries with HTTPS links', () => { const items = parseFeed('<rss><channel><item><title>Project</title><link>https://example.com/job</link><description>Budget 10000 RUB</description></item></channel></rss>'); assert.equal(items.length, 1); assert.equal(items[0].title, 'Project'); }],
  ['strips escaped HTML tags from RSS descriptions while keeping readable text', () => { const items = parseFeed('<rss><channel><item><title>Sticker Mule</title><link>https://example.com/job</link><description>&amp;lt;p&amp;gt;We are hiring &amp;lt;strong&amp;gt;TypeScript&amp;lt;/strong&amp;gt;&amp;lt;/p&amp;gt;&amp;nbsp;remote</description></item></channel></rss>'); assert.equal(items[0].description, 'We are hiring TypeScript remote'); }],
  ['classifies WWR programming feed as job regardless of item wording', () => assert.equal(classifyFeedItem('SEEKING FREELANCER | Remote', 'https://weworkremotely.com/categories/remote-programming-jobs.rss'), 'job')],
  ['classifies HN SEEKING FREELANCER post as client lead', () => assert.equal(classifyFeedItem('SEEKING FREELANCER | Remote\nNeed a React developer', 'https://hnrss.org/whoishiring/freelance'), 'client')],
  ['classifies HN SEEKING WORK post as freelancer offering services', () => assert.equal(classifyFeedItem('SEEKING WORK | Remote\nReact and Next.js developer available', 'https://hnrss.org/whoishiring/freelance'), 'freelance')],
  ['keeps ambiguous HN freelance entry out of client leads', () => assert.equal(classifyFeedItem('Freelancer thread without a clear heading', 'https://hnrss.org/whoishiring/freelance'), 'other')],
  ['HN thread-wrapper title does not override SEEKING WORK in comment body', () => assert.equal(classifyFeedItem('New comment in Ask HN: Freelancer? Seeking freelancer? (October 2025) SEEKING WORK | React/Next.js developer available', 'https://hnrss.org/whoishiring/freelance', 'SEEKING WORK | React/Next.js developer available'), 'freelance')],
  ['HN thread-wrapper title does not override SEEKING FREELANCER in comment body', () => assert.equal(classifyFeedItem('New comment in Ask HN: Freelancer? Seeking freelancer? (October 2025) SEEKING FREELANCER | Need a React developer', 'https://hnrss.org/whoishiring/freelance', 'SEEKING FREELANCER | Need a React developer'), 'client')],
  ['HN marker is read from body even when title contains both generic phrases', () => assert.equal(classifyFeedItem('Ask HN: Freelancer? Seeking freelancer? SEEKING WORK', 'https://hnrss.org/whoishiring/freelance', 'SEEKING WORK - available for React projects'), 'freelance')],
  ['classifies Remotive public feed as employment jobs', () => assert.equal(classifyFeedItem('Seeking a freelancer for a gig', 'https://remotive.com/feed'), 'job')],
  ['classifies Jobicy filtered contract feed as a job even when text mentions freelancer', () => assert.equal(classifyFeedItem('Freelance developer needed for short contract', 'https://jobicy.com/jobs/feed?industry=engineering&type=contract&tag=developer&geo=europe'), 'job')],
  ['uses stable Jobicy source identity for its filtered RSS feed', () => { const identity = sourceIdentity(new URL('https://jobicy.com/jobs/feed?industry=engineering&type=contract&tag=developer&geo=europe')); assert.equal(identity.name, 'Jobicy Contract Jobs'); assert.equal(identity.slug, 'jobicy-contract-jobs'); assert.equal(identity.baseUrl, 'https://jobicy.com'); }],
  ['Jobicy filtered feed URL is valid HTTPS and preserves filters', () => { const url = parseFeedUrl('https://jobicy.com/jobs/feed?industry=engineering&type=contract&tag=developer&geo=europe'); assert.ok(url); assert.equal(url.searchParams.get('industry'), 'engineering'); assert.equal(url.searchParams.get('type'), 'contract'); assert.equal(url.searchParams.get('tag'), 'developer'); assert.equal(url.searchParams.get('geo'), 'europe'); }],
  ['classifies Codeur client project feed as project even when body is French', () => assert.equal(classifyFeedItem('Développement plateforme SaaS pour la téléconsultation médicale', 'https://www.codeur.com/projects?format=rss'), 'project')],
  ['uses stable Codeur Projects source identity', () => { const identity = sourceIdentity(new URL('https://www.codeur.com/projects?format=rss')); assert.equal(identity.name, 'Codeur Projects'); assert.equal(identity.slug, 'codeur-projects'); assert.equal(identity.baseUrl, 'https://www.codeur.com'); }],
  ['extracts a French-source euro budget from a currency-marked amount', () => { const b = extractBudget('Budget: 500 € à 1 000 €'); assert.equal(b.currency, 'EUR'); assert.equal(b.min, 500); assert.equal(b.max, 1000); }],
  ['normalizes tracking parameters for dedupe', () => assert.equal(canonicalKey('https://example.com/job?utm_source=x'), canonicalKey('https://example.com/job'))],
  ['preserves case-sensitive URL paths for dedupe', () => assert.notEqual(canonicalKey('https://example.com/Job'), canonicalKey('https://example.com/job'))],
  ['classifies Remotive software-development RSS as employment jobs', () => assert.equal(classifyFeedItem('Looking for a freelancer', 'https://remotive.com/remote-jobs/feed/software-development'), 'job')],
  ['uses stable Remotive source identity for its software feed', () => { const identity = sourceIdentity(new URL('https://remotive.com/remote-jobs/feed/software-development')); assert.equal(identity.name, 'Remotive Software Development'); assert.equal(identity.slug, 'remotive-software-development'); assert.equal(identity.baseUrl, 'https://remotive.com'); }],
  ['accepts only official Freelancehunt public project URLs', () => { assert.equal(parseSafeFreelancehuntWebUrl('http://freelancehunt.com/project/my-project/123.html'), 'https://freelancehunt.com/project/my-project/123.html'); assert.equal(parseSafeFreelancehuntWebUrl('https://evil.example/project/x/123.html'), null); assert.equal(parseSafeFreelancehuntWebUrl('https://freelancehunt.com/profile/alice'), null); }],
  ['rejects unsafe Freelancehunt API pagination URLs', () => { assert.equal(safeFreelancehuntNextUrl('https://api.freelancehunt.com/v2/projects?page%5Bnumber%5D=2') !== null, true); assert.equal(safeFreelancehuntNextUrl('https://evil.example/v2/projects?page=2'), null); assert.equal(safeFreelancehuntNextUrl('http://api.freelancehunt.com/v2/projects?page=2'), null); assert.equal(safeFreelancehuntNextUrl('https://api.freelancehunt.com/v2/my/profile'), null); }],
  ['normalizes Freelancehunt project fields, API budget, skills and source link', () => { const p = normalizeFreelancehuntProject({ id: 123, attributes: { name: 'Build a SaaS MVP', description_html: '<p>Need <strong>Next.js</strong> and Supabase</p>', budget: { amount: 12000, currency: 'RUB' }, published_at: '2026-10-15T12:00:00Z', expired_at: '2026-11-15T12:00:00Z', skills: [{ name: 'JavaScript' }, { name: 'React' }], is_remote_job: true, status: { name: 'Open for proposals' } }, links: { self: { web: 'http://freelancehunt.com/project/saas-mvp/123.html' } } }); assert.ok(p); assert.equal(p.externalId, '123'); assert.equal(p.url, 'https://freelancehunt.com/project/saas-mvp/123.html'); assert.equal(p.description, 'Need Next.js and Supabase'); assert.equal(p.budgetAmount, 12000); assert.equal(p.currencyCode, 'RUB'); assert.deepEqual(Array.from(p.skillNames), ['JavaScript', 'React']); assert.equal(p.remote, true); }],
  ['skips Freelancehunt records without a canonical public project URL', () => assert.equal(normalizeFreelancehuntProject({ id: 124, attributes: { name: 'No public URL' }, links: { self: { api: 'https://api.freelancehunt.com/v2/projects/124' } } }), null)],
  ['skips expired or closed Freelancehunt projects', () => { const base = { externalId: '1', title: 'Example', description: '', url: 'https://freelancehunt.com/project/example/1.html', publishedAt: null, expiresAt: '2020-01-01T00:00:00Z', budgetAmount: null, currencyCode: null, skillNames: [], location: null, remote: true, remoteEvidence: 'inferred_no_location', status: 'Open for proposals' }; assert.equal(shouldSkipFreelancehuntProject(base, Date.parse('2026-10-17T00:00:00Z')), true); assert.equal(shouldSkipFreelancehuntProject({ ...base, expiresAt: null, status: 'Closed' }), true); assert.equal(shouldSkipFreelancehuntProject({ ...base, expiresAt: null, status: 'Open for proposals' }), false); }],
  ['Freelancehunt fixed price budget is absent unless amount and currency are valid', () => { const p = normalizeFreelancehuntProject({ id: 125, attributes: { name: 'Fix site', budget: { amount: 5000, currency: '???' } }, links: { self: { web: 'https://freelancehunt.com/project/fix-site/125.html' } } }); assert.ok(p); assert.equal(p.budgetAmount, null); assert.equal(p.currencyCode, null); }],
  ['Freelancehunt import maps API project and writes idempotent normalized opportunity data', async () => {
    const apiRecord = { id: 987, attributes: { name: 'Build a web app', description_html: '<p>React and Next.js</p>', budget: { amount: 8000, currency: 'RUB' }, published_at: '2026-10-16T10:00:00Z', expired_at: '2099-10-16T10:00:00Z', skills: [{ name: 'React' }], is_remote_job: true, status: { name: 'Open for proposals' } }, links: { self: { web: 'https://freelancehunt.com/project/build-web-app/987.html' } } };
    const sourceUpsert = { select: () => ({ single: async () => ({ data: { id: 'source-id' }, error: null }) }) };
    const written = [];
    const fakeSupabase = { from: (table) => ({ upsert: (row, options) => { if (table === 'opportunity_sources') return sourceUpsert; written.push({ table, row, options }); return Promise.resolve({ error: null }); } }) };
    sandbox.fetch = async (url, init) => { assert.equal(String(url).startsWith('https://api.freelancehunt.com/v2/projects'), true); assert.equal(init.headers.Authorization, 'Bearer secret-token-for-test'); assert.equal(init.redirect, 'error'); return new Response(JSON.stringify({ data: [apiRecord], links: { self: String(url) } }), { status: 200, headers: { 'content-type': 'application/json' } }); };
    const result = await importFreelancehuntProjects(fakeSupabase, 'secret-token-for-test');
    assert.equal(result.feed, 'Freelancehunt Projects'); assert.equal(result.imported, 1); assert.equal(result.skipped, 0); assert.equal(result.pages, 1);
    assert.equal(written.length, 1); assert.equal(written[0].row.type, 'project'); assert.equal(written[0].row.company_name, 'Freelancehunt Projects'); assert.equal(written[0].row.currency_code, 'RUB'); assert.equal(written[0].row.raw_metadata.budget_extraction, 'api'); assert.equal(written[0].options.onConflict, 'canonical_key');
  }],
  ['Freelancehunt connector does not include API token in authorization errors', async () => {
    sandbox.fetch = async (_url, init) => { assert.equal(init.headers.Authorization, 'Bearer do-not-leak'); return new Response('{"error":{"status":401,"title":"Unauthorized"}}', { status: 401 }); };
    await assert.rejects(fetchFreelancehuntProjectPage('https://api.freelancehunt.com/v2/projects?page%5Bnumber%5D=1', 'do-not-leak'), /HTTP 401/);
    try { await fetchFreelancehuntProjectPage('https://api.freelancehunt.com/v2/projects?page%5Bnumber%5D=1', 'do-not-leak'); } catch (error) { assert.equal(error.message.includes('do-not-leak'), false); }
  }],
  ['endpoint rejects missing cron secret', async () => { endpointSandbox.process.env = {}; const r = await endpointGet({ headers: { get: () => null } }); assert.equal(r.status, 401); }],
  ['endpoint rejects missing server Supabase config', async () => { endpointSandbox.process.env = { CRON_SECRET: 'test-secret' }; const r = await endpointGet({ headers: { get: () => 'Bearer test-secret' } }); assert.equal(r.status, 503); }],
  ['endpoint rejects empty feed configuration', async () => { endpointSandbox.process.env = { CRON_SECRET: 'test-secret', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key', LEADLY_RSS_FEEDS: '' }; const r = await endpointGet({ headers: { get: () => 'Bearer test-secret' } }); assert.equal(r.status, 400); }],
];
let failures = 0;
(async () => {
  for (const [name, run] of tests) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); }
  }
  console.log(`RESULT ${tests.length - failures}/${tests.length} passed`);
  if (failures) process.exitCode = 1;
})();
