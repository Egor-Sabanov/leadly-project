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

test('generic job-ad words alone cannot create a high match score', () => {
  const genericOnlyProfile = {
    ...baseProfile,
    headline: 'Software Developer Project Manager',
    skillNames: [],
    serviceNames: [],
  };
  const result = scoreOpportunity(
    genericOnlyProfile,
    opportunity({
      title: 'Senior Software Developer',
      description: 'Manage software projects, teams, and development work.',
    }),
  );
  assert.ok(result.match_score <= 35, `expected generic-only match to be capped at 35; received ${result.match_score}`);
  assert.equal(result.explanation.matched_keywords.length, 0);
  assert.ok(result.explanation.cautions.some((item) => item.includes('недостаточно конкретных навыков')));
  assertScoreBounds(result);
});

test('unmatched specific skills cap match score despite generic job-ad vocabulary', () => {
  const result = scoreOpportunity(
    { ...baseProfile, headline: '', skillNames: ['React'], serviceNames: [] },
    opportunity({
      title: 'Senior Python Developer',
      description: 'Software engineering projects with a team and product manager.',
    }),
  );
  assert.ok(result.match_score <= 45, `expected unmatched skills to be capped at 45; received ${result.match_score}`);
  assert.equal(result.explanation.matched_keywords.length, 0);
  assert.ok(result.explanation.cautions.some((item) => item.includes('Match Score ограничен')));
  assertScoreBounds(result);
});

test('generic words do not inflate a real technology match', () => {
  const profile = { ...baseProfile, headline: '', skillNames: ['React', 'TypeScript'], serviceNames: [] };
  const clean = scoreOpportunity(
    profile,
    opportunity({ title: 'React TypeScript Engineer', description: 'Build React and TypeScript features.' }),
  );
  const noisy = scoreOpportunity(
    profile,
    opportunity({
      title: 'React TypeScript Engineer',
      description: 'Senior software developer for projects, teams, and product work. Build React and TypeScript features.',
    }),
  );
  assert.equal(noisy.match_score, clean.match_score);
  assert.ok(noisy.explanation.matched_keywords.includes('react'));
  assert.ok(noisy.explanation.matched_keywords.includes('typescript'));
  assertScoreBounds(noisy);
});

test('a technology in the title scores higher than the same technology mentioned only in the description', () => {
  const profile = { ...baseProfile, headline: '', skillNames: ['TypeScript'], serviceNames: [] };
  const titleMatch = scoreOpportunity(
    profile,
    opportunity({ title: 'TypeScript Engineer', description: 'Build software features.' }),
  );
  const descriptionOnly = scoreOpportunity(
    profile,
    opportunity({ title: 'AI Engineer', description: 'This long description mentions TypeScript once among many unrelated details.' }),
  );
  assert.ok(
    titleMatch.match_score > descriptionOnly.match_score,
    `expected title match (${titleMatch.match_score}) to beat description-only mention (${descriptionOnly.match_score})`,
  );
  assertScoreBounds(titleMatch);
  assertScoreBounds(descriptionOnly);
});

test('description-only keyword matches are capped and clearly cautioned', () => {
  const result = scoreOpportunity(
    { ...baseProfile, headline: '', skillNames: ['TypeScript'], serviceNames: [] },
    opportunity({ title: 'AI Engineer', description: 'A long unrelated description with TypeScript mentioned in passing.' }),
  );
  assert.ok(result.match_score <= 55, `expected description-only match <=55; got ${result.match_score}`);
  assert.ok(result.explanation.cautions.some((item) => item.includes('только в описании')));
  assert.ok(result.explanation.reasons.some((item) => item.includes('найдены только в описании')));
  assertScoreBounds(result);
});


