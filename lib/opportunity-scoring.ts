export type ScoringSkillDetail = {
  name: string;
  level?: number | null;
  yearsExperience?: number | null;
  isPrimary?: boolean | null;
};

export type ScoringProfile = {
  headline?: string | null;
  skillNames?: string[] | null;
  skillDetails?: ScoringSkillDetail[] | null;
  serviceNames?: string[] | null;
  targetMonthlyIncome?: number | null;
  /** ISO 4217 currency for targetMonthlyIncome, e.g. RUB, EUR or USD. */
  currencyCode?: string | null;
  preferredTypes?: string[] | null;
  preferredCompetition?: string[] | null;
  remoteOnly?: boolean | null;
};

export type BudgetPeriod = 'monthly' | 'annual' | 'hourly' | 'project' | 'unknown';

export type ScoringOpportunity = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  type: string;
  remote?: boolean | null;
  budget_min?: number | null;
  budget_max?: number | null;
  currency_code?: string | null;
  /** Value copied from raw_metadata.budget_confidence by the caller. */
  budget_confidence?: 'medium' | 'low' | 'none' | string | null;
  /** Value copied from raw_metadata.budget_extraction by the caller. */
  budget_extraction?: 'not_found' | 'heuristic' | string | null;
  /** Value copied from raw_metadata.currency_evidence by the caller. */
  currency_evidence?: 'explicit' | 'defaulted_rub' | string | null;
  /** Optional normalized billing period. If absent, text inference is used. */
  budget_period?: BudgetPeriod | string | null;
  competition?: string | null;
  published_at?: string | null;
  discovered_at?: string | null;
};

export type MoneyScoreStatus =
  | 'comparable'
  | 'missing_budget'
  | 'heuristic_budget'
  | 'low_confidence'
  | 'currency_unknown'
  | 'currency_mismatch'
  | 'period_unknown'
  | 'target_missing';

export type OpportunityScore = {
  algorithm_version: 'v14';
  match_score: number;
  money_score: number;
  competition_score: number;
  fit_score: number;
  risk_score: number;
  explanation: {
    matched_keywords: string[];
    reasons: string[];
    cautions: string[];
    money_score_status: MoneyScoreStatus;
  };
};

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'your', 'you', 'are', 'this', 'that',
  'have', 'has', 'our', 'their', 'will', 'into', 'about', 'more', 'than',
  'для', 'или', 'это', 'как', 'что', 'при', 'над', 'под', 'без', 'его',
  'её', 'они', 'она', 'оно', 'мы', 'вы', 'вам', 'нас', 'вас', 'также',
  'который', 'которая', 'которые', 'быть', 'есть', 'надо', 'можно',
]);

const SHORT_TECH_TERMS = new Set([
  'ai', 'ml', 'c#', 'c++', 'f#', 'dotnet', 'ui', 'ux', 'qa',
]);

// Common Russian profile/job-ad words are not skills by themselves. Service-specific
// phrases are normalized to canonical English concepts before these generic terms
// are filtered, so removing boilerplate does not remove known service matches.
const RUSSIAN_GENERIC_TERMS = new Set([
  'разработка', 'разработки', 'разработать', 'разработчик', 'разработчики',
  'создание', 'создания', 'создать', 'сайт', 'сайта', 'сайты', 'сайтов',
  'веб', 'приложение', 'приложения', 'приложений', 'проект', 'проекта',
  'проекты', 'проектов', 'работа', 'работы', 'работать', 'работаем',
  'команда', 'команды', 'команде', 'опыт', 'опыта', 'обязанности',
  'требования', 'задача', 'задачи', 'клиент', 'клиенты', 'решение',
  'решения', 'система', 'системы', 'платформа', 'платформы', 'продукт',
  'продукты', 'услуга', 'услуги', 'услуг', 'сервис', 'сервисы',
  'компания', 'компании', 'технология', 'технологии', 'технологий',
  'навык', 'навыки', 'умение', 'умения', 'область', 'области',
  'необходимо', 'нужно', 'различные', 'различных', 'современный',
  'современные', 'выполнение', 'обеспечение', 'включая', 'помощь',
]);

// Broad job-ad vocabulary is deliberately excluded from relevance matching.
// It can occur in nearly every listing and should not be mistaken for a skill match.
const GENERIC_MATCH_TERMS = new Set([
  'software', 'developer', 'developers', 'development', 'engineer', 'engineering',
  'project', 'projects', 'manager', 'management', 'senior', 'junior', 'lead',
  'principal', 'staff', 'team', 'teams', 'work', 'working', 'job', 'jobs',
  'role', 'roles', 'position', 'positions', 'career', 'careers', 'experience',
  'experienced', 'responsibility', 'responsibilities', 'requirement', 'requirements',
  'company', 'companies', 'business', 'businesses', 'opportunity', 'opportunities',
  'remote', 'remotely', 'full', 'time', 'build', 'building', 'maintain', 'support',
  'supports', 'application', 'applications', 'product', 'products', 'technology',
  'web', 'website', 'websites', 'site', 'sites', 'page', 'pages', 'app', 'apps',
  'create', 'creates', 'created', 'creating', 'creation',
  'technologies', 'professional', 'professionals', 'looking', 'seeking', 'candidate',
  'candidates', 'positioning', 'successful', 'strong', 'excellent', 'ability',
  'abilities', 'including', 'ensure', 'ensuring', 'multiple', 'various', 'across',
  // Frequent French project / job-ad boilerplate; normalize service phrases first.
  'developpement', 'développement', 'developpements', 'développements',
  'developpeur', 'développeur', 'developpeuse', 'développeuse',
  'creation', 'création', 'creer', 'créer', 'creez', 'créez',
  'site', 'sites', 'internet', 'application', 'applications',
  'projet', 'projets', 'travail', 'travaux', 'equipe', 'équipe', 'équipes',
  'experience', 'expérience', 'competences', 'compétences', 'besoin', 'besoins',
  'entreprise', 'entreprises', 'societe', 'société', 'poste', 'offre', 'offres',
  'visuelle', 'visuel', 'sur', 'mesure', 'aide', 'recherche', 'creation',
]);

