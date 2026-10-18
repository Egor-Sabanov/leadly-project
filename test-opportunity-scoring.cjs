'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const sourcePath = path.resolve(process.cwd(), 'lib/opportunity-scoring.ts');
if (!fs.existsSync(sourcePath)) {
  console.error('FILE_NOT_FOUND: expected lib/opportunity-scoring.ts');
  console.error('Run this script from the LEADLY project root after replacing the scoring file.');
  process.exit(2);
}

const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
  reportDiagnostics: true,
});
const fatalDiagnostics = (compiled.diagnostics || []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
if (fatalDiagnostics.length) {
  console.error('TYPESCRIPT_TRANSPILE_FAILED');
  for (const diagnostic of fatalDiagnostics) {
    console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  }
  process.exit(2);
}

const moduleShim = { exports: {} };
vm.runInNewContext(compiled.outputText, {
  module: moduleShim,
  exports: moduleShim.exports,
  require,
  console,
  Date,
  Intl,
  Math,
  Set,
  Map,
  Number,
  String,
  Array,
  Object,
  RegExp,
});

const { scoreOpportunity } = moduleShim.exports;
if (typeof scoreOpportunity !== 'function') {
  console.error('EXPORT_MISSING: scoreOpportunity');
  process.exit(2);
}

const baseProfile = {
  headline: 'Software developer',
  skillNames: [],
  serviceNames: [],
  targetMonthlyIncome: 10000,
  currencyCode: 'EUR',
  preferredTypes: ['job'],
  preferredCompetition: [],
  remoteOnly: false,
};

const opportunity = (overrides = {}) => ({
  id: 'test-opportunity',
  title: 'Senior Software Developer',
  description: 'Build and maintain web applications.',
  category: 'Software',
  type: 'job',
  remote: true,
  budget_min: null,
  budget_max: null,
  currency_code: null,
  budget_confidence: null,
  budget_extraction: null,
  currency_evidence: null,
  budget_period: null,
  competition: 'unknown',
  published_at: new Date().toISOString(),
  discovered_at: new Date().toISOString(),
  ...overrides,
});

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assertScoreBounds(result) {
  for (const key of ['match_score', 'money_score', 'competition_score', 'fit_score', 'risk_score']) {
    assert.ok(Number.isInteger(result[key]), `${key} should be an integer`);
    assert.ok(result[key] >= 0 && result[key] <= 100, `${key} should be in [0, 100]`);
  }
}

test('aliases: React.js in profile matches React in an opportunity', () => {
  const result = scoreOpportunity(
    { ...baseProfile, skillNames: ['React.js'] },
    opportunity({ title: 'Senior React Developer' }),
  );
  assert.ok(result.explanation.matched_keywords.includes('react'));
  assert.ok(result.match_score > scoreOpportunity(baseProfile, opportunity({ title: 'Senior React Developer' })).match_score);
  assertScoreBounds(result);
});

test('short technology terms: AI is retained and matched', () => {
  const result = scoreOpportunity(
    { ...baseProfile, skillNames: ['AI'] },
    opportunity({ title: 'AI Engineer' }),
  );
  assert.ok(result.explanation.matched_keywords.includes('ai'));
  assertScoreBounds(result);
});

test('aliases: JS in profile matches JavaScript in an opportunity', () => {
  const result = scoreOpportunity(
    { ...baseProfile, skillNames: ['JS'] },
    opportunity({ title: 'JavaScript Developer' }),
  );
  assert.ok(result.explanation.matched_keywords.includes('javascript'));
  assertScoreBounds(result);
});

test('missing budget is explicit and never represented as comparable', () => {
  const result = scoreOpportunity(baseProfile, opportunity());
  assert.equal(result.explanation.money_score_status, 'missing_budget');
  assert.ok(result.explanation.cautions.some((item) => item.toLowerCase().includes('бюджет не указан')));
  assertScoreBounds(result);
});

test('heuristically extracted amount is not treated as a verified financial comparison', () => {
  const result = scoreOpportunity(baseProfile, opportunity({
    budget_min: 83000,
    budget_max: 83000,
    currency_code: 'EUR',
    budget_confidence: 'medium',
    budget_extraction: 'heuristic',
    currency_evidence: 'explicit',
  }));
  assert.equal(result.explanation.money_score_status, 'heuristic_budget');
  assert.ok(result.explanation.cautions.some((item) => item.toLowerCase().includes('не подтверждён')));
  assertScoreBounds(result);
});

test('budget in a different currency is not compared to monthly target', () => {
  const result = scoreOpportunity(baseProfile, opportunity({
    budget_min: 12000,
    currency_code: 'USD',
    budget_confidence: 'medium',
    budget_extraction: 'verified',
    currency_evidence: 'explicit',
    budget_period: 'monthly',
  }));
  assert.equal(result.explanation.money_score_status, 'currency_mismatch');
  assertScoreBounds(result);
});

test('amount with unknown payment period is not compared to a monthly target', () => {
  const result = scoreOpportunity(baseProfile, opportunity({
    budget_min: 12000,
    currency_code: 'EUR',
    budget_confidence: 'medium',
    budget_extraction: 'verified',
    currency_evidence: 'explicit',
    budget_period: 'unknown',
  }));
  assert.equal(result.explanation.money_score_status, 'period_unknown');
  assertScoreBounds(result);
});

test('verified annual budget in matching currency is comparable to monthly target', () => {
  const result = scoreOpportunity(baseProfile, opportunity({
    budget_min: 120000,
    budget_max: 120000,
    currency_code: 'EUR',
    budget_confidence: 'medium',
    budget_extraction: 'verified',
    currency_evidence: 'explicit',
    budget_period: 'annual',
  }));
  assert.equal(result.explanation.money_score_status, 'comparable');
  assert.ok(result.explanation.reasons.some((item) => item.includes('Бюджет сопоставлен')));
  assertScoreBounds(result);
});

test('all scores remain inside 0..100 for an almost empty profile', () => {
  const result = scoreOpportunity({}, opportunity({
    title: 'AI',
    description: '',
    category: null,
    remote: false,
    published_at: 'not-a-date',
    discovered_at: null,
    competition: 'high',
  }));
  assert.equal(result.algorithm_version, 'v4');
  assertScoreBounds(result);
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error && error.stack ? error.stack : error);
  }
}
console.log(`RESULT ${tests.length - failures}/${tests.length} passed`);
if (failures) process.exitCode = 1;