test('v7: a matching technology in the title outranks multiple matches only in a long description', () => {
  const profile = {
    ...baseProfile,
    headline: 'Разработка веб-приложений и MVP/SaaS',
    skillNames: ['React', 'Next.js', 'TypeScript', 'Supabase', 'PostgreSQL'],
    serviceNames: ['Разработка MVP/SaaS'],
  };
  const proxify = scoreOpportunity(profile, opportunity({
    title: 'Senior Fullstack Developer (React.js / Node.js)',
    description: 'Build and maintain backend systems and collaborate with a distributed team.',
  }));
  const cloudSecurity = scoreOpportunity(profile, opportunity({
    title: 'Cloud Security Engineer',
    description: 'This unrelated security role mentions React, TypeScript, and PostgreSQL in a broad technology overview.',
  }));

  assert.ok(proxify.explanation.reasons.some((item) => item.includes('указаны в названии')));
  assert.ok(cloudSecurity.explanation.cautions.some((item) => item.includes('только в описании')));
  assert.ok(
    proxify.match_score > cloudSecurity.match_score,
    `expected title match (${proxify.match_score}) to outrank description-only matches (${cloudSecurity.match_score})`,
  );
  assertScoreBounds(proxify);
  assertScoreBounds(cloudSecurity);
});

test('v7: category-only evidence is weaker than an explicit title match and cautioned', () => {
  const profile = { ...baseProfile, headline: '', skillNames: ['React'], serviceNames: [] };
  const titleMatch = scoreOpportunity(profile, opportunity({
    title: 'React Developer',
    description: 'Build software features.',
    category: 'General',
  }));
  const categoryOnly = scoreOpportunity(profile, opportunity({
    title: 'Cloud Security Engineer',
    description: 'Protect cloud environments.',
    category: 'React technology consulting',
  }));
  assert.ok(titleMatch.match_score > categoryOnly.match_score);
  assert.ok(categoryOnly.explanation.cautions.some((item) => item.includes('только в категории')));
  assertScoreBounds(titleMatch);
  assertScoreBounds(categoryOnly);
});

test('v8: fit score orders title evidence above description-only and no evidence', () => {
  const profile = { ...baseProfile, headline: '', skillNames: ['React'], serviceNames: [] };
  const titleMatch = scoreOpportunity(profile, opportunity({
    title: 'React Developer',
    description: 'Build web features.',
  }));
  const descriptionOnly = scoreOpportunity(profile, opportunity({
    title: 'Cloud Security Engineer',
    description: 'React is mentioned in an unrelated technology overview.',
  }));
  const noMatch = scoreOpportunity(profile, opportunity({
    title: 'Cloud Security Engineer',
    description: 'Protect cloud environments and review security incidents.',
  }));
  assert.ok(
    titleMatch.fit_score > descriptionOnly.fit_score,
    `expected title fit (${titleMatch.fit_score}) > description-only fit (${descriptionOnly.fit_score})`,
  );
  assert.ok(
    descriptionOnly.fit_score > noMatch.fit_score,
    `expected description-only fit (${descriptionOnly.fit_score}) > no-match fit (${noMatch.fit_score})`,
  );
  assertScoreBounds(titleMatch);
  assertScoreBounds(descriptionOnly);
  assertScoreBounds(noMatch);
});

test('v8: realistic multi-skill title match outranks several incidental description mentions in fit score', () => {
  const profile = {
    ...baseProfile,
    headline: 'Разработка веб-приложений и MVP/SaaS',
    skillNames: ['React', 'Next.js', 'TypeScript', 'Supabase', 'PostgreSQL'],
    serviceNames: ['Разработка MVP/SaaS'],
  };
  const titleMatch = scoreOpportunity(profile, opportunity({
    title: 'Senior Fullstack Developer (React.js / Node.js)',
    description: 'Build backend systems and collaborate with a distributed team.',
  }));
  const descriptionOnly = scoreOpportunity(profile, opportunity({
    title: 'Cloud Security Engineer',
    description: 'This unrelated security role mentions React, TypeScript, and PostgreSQL in a broad technology overview.',
  }));
  assert.ok(
    titleMatch.fit_score > descriptionOnly.fit_score,
    `expected direct title fit (${titleMatch.fit_score}) > incidental description fit (${descriptionOnly.fit_score})`,
  );
  assertScoreBounds(titleMatch);
  assertScoreBounds(descriptionOnly);
});