const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(n)));

function normalizeTechnologyNames(value: string): string {
  return value
    .toLocaleLowerCase('ru')
    .normalize('NFKC')
    // French Codeur project titles are normalized to the same canonical concepts
    // used by Russian/English profile services.
    .replace(/\bapplications?\s+(?:web|internet)\b|\bweb[\s-]+applications?\b|\bweb[\s-]+apps?\b|\bapps?\s+(?:web|internet)\b/gu, 'webapp')
    .replace(/\b(?:site|sites)\s+(?:internet|web|vitrine)\b|\b(?:site|sites)\s+web\b/gu, 'businesswebsite')
    .replace(/\b(?:site|sites)\s+vitrine\b/gu, 'businesswebsite')
    .replace(/\b(?:maintenance|entretien)\b[^.!?;]{0,75}\b(?:site|sites|wordpress|cms|businesswebsite)\b|\b(?:site|sites|wordpress|cms|businesswebsite)\b[^.!?;]{0,75}\b(?:maintenance|entretien)\b/giu, 'websitemaintenance')
    .replace(/\b(?:refonte|am[ée]lioration|modification|modifier|changement|changer|[ée]volution|r[ée]novation)\b[^.!?;]{0,85}\b(?:site|sites|wordpress|cms|grav|businesswebsite|webapp|landingpage)\b|\b(?:site|sites|wordpress|cms|grav|businesswebsite|webapp|landingpage)\b[^.!?;]{0,85}\b(?:refonte|am[ée]lioration|modification|modifier|changement|changer|[ée]volution|r[ée]novation)\b/giu, 'websiteimprovement')
    // Russian/English service synonyms become stable concepts before tokenization.
    // Examples: «создание лендинга» == «landing page»; «адаптивная вёрстка» == «responsive layout».
    .replace(/\blanding[\s-]*pages?\b/g, 'landingpage')
    .replace(/(?:создани[ея]\s+)?лендинг\p{L}*/gu, 'landingpage')
    .replace(/\b(?:business|corporate)\s+websites?\b|\bmulti[\s-]*page\s+websites?\b/g, 'businesswebsite')
    .replace(/многостраничн\p{L}*\s+сайт\p{L}*/gu, 'businesswebsite')
    .replace(/\b(?:website|web)\s+(?:improvements?|enhancements?|modifications?|updates?|redesign)\b/g, 'websiteimprovement')
    .replace(/(?:доработк\p{L}*|улучшени\p{L}*|редизайн)\s+(?:веб[- ]?)?сайт\p{L}*/gu, 'websiteimprovement')
    .replace(/\bresponsive(?:\s+web)?\s+(?:design|layout)\b|\bmobile[\s-]*first\s+(?:design|layout)\b/g, 'responsivelayout')
    .replace(/адаптивн\p{L}*\s+(?:в[её]рстк\p{L}*|дизайн\p{L}*)/gu, 'responsivelayout')
    .replace(/\bfigma\s+prototype\b|\bprototype\s+(?:in\s+)?figma\b/g, 'figmaprototype')
    .replace(/прототип\p{L}*.{0,24}figma|figma.{0,24}прототип\p{L}*/gu, 'figmaprototype')
    .replace(/\b(?:ai|workflow)\s+automation\b|\bautomation\s+workflow\b/g, 'aiautomation')
    .replace(/(?:ai|искусственн\p{L}* интеллект\p{L}*)[\s-]*автоматизац\p{L}*|настройк\p{L}*.{0,24}ai.{0,16}автоматизац\p{L}*/gu, 'aiautomation')
    .replace(/\bseo[\s-]+audit\b|\btechnical\s+seo\b/g, 'seoaudit')
    .replace(/seo[\s-]*аудит\p{L}*.{0,12}(?:сайт\p{L}*)?/gu, 'seoaudit')
    .replace(/\b(?:website\s+copywriting|web\s+content\s+writing|copywriter?s?)\b/g, 'webcopywriting')
    .replace(/написани\p{L}*\s+(?:текст\p{L}*\s+)?(?:текст\p{L}*\s+)?(?:для\s+)?(?:веб[- ]?)?сайт\p{L}*|копирайтинг\p{L}*/gu, 'webcopywriting')
    .replace(/\b(?:website\s+maintenance|website\s+support|website\s+management)\b/g, 'websitemaintenance')
    .replace(/(?:поддержк\p{L}*|обслуживани\p{L}*)\s+(?:веб[- ]?)?сайт\p{L}*/gu, 'websitemaintenance')
    .replace(/\b(?:short\s+video\s+editing|reels\s+(?:video\s+)?editing|shorts\s+(?:video\s+)?editing|reels\s+(?:video\s+)?editor|shorts\s+(?:video\s+)?editor)\b/g, 'shortvideoediting')
    .replace(/монтаж.{0,28}\b(?:reels|shorts)\b/gu, 'shortvideoediting')
    .replace(/\bminimum\s+viable\s+product\b/g, 'mvp')
    .replace(/\bapplications?\s+(?:web|internet)\b|\bweb[\s-]+applications?\b|\bweb[\s-]+apps?\b|веб[- ]*приложени\p{L}*/gu, 'webapp')
    .replace(/\bweb[\s-]+development\b|\bweb[\s-]+developers?\b|веб[- ]*разработ\p{L}*/gu, 'webdevelopment')
    .replace(/\bfull[\s-]*stack\b/g, 'fullstack')
    .replace(/\breact(?:\.js|js)\b/g, 'react')
    .replace(/\bvue(?:\.js|js)\b/g, 'vue')
    .replace(/\bnode(?:\.|\s*)js\b/g, 'nodejs')
    .replace(/\bnext(?:\.|\s*)js\b/g, 'nextjs')
    .replace(/\bexpress(?:\.|\s*)js\b/g, 'express')
    .replace(/\bjava\s*script\b|\bjs\b/g, 'javascript')
    .replace(/\btype\s*script\b|\bts\b/g, 'typescript')
    .replace(/\bpostgres\b|\bpostgresql\b/g, 'postgresql')
    .replace(/\bmongo(?:\s*db)?\b/g, 'mongodb')
    .replace(/\bk8s\b|\bkubernetes\b/g, 'kubernetes')
    .replace(/\bamazon web services\b/g, 'aws')
    .replace(/\bgoogle cloud platform\b/g, 'gcp')
    .replace(/\bartificial intelligence\b/g, 'ai')
    .replace(/\bmachine learning\b/g, 'ml')
    .replace(/\buser interface\b/g, 'ui')
    .replace(/\buser experience\b/g, 'ux')
    .replace(/\bdot\s*net\b|\.net\b/g, 'dotnet')
    .replace(/\bc\s*sharp\b|\bc-sharp\b/g, 'c#')
    .replace(/\bc\s*plus\s*plus\b|\bc\+\+/g, 'c++')
    .replace(/\bgo\s+(?:programming(?:\s+language)?|language|developer|engineer)\b/g, 'golang')
    .replace(/\b(experience with|experience in|knowledge of|proficient in|using|with)\s+go\b/g, '$1 golang')
    .replace(/\br\s+(?:programming(?:\s+language)?|language)\b/g, 'rlang')
    .replace(/\b(experience with|experience in|knowledge of|proficient in|using|with)\s+r\b/g, '$1 rlang')
    .replace(/\bc\s+(?:programming(?:\s+language)?|language)\b/g, 'clang')
    .replace(/\b(experience with|experience in|knowledge of|proficient in|using|with)\s+c\b/g, '$1 clang');
}

