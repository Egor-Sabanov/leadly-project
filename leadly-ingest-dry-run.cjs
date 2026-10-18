'use strict'

const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const PROJECT_ROOT = process.cwd()
const envPath = path.join(PROJECT_ROOT, '.env.local')
const routePath = path.join(
	PROJECT_ROOT,
	'app',
	'api',
	'cron',
	'ingest',
	'route.ts',
)
const RSS_URL =
	'https://weworkremotely.com/categories/remote-programming-jobs.rss'
const operations = []

function loadSelectedEnv() {
	if (!fs.existsSync(envPath))
		throw new Error('.env.local не найден. Запусти скрипт из корня проекта.')
	const wanted = new Set([
		'NEXT_PUBLIC_SUPABASE_URL',
		'SUPABASE_SERVICE_ROLE_KEY',
		'CRON_SECRET',
	])
	const content = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '')
	for (const line of content.split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
		if (!match || !wanted.has(match[1])) continue
		let value = match[2].trim()
		if (
			value.length >= 2 &&
			((value[0] === '"' && value.at(-1) === '"') ||
				(value[0] === "'" && value.at(-1) === "'"))
		) {
			value = value.slice(1, -1)
		}
		process.env[match[1]] = value
	}
	for (const key of wanted) {
		if (!process.env[key])
			throw new Error(`${key} отсутствует или пустой в .env.local`)
	}
	// Override any previously configured feed only inside this child process.
	process.env.LEADLY_RSS_FEEDS = RSS_URL
}

function mockSupabaseCreateClient() {
	return {
		from(table) {
			return {
				upsert(payload, options) {
					operations.push({ table, payload, options })
					const query = {
						select() {
							return query
						},
						single() {
							return Promise.resolve({
								data: { id: 'dry-run-source-id' },
								error: null,
							})
						},
						then(resolve, reject) {
							return Promise.resolve({ data: null, error: null }).then(
								resolve,
								reject,
							)
						},
					}
					return query
				},
			}
		},
	}
}

async function main() {
	loadSelectedEnv()
	if (!fs.existsSync(routePath))
		throw new Error(
			'Не найден app/api/cron/ingest/route.ts. Запусти из корня проекта.',
		)

	const original = fs.readFileSync(routePath, 'utf8')
	const compiled = ts.transpileModule(original, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
			esModuleInterop: true,
		},
		reportDiagnostics: true,
	})
	const errors = (compiled.diagnostics || []).filter(
		d => d.category === ts.DiagnosticCategory.Error,
	)
	if (errors.length) {
		const message = ts.flattenDiagnosticMessageText(errors[0].messageText, '\n')
		throw new Error(`Ошибка транспиляции route.ts: ${message}`)
	}

	const mockRequire = id => {
		if (id === '@supabase/supabase-js')
			return { createClient: mockSupabaseCreateClient }
		if (id === 'next/server')
			return {
				NextResponse: {
					json(body, init = {}) {
						return { status: init.status || 200, body }
					},
				},
			}
		return require(id)
	}

	const mod = { exports: {} }
	const sandbox = {
		module: mod,
		exports: mod.exports,
		require: mockRequire,
		process,
		console,
		URL,
		Request,
		Response,
		Headers,
		fetch,
		AbortSignal,
		TextDecoder,
		Uint8Array,
		Buffer,
		setTimeout,
		clearTimeout,
	}
	vm.runInNewContext(compiled.outputText, sandbox, {
		filename: 'route.ts.transpiled.cjs',
		timeout: 15000,
	})

	const request = new Request('http://localhost/api/cron/ingest', {
		method: 'GET',
		headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
	})
	const response = await mod.exports.GET(request)
	const body = response.body || {}
	const sourceOps = operations.filter(op => op.table === 'opportunity_sources')
	const opportunityOps = operations.filter(op => op.table === 'opportunities')
	const rows = opportunityOps.map(op => op.payload)

	const validRow = row =>
		Boolean(
			row &&
			typeof row.title === 'string' &&
			row.title.trim().length > 0 &&
			row.title.length <= 300 &&
			typeof row.source_url === 'string' &&
			/^https:\/\//i.test(row.source_url) &&
			typeof row.canonical_key === 'string' &&
			/^[a-f0-9]{64}$/i.test(row.canonical_key) &&
			typeof row.type === 'string' &&
			(row.budget_min === null || typeof row.budget_min === 'number') &&
			(row.budget_max === null || typeof row.budget_max === 'number') &&
			row.raw_metadata &&
			row.raw_metadata.ingestion === 'rss-v2' &&
			Array.isArray(row.evidence) &&
			row.evidence.length > 0,
		)
	const invalidRows = rows.filter(row => !validRow(row))
	const typeCounts = {}
	for (const row of rows) typeCounts[row.type] = (typeCounts[row.type] || 0) + 1

	console.log('DRY_RUN_ONLY: true')
	console.log('SUPABASE_CLIENT: MOCKED (no network calls or database writes)')
	console.log('HANDLER_HTTP_STATUS:', response.status)
	console.log('HANDLER_OK:', Boolean(body.ok))
	console.log('FEEDS_PROCESSED:', body.feedsProcessed ?? 0)
	console.log('SIMULATED_SOURCE_UPSERTS:', sourceOps.length)
	console.log('SIMULATED_OPPORTUNITY_UPSERTS:', opportunityOps.length)
	console.log('INVALID_PREPARED_ROWS:', invalidRows.length)
	console.log('TYPE_COUNTS:', JSON.stringify(typeCounts))

	for (const row of rows.slice(0, 5)) {
		console.log(
			'PREVIEW:',
			JSON.stringify({
				title: String(row.title || '')
					.replace(/\s+/g, ' ')
					.slice(0, 90),
				type: row.type,
				sourceHost: (() => {
					try {
						return new URL(row.source_url).host
					} catch {
						return 'invalid'
					}
				})(),
				budget_min: row.budget_min,
				budget_max: row.budget_max,
				currency_code: row.currency_code,
				budget_confidence: row.raw_metadata?.budget_confidence,
				canonical_key_valid: /^[a-f0-9]{64}$/i.test(row.canonical_key || ''),
			}),
		)
	}

	if (Array.isArray(body.results)) {
		for (const result of body.results) {
			console.log(
				'FEED_RESULT:',
				JSON.stringify({
					feed: result.feed,
					importedInDryRun: result.imported,
					skipped: result.skipped,
					error: result.error || null,
				}),
			)
		}
	}

	if (invalidRows.length) process.exitCode = 2
}

main().catch(error => {
	// Avoid echoing configuration values or request authorization headers.
	console.error(
		'DRY_RUN_FAILED:',
		error && error.message ? error.message : 'unknown error',
	)
	process.exitCode = 1
})