test('v9: Russian landing-page service matches an English Landing Page title', () => {
  const result = scoreOpportunity(
    { ...baseProfile, headline: '', skillNames: [], serviceNames: ['Создание лендинга'] },
    opportunity({ title: 'Landing Page Developer', description: 'Create conversion-focused landing pages.' }),
  );
  assert.ok(result.explanation.matched_keywords.includes('landingpage'), `expected normalized service match; got ${result.explanation.matched_keywords.join(', ')}`);
  assert.ok(result.match_score > 35, `expected service alias to improve score; got ${result.match_score}`);
  assert.ok(result.explanation.reasons.some((item) => item.includes('направлением услуги') || item.includes('Можно предложить услуги')));
  assertScoreBounds(result);
});

test('v9: Russian website-maintenance service matches English maintenance wording', () => {
  const result = scoreOpportunity(
    { ...baseProfile, headline: '', skillNames: [], serviceNames: ['Поддержка сайта'] },
    opportunity({ title: 'Website Maintenance Engineer', description: 'Maintain client websites over time.' }),
  );
  assert.ok(result.explanation.matched_keywords.includes('websitemaintenance'));
  assertScoreBounds(result);
});

test('v10: Russian web-app and MVP/SaaS headline matches English development intent', () => {
  const result = scoreOpportunity(
    { ...baseProfile, headline: 'Разработка веб-приложений и MVP/SaaS', skillNames: [], serviceNames: [] },
    opportunity({ title: 'Web Application Developer for SaaS Products', description: 'Build a minimum viable product.' }),
  );
  assert.ok(result.explanation.matched_keywords.includes('webappdevelopment'));
  assert.ok(result.explanation.matched_keywords.includes('saasdevelopment'));
  assert.ok(result.explanation.matched_keywords.includes('mvpdevelopment'));
  assertScoreBounds(result);
});

test('v9: generic Russian job words alone do not create profile matches', () => {
  const result = scoreOpportunity(
    { ...baseProfile, headline: 'Разработка веб-приложений', skillNames: [], serviceNames: [] },
    opportunity({
      title: 'Senior Software Development Manager',
      description: 'Разработка приложений, работа в команде, опыт и выполнение проектов.',
    }),
  );
  assert.equal(result.explanation.matched_keywords.length, 0, `unexpected matches: ${result.explanation.matched_keywords.join(', ')}`);
  assert.ok(result.match_score <= 40, `unmatched profile terms should keep Match Score capped; got ${result.match_score}`);
  assert.ok(result.explanation.cautions.some((item) => item.includes('Не найдено значимых совпадений')));
  assertScoreBounds(result);
});

test('v9: SEO-audit service matches English SEO audit wording', () => {
  const result = scoreOpportunity(
    { ...baseProfile, headline: '', skillNames: [], serviceNames: ['SEO-аудит сайта'] },
    opportunity({ title: 'SEO Audit Specialist', description: 'Review technical SEO issues.' }),
  );
  assert.ok(result.explanation.matched_keywords.includes('seoaudit'));
  assertScoreBounds(result);
});


test('v10: API integration service does not match an incidental API mention', () => {
  const profile = { ...baseProfile, headline: '', skillNames: [], serviceNames: ['Интеграция внешнего API'] };
  const result = scoreOpportunity(profile, opportunity({
    title: 'Senior Java Developer',
    description: 'Our product exposes a REST API and documents client endpoints.',
  }));
  assert.equal(result.explanation.matched_keywords.length, 0, `unexpected matches: ${result.explanation.matched_keywords.join(', ')}`);
  assert.ok(!result.explanation.reasons.some((item) => item.includes('Можно предложить услуги')));
  assert.ok(result.match_score <= 40);
  assertScoreBounds(result);
});

test('v10: API integration service matches an explicit integration role', () => {
  const profile = { ...baseProfile, headline: '', skillNames: [], serviceNames: ['Интеграция внешнего API'] };
  const result = scoreOpportunity(profile, opportunity({
    title: 'Senior API Integration Engineer',
    description: 'Build and maintain third-party API connections.',
  }));
  assert.ok(result.explanation.matched_keywords.includes('apiintegration'));
  assert.ok(result.explanation.reasons.some((item) => item.includes('интеграция внешнего API')));
  assertScoreBounds(result);
});