function normalizeExplicitSkill(value: string): string {
  const normalized = value.trim().toLocaleLowerCase('ru');
  if (normalized === 'go' || normalized === 'golang') return 'golang';
  if (normalized === 'r') return 'rlang';
  if (normalized === 'c') return 'clang';
  return value;
}

function keywords(value: string): string[] {
  const normalized = normalizeTechnologyNames(value).replace(/[^\p{L}\p{N}+#.\s-]/gu, ' ');
  return [...new Set(
    normalized
      .split(/[\s-]+/)
      .map((part) => part.trim().replace(/^\.+|\.+$/g, ''))
      .filter((part) => (part.length >= 3 || SHORT_TECH_TERMS.has(part)) && part.length > 0)
      .filter((part) => !STOP_WORDS.has(part))
      .filter((part) => !GENERIC_MATCH_TERMS.has(part))
      .filter((part) => !RUSSIAN_GENERIC_TERMS.has(part)),
  )];
}

// Role nouns alone ("SaaS provider", "Software Engineer") are not proof of
// development intent. Use actual build/develop/create verbs for descriptions;
// role-specific service intent is handled only for the title.
const SERVICE_BUILD_CUES = /\b(?:development|develop(?:s|ed|ing)?|build(?:s|ing|t)?|creat(?:e|es|ed|ing|ion)|implement(?:s|ed|ing|ation)?|launch(?:es|ed|ing)?|ship(?:s|ped|ping)?|développ\p{L}*|developp\p{L}*|cré\p{L}*|cre\p{L}*|réalis\p{L}*|realis\p{L}*|concev\p{L}*|conception)\b|(?:mise[\s-]+en[\s-]+place)|разработ\p{L}*|созда\p{L}*|внедр\p{L}*|реализ\p{L}*/iu;
const API_INTEGRATION_CUES = /\b(?:integrat\w*|connect\w*|sync\w*|third[ -]party|external|intégr\w*|integr\w*|connect\w*|synchronis\w*)\b|интеграц\p{L}*|подключ\p{L}*|внешн\p{L}*/iu;

function hasNearbySignal(text: string, anchor: RegExp, signal: RegExp, distance = 58): boolean {
  const normalized = normalizeTechnologyNames(text).replace(/[\r\n]+/g, ' ');
  const pattern = new RegExp(
    `(?:${anchor.source}).{0,${distance}}(?:${signal.source})|(?:${signal.source}).{0,${distance}}(?:${anchor.source})`,
    'iu',
  );
  // Do not let a service/company label in one sentence borrow a verb from another.
  // This avoids matching "SaaS provider. ... We build ..." as SaaS development.
  return normalized
    .split(/[.!?;]+/u)
    .some((clause) => pattern.test(clause));
}

/**
 * Service concepts require contextual evidence. Descriptions must contain an
 * explicit build/integration signal in the same sentence. A small allowlist of
 * title-specific role phrases is handled separately by allowTitleRoleIntent.
 */
function serviceIntentTerms(
  text: string,
  allowTitleRoleIntent = false,
  allowProjectTitleIntent = false,
): string[] {
  const value = normalizeTechnologyNames(text);
  const terms: string[] = [];

  if (hasNearbySignal(value, /\bapi\b/, API_INTEGRATION_CUES, 64)) terms.push('apiintegration');
  if (hasNearbySignal(value, /\bsaas\b/, SERVICE_BUILD_CUES, 48)) terms.push('saasdevelopment');
  if (hasNearbySignal(value, /\bwebapp\b/, SERVICE_BUILD_CUES, 48)) terms.push('webappdevelopment');
  if (hasNearbySignal(value, /\bmvp\b/, SERVICE_BUILD_CUES, 48)) terms.push('mvpdevelopment');
  if (hasNearbySignal(value, /\bcrm\b/, SERVICE_BUILD_CUES, 48)) terms.push('crmdevelopment');

  const telegramBot = /\btelegram\b.{0,42}\b(?:bot|mini[ -]?app)\b|\b(?:bot|mini[ -]?app)\b.{0,42}\btelegram\b/i.test(value);
  if (telegramBot && SERVICE_BUILD_CUES.test(value)) terms.push('telegrambotdevelopment');

  const aiMention = /\b(?:ai|llm|artificial intelligence)\b|искусственн\p{L}* интеллект\p{L}*/iu.test(value);
  const aiIntegration = /\b(?:integrat\w*|feature\w*|automat\w*|workflow\w*)\b|интеграц\p{L}*|функци\p{L}*|автоматизац\p{L}*/iu.test(value);
  if (aiMention && aiIntegration && SERVICE_BUILD_CUES.test(value)) terms.push('aifeatureintegration');

  if (allowTitleRoleIntent) {
    // These phrase-level title patterns represent the service as the role itself,
    // without treating a generic "Software Engineer" at a SaaS company as SaaS work.
    if (/\bsaas\s+(?:product\s+)?developer\b|\bdeveloper\s+(?:for|of)\s+saas\b/iu.test(value)) terms.push('saasdevelopment');
    if (/\bwebapp\s+(?:developer|engineer)\b|\b(?:developer|engineer)\s+(?:for|of)\s+webapp\b/iu.test(value)) terms.push('webappdevelopment');
    if (/\bmvp\s+(?:developer|engineer)\b|\b(?:developer|engineer)\s+(?:for|of)\s+mvp\b/iu.test(value)) terms.push('mvpdevelopment');
    if (/\bcrm\s+(?:developer|engineer)\b|\b(?:developer|engineer)\s+(?:for|of)\s+crm\b/iu.test(value)) terms.push('crmdevelopment');
  }

  // A project title on a freelance marketplace describes the requested deliverable,
  // unlike an employment role where a bare product noun can be only company context.
  if (allowProjectTitleIntent) {
    if (/\bwebapp\b/u.test(value)) terms.push('webappdevelopment');
    if (/\bbusinesswebsite\b/u.test(value)) terms.push('businesswebsite');
    if (/\bwebsiteimprovement\b/u.test(value)) terms.push('websiteimprovement');
    if (/\bwebsitemaintenance\b/u.test(value)) terms.push('websitemaintenance');
    if (/\bsaas\b/u.test(value) && /\b(?:développ|developp|cré|cre|build|develop|create|mvp|application)\w*/iu.test(value)) terms.push('saasdevelopment');
    if (/\bmvp\b/u.test(value) && SERVICE_BUILD_CUES.test(value)) terms.push('mvpdevelopment');
    if (/\bcrm\b/u.test(value) && (/\bwebapp\b/u.test(value) || SERVICE_BUILD_CUES.test(value))) terms.push('crmdevelopment');
  }

  return [...new Set(terms)];
}

function profileHeadlineKeywords(value: string): string[] {
  const base = keywords(value).filter((term) => !['saas', 'webapp', 'mvp'].includes(term));
  return [...new Set([...base, ...serviceIntentTerms(value)])];
}

function profileServiceKeywords(values: string[]): string[] {
  const result: string[] = [];
  for (const serviceName of values) {
    const normalized = normalizeTechnologyNames(serviceName);
    const hasSpecificService = /\b(?:saas|webapp|mvp|api|crm|telegram|ai|llm)\b/i.test(normalized);
    const specificTerms = serviceIntentTerms(serviceName);
    result.push(...specificTerms);

    if (hasSpecificService) {
      // Do not let broad fragments such as "saas", "webapp" or "api" alone
      // stand in for a service intent. Other distinct concepts may still match.
      result.push(...keywords(serviceName).filter((term) =>
        !['saas', 'webapp', 'mvp', 'api', 'crm', 'telegram', 'ai', 'llm'].includes(term),
      ));
    } else {
      result.push(...keywords(serviceName));
    }
  }
  return [...new Set(result)];
}

function opportunityKeywords(
  value: string | null | undefined,
  context: 'title' | 'description' = 'description',
  isProject = false,
): string[] {
  if (!value) return [];
  return [...new Set([
    ...keywords(value),
    ...serviceIntentTerms(value, context === 'title', isProject && context === 'title'),
  ])];
}

function displayServiceTerm(term: string): string {
  const labels: Record<string, string> = {
    apiintegration: 'интеграция внешнего API',
    saasdevelopment: 'разработка SaaS',
    webappdevelopment: 'разработка веб-приложений',
    mvpdevelopment: 'разработка MVP',
    crmdevelopment: 'CRM и внутренние системы',
    telegrambotdevelopment: 'Telegram-боты и Mini App',
    aifeatureintegration: 'интеграция AI-функций',
    landingpage: 'создание лендинга',
    businesswebsite: 'создание многостраничного сайта',
    websiteimprovement: 'доработка сайта',
    responsivelayout: 'адаптивная вёрстка',
    figmaprototype: 'прототип в Figma',
    seoaudit: 'SEO-аудит сайта',
    websitemaintenance: 'поддержка сайта',
    shortvideoediting: 'монтаж Reels и Shorts',
  };
  return labels[term] || term;
}

function inferBudgetPeriod(text: string): BudgetPeriod {
  const value = text.toLocaleLowerCase('en-US').replace(/\u00a0/g, ' ');
  if (/\b(per month|monthly|a month|each month)\b|\/month\b|\/mo\b/.test(value)) return 'monthly';
  if (/\b(per year|yearly|annually|annual salary|per annum|a year|each year)\b|\/year\b|\/yr\b/.test(value)) return 'annual';
  if (/\b(per hour|hourly|an hour|each hour)\b|\/hour\b|\/hr\b/.test(value)) return 'hourly';
  if (/\b(per project|project-based|fixed-price|one-off|one-time payment)\b|за проект/i.test(value)) return 'project';
  return 'unknown';
}

function normalizedCurrency(value: string | null | undefined): string | null {
  const currency = value?.trim().toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function evaluateMoneyScore(
  profile: ScoringProfile,
  opportunity: ScoringOpportunity,
): { score: number; status: MoneyScoreStatus } {
  // Prefer the lower bound when a range is available instead of the most optimistic amount.
  const budget = opportunity.budget_min ?? opportunity.budget_max ?? null;
  const target = Number(profile.targetMonthlyIncome || 0);
  const profileCurrency = normalizedCurrency(profile.currencyCode);
  const offerCurrency = normalizedCurrency(opportunity.currency_code);
  const extraction = opportunity.budget_extraction?.toLowerCase();
  const confidence = opportunity.budget_confidence?.toLowerCase();
  const currencyEvidence = opportunity.currency_evidence?.toLowerCase();
  const period = opportunity.budget_period || inferBudgetPeriod(
    `${opportunity.title} ${opportunity.description || ''}`,
  );

  if (budget == null) return { score: 50, status: 'missing_budget' };
  // Automatically extracted RSS amounts are not verified financial facts.
  if (extraction === 'heuristic') return { score: 50, status: 'heuristic_budget' };
  if (confidence !== 'medium') return { score: 50, status: 'low_confidence' };
  if (!profileCurrency || !offerCurrency || currencyEvidence !== 'explicit') {
    return { score: 50, status: 'currency_unknown' };
  }
  if (profileCurrency !== offerCurrency) return { score: 50, status: 'currency_mismatch' };
  if (period !== 'monthly' && period !== 'annual') return { score: 50, status: 'period_unknown' };
  if (!Number.isFinite(target) || target <= 0) return { score: 50, status: 'target_missing' };

  const monthlyBudget = period === 'annual' ? budget / 12 : budget;
  const budgetScore = clamp((monthlyBudget / target) * 65, 10, 100);
  return {
    score: clamp(budgetScore * 0.75 + 75 * 0.25),
    status: 'comparable',
  };
}

type ExperienceFit = {
  penalty: number;
  caution: string | null;
};

function extractRequiredYears(text: string): number | null {
  const normalized = text.replace(/[\r\n]+/g, ' ');
  const patterns = [
    /\b(?:at least|minimum(?: of)?|more than|over)\s*(\d{1,2})\s+years?\b[^.!?;]{0,120}\bexperience\b/giu,
    /\b(\d{1,2})\s*[-–]\s*\d{1,2}\s+years?\b[^.!?;]{0,120}\bexperience\b/giu,
    /\b(\d{1,2})\s*\+?\s*years?\b[^.!?;]{0,120}\bexperience\b/giu,
  ];
  const values: number[] = [];
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const years = Number(match[1]);
      if (Number.isFinite(years) && years >= 1 && years <= 40) values.push(years);
    }
  }
  return values.length ? Math.max(...values) : null;
}

function assessExperienceFit(
  profile: ScoringProfile,
  opportunity: ScoringOpportunity,
  matchedSkills: string[],
  titleMatched: string[],
  skillTerms: string[],
): ExperienceFit {
  // A freelancer's self-promotion describes their own experience, not the
  // experience an employer requires. Never apply the job-requirement parser
  // to Hacker News SEEKING WORK posts.
  if (
    opportunity.type === 'freelance' &&
    /\bSEEKING\s+WORK\b/i.test(`${opportunity.title} ${opportunity.description || ''}`)
  ) {
    return { penalty: 0, caution: null };
  }

  const titleMatchedSkillTerms = titleMatched.filter((term) => skillTerms.includes(term));
  const relevantSkillTerms = titleMatchedSkillTerms.length ? titleMatchedSkillTerms : matchedSkills;
  const details = (profile.skillDetails || []).filter((detail) => {
    if (!detail?.name) return false;
    const detailTerms = keywords(normalizeExplicitSkill(detail.name));
    return detailTerms.some((term) => relevantSkillTerms.includes(term) && skillTerms.includes(term));
  });

  const detailYears = details.filter((detail) =>
    detail.yearsExperience != null && Number.isFinite(Number(detail.yearsExperience)) && Number(detail.yearsExperience) >= 0,
  );
  const primaryDetails = detailYears.filter((detail) => detail.isPrimary === true);
  const chosenDetails = primaryDetails.length ? primaryDetails : detailYears;
  const profileYears = chosenDetails.length
    ? Math.max(...chosenDetails.map((detail) => Number(detail.yearsExperience)))
    : null;

  const detailLevels = details.filter((detail) =>
    detail.level != null && Number.isFinite(Number(detail.level)) && Number(detail.level) >= 1 && Number(detail.level) <= 5,
  );
  const primaryLevels = detailLevels.filter((detail) => detail.isPrimary === true);
  const levelBasis = primaryLevels.length ? primaryLevels : detailLevels;
  const profileLevel = levelBasis.length
    ? Math.max(...levelBasis.map((detail) => Number(detail.level)))
    : null;

  const requiredYears = extractRequiredYears(`${opportunity.title}. ${opportunity.description || ''}`);
  const titleSignalsSenior = /\b(?:senior|staff|principal|lead|architect)\b/i.test(opportunity.title);

  // Only score seniority when this listing actually matches a skill with declared
  // experience. Service-only matches do not invent technical experience data.
  if (!details.length) return { penalty: 0, caution: null };

  let penalty = 0;
  let caution: string | null = null;
  if (requiredYears != null && profileYears != null) {
    const gap = requiredYears - profileYears;
    if (gap > 0) {
      penalty += Math.min(14, gap * 2);
      caution = `В вакансии указан опыт от ${requiredYears} лет; в профиле по совпавшим навыкам указано до ${profileYears} лет. Проверь требования к уровню опыта.`;
    }
  } else if (requiredYears == null && titleSignalsSenior && profileYears != null && profileYears < 3) {
    penalty += 4;
    caution = `В названии указан уровень senior/lead, а в профиле по совпавшим навыкам указано ${profileYears} лет опыта. Проверь, соответствует ли вакансия твоему уровню.`;
  }

  if ((requiredYears != null || titleSignalsSenior) && profileLevel != null && profileLevel <= 2) {
    penalty += 2;
    if (!caution) caution = 'Для этой вакансии заявлен высокий уровень требований; проверь соответствие указанного уровня навыков.';
  }

  // Do not penalize a listing merely because the title has a seniority label when
  // the profile has no known relevant experience values.
  return { penalty: Math.min(16, penalty), caution };
}

export function scoreOpportunity(
  profile: ScoringProfile,
  opportunity: ScoringOpportunity,
): OpportunityScore {
  const headlineTerms = profileHeadlineKeywords(profile.headline || '');
  const skillTerms = keywords((profile.skillNames || []).map(normalizeExplicitSkill).join(' '));
  const serviceTerms = profileServiceKeywords((profile.serviceNames || []).map(normalizeExplicitSkill));
  const profileTerms = [...new Set([...headlineTerms, ...skillTerms, ...serviceTerms])];

  // Location of a term in the job ad matters: appearing in the title is a
  // stronger signal than an incidental mention deep in the description.
  const isProject = opportunity.type === 'project';
  const titleTerms = new Set(opportunityKeywords(opportunity.title, 'title', isProject));
  const descriptionTerms = new Set(opportunityKeywords(opportunity.description || '', 'description', isProject));
  const categoryTerms = new Set(keywords(opportunity.category || ''));
  const evidenceWeight = (term: string): number => {
    if (titleTerms.has(term)) return 1;
    if (descriptionTerms.has(term)) return 0.35;
    if (categoryTerms.has(term)) return 0.15;
    return 0;
  };

  const matched = profileTerms.filter((term) => evidenceWeight(term) > 0);
  const titleMatched = profileTerms.filter((term) => titleTerms.has(term));
  const descriptionOnlyMatched = profileTerms.filter(
    (term) => !titleTerms.has(term) && descriptionTerms.has(term),
  );
  const categoryOnlyMatched = profileTerms.filter(
    (term) => !titleTerms.has(term) && !descriptionTerms.has(term) && categoryTerms.has(term),
  );
  const matchedHeadline = headlineTerms.filter((term) => evidenceWeight(term) > 0);
  const matchedSkills = skillTerms.filter((term) => evidenceWeight(term) > 0);
  const matchedServices = serviceTerms.filter((term) => evidenceWeight(term) > 0);
  const experienceFit = assessExperienceFit(profile, opportunity, matchedSkills, titleMatched, skillTerms);

  // Score freshness separately from skill relevance. The old version only let
  // freshness influence Match Score a little, so year-old posts could still
  // display an attractive Fit Score.
  const publishedMs = opportunity.published_at ? Date.parse(opportunity.published_at) : Number.NaN;
  const discoveredMs = opportunity.discovered_at ? Date.parse(opportunity.discovered_at) : Number.NaN;
  const referenceMs = Number.isFinite(publishedMs)
    ? publishedMs
    : Number.isFinite(discoveredMs)
      ? discoveredMs
      : null;
  const ageMs = referenceMs == null ? null : Math.max(0, Date.now() - referenceMs);
  const ageDays = ageMs == null ? null : ageMs / 86400000;
  const freshness = ageMs == null
    ? 55
    : ageMs < 3 * 86400000
      ? 100
      : ageMs < 14 * 86400000
        ? 75
        : ageMs < 45 * 86400000
          ? 50
          : 25;
  const freshnessFitPenalty = ageDays == null ? 0 : ageDays >= 90 ? 24 : ageDays >= 45 ? 12 : ageDays >= 14 ? 5 : 0;
  const isFreelancerSelfPromotion = opportunity.type === 'freelance' && /\bSEEKING\s+WORK\b/i.test(`${opportunity.title} ${opportunity.description || ''}`);

  const weightedCoverage = (terms: string[]): number => {
    if (!terms.length) return 0;
    const denominator = Math.min(terms.length, 6);
    const totalEvidence = terms.reduce((total, term) => total + evidenceWeight(term), 0);
    return Math.min(100, (totalEvidence / denominator) * 100);
  };

  // Explicit skills and services carry more signal than a free-text headline.
  // Each section is matched with location-aware evidence, then populated
  // sections are reweighted to avoid penalizing an empty optional section.
  const coverageParts: Array<{ score: number; weight: number }> = [];
  if (skillTerms.length) coverageParts.push({ score: weightedCoverage(skillTerms), weight: 0.55 });
  if (serviceTerms.length) coverageParts.push({ score: weightedCoverage(serviceTerms), weight: 0.30 });
  if (headlineTerms.length) coverageParts.push({ score: weightedCoverage(headlineTerms), weight: 0.15 });
  const totalCoverageWeight = coverageParts.reduce((total, part) => total + part.weight, 0);
  const keywordFit = totalCoverageWeight
    ? coverageParts.reduce((total, part) => total + part.score * part.weight, 0) / totalCoverageWeight
    : 35;

  const skillEvidence = matchedSkills.reduce((total, term) => total + evidenceWeight(term), 0);
  const serviceEvidence = matchedServices.reduce((total, term) => total + evidenceWeight(term), 0);
  const competencyBonus = Math.min(20, skillEvidence * 8 + serviceEvidence * 10);
  const typeFit = profile.preferredTypes?.length
    ? (profile.preferredTypes.includes(opportunity.type) ? 100 : 25)
    : 65;
  const remoteFit = profile.remoteOnly && opportunity.remote === false ? 0 : 100;
  // Keep type and remote preferences in the base fit, but calibrate the final
  // fit score by the strength of skill evidence. A direct title match should
  // outrank description-only mentions, and explicit skills with no evidence
  // should not receive the same fit score as a relevant listing.
  const baseFit = keywordFit * 0.45 + typeFit * 0.3 + remoteFit * 0.15 + competencyBonus;
  const fitEvidenceAdjustment = titleMatched.length > 0
    ? Math.min(15, titleMatched.length * 8)
    : descriptionOnlyMatched.length > 0
      ? -6
      : categoryOnlyMatched.length > 0
        ? -10
        : profileTerms.length > 0
          ? -14
          : -6;
  const calculatedFit = clamp(baseFit + fitEvidenceAdjustment - experienceFit.penalty - freshnessFitPenalty);
  // An unrelated listing must not receive a middling Fit Score just because the
  // user prefers this opportunity type and remote work. No evidence means low fit.
  let fit = matched.length === 0 ? Math.min(calculatedFit, 18) : calculatedFit;
  if (ageDays != null && ageDays >= 90) fit = Math.min(fit, 25);
  else if (ageDays != null && ageDays >= 45) fit = Math.min(fit, 45);
  // HN SEEKING WORK posts represent another freelancer advertising availability,
  // not a customer order or an employment opening for the current user.
  if (isFreelancerSelfPromotion) fit = Math.min(fit, 12);

  const { score: money, status: moneyStatus } = evaluateMoneyScore(profile, opportunity);
  const competition = opportunity.competition || 'unknown';
  const competitionScore = competition === 'low' ? 90 : competition === 'medium' ? 65 : competition === 'high' ? 30 : 50;
  const preferredCompetition = profile.preferredCompetition;
  const competitionPreference = preferredCompetition?.length
    ? (preferredCompetition.includes(competition) ? 100 : 45)
    : 65;
  const risk = clamp(
    (100 - competitionScore) * 0.45 +
    (opportunity.budget_min == null && opportunity.budget_max == null ? 70 : 25) * 0.35 +
    (freshness < 50 ? 70 : 25) * 0.2,
  );
  // Preserve the v7 Match Score baseline: its aggregate continues to use the
  // unadjusted fit components, while fit_score itself now reflects evidence quality.
  const rawMatch = clamp(baseFit * 0.7 + competitionPreference * 0.15 + freshness * 0.15);

  // v7 separates strong title evidence from incidental mentions in job descriptions; v8 also calibrates fit_score by evidence strength.
  // A skill explicitly named in the title adds a bounded bonus; description-only
  // matches receive a penalty and a lower cap; category-only matches are weaker still.
  // Listings with no profile evidence receive a deliberately low score floor/cap.
  const titleSignalBonus = Math.min(18, titleMatched.length * 8);
  const descriptionOnlyPenalty = titleMatched.length === 0 && descriptionOnlyMatched.length > 0 ? 6 : 0;
  const categoryOnlyPenalty = titleMatched.length === 0 && descriptionOnlyMatched.length === 0 && categoryOnlyMatched.length > 0 ? 10 : 0;
  const evidenceAdjustedMatch = clamp(
    rawMatch + titleSignalBonus - descriptionOnlyPenalty - categoryOnlyPenalty,
  );

  let match = profileTerms.length === 0
    ? Math.min(rawMatch, 18)
    : matched.length === 0
      ? Math.min(rawMatch, 18)
      : titleMatched.length > 0
        ? evidenceAdjustedMatch
        : descriptionOnlyMatched.length > 0
          ? Math.min(evidenceAdjustedMatch, 36)
          : categoryOnlyMatched.length > 0
            ? Math.min(evidenceAdjustedMatch, 30)
            : Math.min(rawMatch, 35);
  if (ageDays != null && ageDays >= 90) match = Math.min(match, 25);
  else if (ageDays != null && ageDays >= 45) match = Math.min(match, 45);
  if (isFreelancerSelfPromotion) match = Math.min(match, 12);

  const reasons: string[] = [];
  if (titleMatched.length) {
    reasons.push(`Навыки/технологии указаны в названии: ${titleMatched.slice(0, 5).join(', ')}`);
  }
  if (descriptionOnlyMatched.length) {
    reasons.push(`Упоминания навыков найдены только в описании: ${descriptionOnlyMatched.slice(0, 5).join(', ')}`);
  }
  if (categoryOnlyMatched.length) {
    reasons.push(`Совпадения есть только в категории предложения: ${categoryOnlyMatched.slice(0, 5).join(', ')}`);
  }
  if (matchedSkills.length) reasons.push(`Подходят навыки из профиля: ${matchedSkills.slice(0, 5).join(', ')}`);
  const servicesInTitle = matchedServices.filter((term) => titleTerms.has(term));
  const servicesInDescriptionOnly = matchedServices.filter((term) => !titleTerms.has(term) && descriptionTerms.has(term));
  if (isFreelancerSelfPromotion) {
    reasons.push('Автор публикации сам ищет работу и предлагает свои услуги; это не заказ клиента.');
  } else if (matchedServices.length && opportunity.type === 'job') {
    if (servicesInTitle.length) {
      reasons.push(`Название вакансии связано с направлением услуги: ${servicesInTitle.slice(0, 5).map(displayServiceTerm).join(', ')}`);
    }
    if (servicesInDescriptionOnly.length) {
      reasons.push(`В описании вакансии есть задачи по направлению услуги: ${servicesInDescriptionOnly.slice(0, 5).map(displayServiceTerm).join(', ')}`);
    }
  } else if (matchedServices.length) {
    reasons.push(`Можно предложить услуги: ${matchedServices.slice(0, 5).map(displayServiceTerm).join(', ')}`);
  }
  if (profile.preferredTypes?.includes(opportunity.type)) reasons.push('Тип предложения соответствует предпочтениям');
  if (opportunity.remote) reasons.push('Можно работать удалённо');
  if (moneyStatus === 'comparable') {
    reasons.push(`Бюджет сопоставлен с месячной целью дохода ${Number(profile.targetMonthlyIncome).toLocaleString('ru-RU')} ${normalizedCurrency(profile.currencyCode)}.`);
  }
  if (!reasons.length) reasons.push('Оценка предварительная: в профиле пока мало данных для точного сопоставления.');

  const cautions: string[] = [];
  if (moneyStatus === 'missing_budget') cautions.push('Бюджет не указан; финансовая оценка недоступна.');
  else if (moneyStatus === 'heuristic_budget') cautions.push('Бюджет извлечён автоматически из текста и не подтверждён; финансовая оценка недоступна.');
  else if (moneyStatus === 'low_confidence') cautions.push('Достоверность бюджета недостаточна для финансового сравнения.');
  else if (moneyStatus === 'currency_unknown') cautions.push('Валюта бюджета или цели дохода не подтверждена.');
  else if (moneyStatus === 'currency_mismatch') cautions.push('Валюта бюджета отличается от валюты цели дохода.');
  else if (moneyStatus === 'period_unknown') cautions.push('Не удалось надёжно определить период оплаты (месяц или год).');
  else if (moneyStatus === 'target_missing') cautions.push('В профиле не задан целевой месячный доход.');
  if (profileTerms.length === 0) {
    cautions.push('В профиле недостаточно конкретных навыков или услуг для надёжного сопоставления.');
  } else if (matched.length === 0) {
    cautions.push('Не найдено значимых совпадений по конкретным навыкам или услугам; Match Score ограничен.');
  } else if (titleMatched.length === 0 && descriptionOnlyMatched.length > 0) {
    cautions.push('Совпадения найдены только в описании; проверь, указаны ли эти навыки среди требований.');
  } else if (titleMatched.length === 0 && categoryOnlyMatched.length > 0) {
    cautions.push('Совпадения найдены только в категории; проверь требования вакансии вручную.');
  }
  if (opportunity.type === 'job' && servicesInDescriptionOnly.length) {
    cautions.push('Это вакансия для трудоустройства, а не прямой заказ клиента; услуга упоминается только в описании роли.');
  }
  if (isFreelancerSelfPromotion) {
    cautions.push('Фрилансер рекламирует собственные услуги. Такая публикация не является возможностью заработать по этому объявлению.');
  }
  if (experienceFit.caution) cautions.push(experienceFit.caution);
  if (competition === 'high') cautions.push('Высокая конкуренция.');
  if (profile.remoteOnly && opportunity.remote === false) cautions.push('Предложение не соответствует настройке удалённой работы.');
  if (freshness < 50) {
    cautions.push(ageDays != null && ageDays >= 90
      ? 'Объявление опубликовано более 90 дней назад; вероятность актуальности низкая.'
      : 'Объявление опубликовано более 45 дней назад; проверь, актуально ли оно.');
  }

  return {
    algorithm_version: 'v14',
    match_score: match,
    money_score: money,
    competition_score: competitionScore,
    fit_score: fit,
    risk_score: risk,
    explanation: {
      matched_keywords: matched.slice(0, 10),
      reasons,
      cautions,
      money_score_status: moneyStatus,
    },
  };
}