test('v10: SaaS development service does not match SaaS as unrelated company context', () => {
  const profile = { ...baseProfile, headline: '', skillNames: [], serviceNames: ['Разработка SaaS-приложения'] };
  const result = scoreOpportunity(profile, opportunity({
    title: 'Application Security Engineer',
    description: 'Protect SaaS customers and review cloud security incidents.',
  }));
  assert.equal(result.explanation.matched_keywords.length, 0, `unexpected matches: ${result.explanation.matched_keywords.join(', ')}`);
  assert.ok(!result.explanation.reasons.some((item) => item.includes('Можно предложить услуги')));
  assert.ok(result.match_score <= 40);
  assertScoreBounds(result);
});

test('v10: SaaS developer role matches SaaS development service', () => {
  const profile = { ...baseProfile, headline: '', skillNames: [], serviceNames: ['Разработка SaaS-приложения'] };
  const result = scoreOpportunity(profile, opportunity({
    title: 'Senior SaaS Developer',
    description: 'Build and launch SaaS products for small businesses.',
  }));
  assert.ok(result.explanation.matched_keywords.includes('saasdevelopment'));
  assert.ok(result.explanation.reasons.some((item) => item.includes('разработка SaaS')));
  assertScoreBounds(result);
});

test('v10: web-app service needs development context rather than a generic mention', () => {
  const profile = { ...baseProfile, headline: '', skillNames: [], serviceNames: ['Создание веб-приложения'] };
  const unrelated = scoreOpportunity(profile, opportunity({
    title: 'Cloud Security Engineer',
    description: 'Our SaaS platform includes several web applications for customers.',
  }));
  const relevant = scoreOpportunity(profile, opportunity({
    title: 'Web Application Developer',
    description: 'Build and maintain customer-facing web applications.',
  }));
  assert.equal(unrelated.explanation.matched_keywords.length, 0);
  assert.ok(relevant.explanation.matched_keywords.includes('webappdevelopment'));
  assert.ok(relevant.match_score > unrelated.match_score);
  assertScoreBounds(unrelated);
  assertScoreBounds(relevant);
});

test('v14: SaaS company context alone does not match SaaS development service', () => {
  const profile = { ...baseProfile, headline: '', skillNames: [], serviceNames: ['Разработка SaaS-приложения'] };
  const result = scoreOpportunity(profile, opportunity({
    title: 'Senior Software Engineer',
    description: 'AccuLynx is a fast-growing SaaS provider of business management software. With more than 10 years in the business. What you will do: Develop new features and build out a public RESTful API.',
  }));
  assert.ok(!result.explanation.matched_keywords.includes('saasdevelopment'), `unexpected SaaS service match: ${result.explanation.matched_keywords.join(', ')}`);
  assert.ok(!result.explanation.reasons.some((item) => item.includes('разработка SaaS')));
  assertScoreBounds(result);
});

test('v14: job listing describes relevant service work without claiming it is a client order', () => {
  const profile = { ...baseProfile, headline: '', skillNames: [], serviceNames: ['Интеграция внешнего API'] };
  const result = scoreOpportunity(profile, opportunity({
    type: 'job',
    title: 'Senior Java Developer',
    description: 'You will provide technical support on integration projects. Experience with API integrations is a plus.',
  }));
  assert.ok(result.explanation.reasons.some((item) => item.includes('В описании вакансии есть задачи по направлению услуги')));
  assert.ok(!result.explanation.reasons.some((item) => item.includes('Можно предложить услуги')));
  assert.ok(result.explanation.cautions.some((item) => item.includes('не прямой заказ клиента')));
  assert.ok(result.match_score <= 36);
  assertScoreBounds(result);
});

test('v14: freelance client opportunity can still recommend the service as an offer', () => {
  const profile = { ...baseProfile, headline: '', skillNames: [], serviceNames: ['Интеграция внешнего API'] };
  const result = scoreOpportunity(profile, opportunity({
    type: 'client',
    title: 'Need an API integration developer',
    description: 'Connect an external billing API to our platform.',
  }));
  assert.ok(result.explanation.reasons.some((item) => item.includes('Можно предложить услуги')));
  assert.ok(!result.explanation.cautions.some((item) => item.includes('не прямой заказ клиента')));
  assertScoreBounds(result);
});

test('v14: explicit experience gap lowers fit score but leaves skill match score intact', () => {
  const profile = {
    ...baseProfile,
    headline: '',
    skillNames: ['Node.js'],
    skillDetails: [{ name: 'Node.js', level: 3, yearsExperience: 1, isPrimary: true }],
    serviceNames: [],
  };
  const role = opportunity({
    title: 'Senior Node.js Developer',
    description: 'Required: 5+ years of experience with Node.js in production systems.',
  });
  const inexperienced = scoreOpportunity(profile, role);
  const experienced = scoreOpportunity({
    ...profile,
    skillDetails: [{ name: 'Node.js', level: 4, yearsExperience: 6, isPrimary: true }],
  }, role);
  assert.equal(inexperienced.match_score, experienced.match_score, 'seniority should not rewrite skill-keyword relevance');
  assert.ok(inexperienced.fit_score < experienced.fit_score, `expected experience-aware fit ${inexperienced.fit_score} < ${experienced.fit_score}`);
  assert.ok(inexperienced.explanation.cautions.some((item) => item.includes('от 5 лет') && item.includes('до 1 лет')));
  assertScoreBounds(inexperienced);
  assertScoreBounds(experienced);
});

test('v14: company tenure alone is not parsed as a required experience level', () => {
  const result = scoreOpportunity({
    ...baseProfile,
    headline: '',
    skillNames: ['Node.js'],
    skillDetails: [{ name: 'Node.js', level: 3, yearsExperience: 1, isPrimary: true }],
    serviceNames: [],
  }, opportunity({
    title: 'Node.js Developer',
    description: 'Our company has operated for more than 10 years in the business. Develop Node.js services and improve reliability.',
  }));
  assert.ok(!result.explanation.cautions.some((item) => item.includes('от 10 лет')));
  assertScoreBounds(result);
});

test('v14: French web-application development title matches the web-app service', () => {
  const profile = {
    ...baseProfile,
    headline: '',
    skillNames: ['React', 'Next.js', 'Node.js'],
    serviceNames: ['Создание веб-приложения'],
  };
  const result = scoreOpportunity(profile, opportunity({
    type: 'project',
    title: 'Developpements web application médicale - PREMIUM',
    description: 'Développement d’une application médicale pour professionnels de santé avec React, Next.js et Node.js.',
  }));
  assert.ok(result.explanation.matched_keywords.includes('webappdevelopment'), `missing webapp intent: ${result.explanation.matched_keywords.join(', ')}`);
  assert.ok(result.explanation.matched_keywords.includes('react'));
  assert.ok(result.match_score > 18);
  assertScoreBounds(result);
});

test('v14: French website redesign wording matches website-improvement service', () => {
  const profile = { ...baseProfile, headline: '', skillNames: [], serviceNames: ['Доработка сайта'] };
  const result = scoreOpportunity(profile, opportunity({
    type: 'project',
    title: 'Amélioration visuelle d’un site CMS Grav',
    description: 'Améliorer la présentation et modifier le menu du site.',
  }));
  assert.ok(result.explanation.matched_keywords.includes('websiteimprovement'), `missing improvement intent: ${result.explanation.matched_keywords.join(', ')}`);
  assert.ok(result.match_score > 18);
  assertScoreBounds(result);
});

test('v14: French site-vitrine request matches business website service', () => {
  const profile = { ...baseProfile, headline: '', skillNames: [], serviceNames: ['Создание многостраничного сайта'] };
  const result = scoreOpportunity(profile, opportunity({
    type: 'project',
    title: 'Site internet pour osteopathe',
    description: 'Création d’un site vitrine pour présenter une activité professionnelle.',
  }));
  assert.ok(result.explanation.matched_keywords.includes('businesswebsite'), `missing business website: ${result.explanation.matched_keywords.join(', ')}`);
  assert.ok(result.match_score > 18);
  assertScoreBounds(result);
});

test('v14: French custom CRM web app request matches app and CRM development services', () => {
  const profile = { ...baseProfile, headline: '', skillNames: [], serviceNames: ['Создание веб-приложения', 'Создание CRM / внутренней системы'] };
  const result = scoreOpportunity(profile, opportunity({
    type: 'project',
    title: 'Développement d’une application web CRM sur mesure',
    description: 'Application de gestion sur mesure pour une petite entreprise.',
  }));
  assert.ok(result.explanation.matched_keywords.includes('webappdevelopment'), `missing webapp: ${result.explanation.matched_keywords.join(', ')}`);
  assert.ok(result.explanation.matched_keywords.includes('crmdevelopment'), `missing CRM: ${result.explanation.matched_keywords.join(', ')}`);
  assert.ok(result.match_score > 18);
  assertScoreBounds(result);
});

test('v14: generic French project title can match web-app service only for a project, not an employment listing', () => {
  const profile = { ...baseProfile, headline: '', skillNames: [], serviceNames: ['Создание веб-приложения'] };
  const project = scoreOpportunity(profile, opportunity({
    type: 'project',
    title: 'Application web de gestion de cours particuliers',
    description: 'Gestion des élèves et des professeurs.',
  }));
  const job = scoreOpportunity(profile, opportunity({
    type: 'job',
    title: 'Application Web Support Engineer',
    description: 'Support a company platform with web applications.',
  }));
  assert.ok(project.explanation.matched_keywords.includes('webappdevelopment'));
  assert.ok(!job.explanation.matched_keywords.includes('webappdevelopment'));
  assert.ok(project.match_score > job.match_score);
  assertScoreBounds(project);
  assertScoreBounds(job);
});

test('v14: listings with no relevant profile evidence receive low match and fit scores', () => {
  const profile = {
    ...baseProfile,
    headline: 'Разработка веб-приложений и MVP/SaaS',
    skillNames: ['React', 'Next.js', 'TypeScript'],
    serviceNames: ['Создание веб-приложения', 'Разработка MVP/SaaS'],
  };
  const logo = scoreOpportunity(profile, opportunity({
    type: 'project',
    title: 'Création de logo',
    description: 'Concevoir un logo pour une nouvelle marque.',
  }));
  const bookkeeping = scoreOpportunity(profile, opportunity({
    type: 'project',
    title: 'Rattrapage comptabilité',
    description: 'Besoin d’aide pour la comptabilité.',
  }));
  for (const result of [logo, bookkeeping]) {
    assert.equal(result.explanation.matched_keywords.length, 0);
    assert.ok(result.match_score <= 18, `unmatched Match Score should be <=18, got ${result.match_score}`);
    assert.ok(result.fit_score <= 18, `unmatched Fit Score should be <=18, got ${result.fit_score}`);
    assertScoreBounds(result);
  }
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
  assert.equal(result.algorithm_version, 'v14');
  assertScoreBounds(result);
});


test('v14: freelancer SEEKING WORK posts are not scored as income opportunities', () => {
  const profile = {
    ...baseProfile,
    headline: 'Разработка веб-приложений и MVP/SaaS',
    skillNames: ['React', 'Next.js', 'TypeScript', 'HTML и CSS', 'Node.js', 'REST API'],
    serviceNames: ['Создание веб-приложения', 'Разработка MVP/SaaS'],
  };
  const listing = scoreOpportunity(profile, opportunity({
    type: 'freelance',
    title: 'New comment by developer in Ask HN: Seeking freelancer? (October 2025)',
    description: 'SEEKING WORK | Remote. React, Next.js, TypeScript, HTML, CSS, Node.js. Available for projects.',
    published_at: '2025-10-15T12:00:00.000Z',
    discovered_at: new Date().toISOString(),
  }));
  assert.ok(listing.match_score <= 12, `freelancer self-promotion Match Score should be <=12, got ${listing.match_score}`);
  assert.ok(listing.fit_score <= 12, `freelancer self-promotion Fit Score should be <=12, got ${listing.fit_score}`);
  assert.ok(listing.explanation.cautions.some((text) => /не является возможностью заработать|не является заказом клиента/i.test(text)));
  assert.ok(listing.explanation.cautions.some((text) => /90 дней назад/i.test(text)));
  assert.equal(listing.algorithm_version, 'v14');
  assertScoreBounds(listing);
});



test('v14: HN SEEKING WORK self-promotion experience is not parsed as an employer requirement', () => {
  const profile = {
    ...baseProfile,
    headline: 'Разработка веб-приложений и MVP/SaaS',
    skillNames: ['React', 'Next.js', 'TypeScript', 'Node.js'],
    serviceNames: ['Создание веб-приложения', 'Разработка MVP/SaaS'],
    skillDetails: [{ name: 'React', level: 3, yearsExperience: 1, isPrimary: true }],
  };
  const listing = scoreOpportunity(profile, opportunity({
    type: 'freelance',
    title: 'Full-stack developer available for projects',
    description: 'SEEKING WORK | React, Next.js, TypeScript. I have 8 years of professional experience building web applications.',
    published_at: new Date().toISOString(),
  }));
  assert.ok(!listing.explanation.cautions.some((text) => /В вакансии указан опыт от 8 лет|требованиям к уровню опыта/i.test(text)),
    `self-reported years must not be interpreted as an employer requirement: ${listing.explanation.cautions.join(' | ')}`);
  assert.ok(listing.match_score <= 12, `self-promotion Match Score should stay capped at 12, got ${listing.match_score}`);
  assert.ok(listing.fit_score <= 12, `self-promotion Fit Score should stay capped at 12, got ${listing.fit_score}`);
  assert.equal(listing.algorithm_version, 'v14');
  assertScoreBounds(listing);
});

test('v14: a freelance project request without SEEKING WORK is not mistaken for self-promotion', () => {
  const profile = {
    ...baseProfile,
    skillNames: ['React', 'TypeScript'],
    serviceNames: ['Создание веб-приложения'],
    preferredTypes: ['freelance'],
  };
  const result = scoreOpportunity(profile, opportunity({
    type: 'freelance',
    title: 'Freelance React developer needed for a web app',
    description: 'We need a React and TypeScript developer to build a small web application.',
    published_at: new Date().toISOString(),
  }));
  assert.ok(result.match_score > 12, `legitimate freelance project should not receive self-promotion cap, got ${result.match_score}`);
  assert.ok(result.fit_score > 12, `legitimate freelance project should not receive self-promotion cap, got ${result.fit_score}`);
  assert.ok(!result.explanation.cautions.some((text) => /Фрилансер рекламирует/i.test(text)));
  assertScoreBounds(result);
});

test('v14: stale employment listings have lower Match and Fit scores than identical fresh listings', () => {
  const profile = {
    ...baseProfile,
    preferredTypes: ['job'],
    skillNames: ['TypeScript'],
    serviceNames: [],
    headline: 'TypeScript developer',
  };
  const common = {
    type: 'job',
    title: 'TypeScript Developer',
    description: 'Build software with TypeScript.',
  };
  const fresh = scoreOpportunity(profile, opportunity({
    ...common,
    published_at: new Date().toISOString(),
    discovered_at: new Date().toISOString(),
  }));
  const stale = scoreOpportunity(profile, opportunity({
    ...common,
    published_at: '2025-10-15T12:00:00.000Z',
    discovered_at: new Date().toISOString(),
  }));
  assert.ok(fresh.fit_score > stale.fit_score, `fresh Fit Score ${fresh.fit_score} should exceed stale Fit Score ${stale.fit_score}`);
  assert.ok(stale.fit_score <= 25, `stale Fit Score should be <=25, got ${stale.fit_score}`);
  assert.ok(stale.match_score <= 25, `stale Match Score should be <=25, got ${stale.match_score}`);
  assert.ok(stale.explanation.cautions.some((text) => /более 90 дней назад/i.test(text)));
  assertScoreBounds(fresh);
  assertScoreBounds(stale);
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
