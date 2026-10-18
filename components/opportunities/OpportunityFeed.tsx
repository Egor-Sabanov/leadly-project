'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  History,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type MoneyScoreStatus =
  | 'comparable'
  | 'missing_budget'
  | 'heuristic_budget'
  | 'low_confidence'
  | 'currency_unknown'
  | 'currency_mismatch'
  | 'period_unknown'
  | 'target_missing';

type OpportunityItem = {
  id: string;
  title: string;
  company_name: string | null;
  description: string | null;
  source_url: string;
  category: string | null;
  location: string | null;
  remote: boolean;
  budget_min: number | null;
  budget_max: number | null;
  currency_code: string;
  competition: string;
  published_at: string | null;
  discovered_at: string;
  type: string;
  status: string;
  is_saved: boolean;
  match_score: number | null;
  fit_score: number | null;
  matched_keywords: string[];
  score_reasons: string[];
  score_cautions: string[];
  money_score: number | null;
  money_score_status?: MoneyScoreStatus;
  competition_score: number | null;
};

const typeLabels: Record<string, string> = {
  freelance: 'Фриланс',
  project: 'Проект',
  client: 'Клиент',
  job: 'Вакансия',
  other: 'Не классифицировано',
};

const competitionLabels: Record<string, string> = {
  low: 'Низкая',
  medium: 'Средняя',
  high: 'Высокая',
  unknown: 'Неизвестна',
};

const statusLabels: Record<string, string> = {
  new: 'Новая',
  saved: 'Сохранена',
  applied: 'Откликнулся',
  replied: 'Получен ответ',
  negotiating: 'Переговоры',
  won: 'Успех',
  lost: 'Не подошла',
  archived: 'В архиве',
};

const statusOptions = [
  'new',
  'saved',
  'applied',
  'replied',
  'negotiating',
  'won',
  'lost',
  'archived',
];

const moneyStatusLabels: Record<MoneyScoreStatus, string> = {
  comparable: 'Оценка рассчитана',
  missing_budget: 'Нет бюджета',
  heuristic_budget: 'Бюджет не подтверждён',
  low_confidence: 'Низкая достоверность',
  currency_unknown: 'Валюта неизвестна',
  currency_mismatch: 'Другая валюта',
  period_unknown: 'Период неизвестен',
  target_missing: 'Не задана цель дохода',
};

const moneyStatusDetails: Record<MoneyScoreStatus, string> = {
  comparable: 'Бюджет сопоставлен с целевым доходом по валюте и периоду оплаты.',
  missing_budget: 'В источнике не указан бюджет, поэтому финансовую привлекательность оценить нельзя.',
  heuristic_budget: 'Сумма извлечена автоматически из текста объявления и ещё не подтверждена. Период оплаты неизвестен, поэтому сравнивать её с целевым месячным доходом пока нельзя.',
  low_confidence: 'Достоверность извлечённой суммы недостаточна для финансового сравнения.',
  currency_unknown: 'Не удалось подтвердить валюту предложения или целевого дохода.',
  currency_mismatch: 'Валюта предложения отличается от валюты целевого дохода.',
  period_unknown: 'Не удалось надёжно определить, указана месячная, годовая, почасовая или проектная оплата.',
  target_missing: 'В профиле не задан целевой месячный доход.',
};

const money = (value: number, currency: string) =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)} ${currency === 'RUB' ? '₽' : currency}`;

// RSS bodies may contain actual HTML or HTML escaped as &lt;...&gt;.
// Render only readable text even for records already stored before ingestion was fixed.
function plainText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, raw: string) => {
      const codePoint = raw[0].toLowerCase() === 'x'
        ? Number.parseInt(raw.slice(1), 16)
        : Number(raw);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? String.fromCodePoint(codePoint)
        : ' ';
    })
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const scoreTermLabels: Record<string, string> = {
  webappdevelopment: 'разработка веб-приложений',
  saasdevelopment: 'разработка SaaS',
  mvpdevelopment: 'разработка MVP',
  websiteimprovement: 'улучшение существующего сайта',
  businesswebsite: 'сайт компании',
  websitemaintenance: 'поддержка сайта',
  landingpage: 'лендинг',
  apiintegration: 'интеграция API',
  aifeatureintegration: 'интеграция AI-функций',
  telegrambotdevelopment: 'разработка Telegram-бота и Mini App',
  nextjs: 'Next.js',
  nodejs: 'Node.js',
  typescript: 'TypeScript',
  postgresql: 'PostgreSQL',
  github: 'GitHub',
  html: 'HTML',
  css: 'CSS',
  react: 'React',
  rest: 'REST API',
};

function isFreelancerSelfPromotion(item: Pick<OpportunityItem, 'type' | 'title' | 'description'>): boolean {
  return item.type === 'freelance' && /\bSEEKING\s+WORK\b/i.test(`${item.title} ${plainText(item.description)}`);
}

function readableScoreText(value: string): string {
  return Object.entries(scoreTermLabels).reduce((text, [key, label]) =>
    text.replace(new RegExp(`\\b${key}\\b`, 'gi'), label), value);
}

export function OpportunityFeed({ opportunities }: { opportunities: OpportunityItem[] }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [sortMode, setSortMode] = useState<'relevance' | 'match' | 'newest'>('relevance');
  const [savedOnly, setSavedOnly] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [saved, setSaved] = useState(
    () => new Set(opportunities.filter((item) => item.is_saved).map((item) => item.id)),
  );
  const [statuses, setStatuses] = useState(
    () => new Map(opportunities.map((item) => [item.id, item.status || 'new'])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  // Capture the current time after mount so render stays pure (React ESLint rule).
  const [currentTimeMs, setCurrentTimeMs] = useState<number | null>(null);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setCurrentTimeMs(Date.now());
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const selectedTypeLabel = type === 'all' ? 'Заказы и вакансии' : typeLabels[type] || type;

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru');
    const items = opportunities.filter((item) => {
      const matchesSearch =
        !query ||
        [item.title, item.company_name, plainText(item.description), item.category, item.location].some(
          (part) => part?.toLocaleLowerCase('ru').includes(query),
        );
      // HN SEEKING WORK posts advertise the author, not a customer order.
      const matchesType = type === 'all'
        ? item.type !== 'freelance' && item.type !== 'other'
        : item.type === type;
      return matchesSearch && matchesType && (!savedOnly || saved.has(item.id));
    });

    const publishedTime = (item: OpportunityItem) => {
      const value = item.published_at || item.discovered_at;
      return value ? Date.parse(value) || 0 : 0;
    };

    // A new array is created by filter(), so sorting here does not mutate props.
    items.sort((a, b) => {
      const dateDelta = publishedTime(b) - publishedTime(a);
      if (sortMode === 'newest') return dateDelta;

      if (sortMode === 'match') {
        const matchDelta = (b.match_score ?? -1) - (a.match_score ?? -1);
        if (matchDelta !== 0) return matchDelta;
        const fitDelta = (b.fit_score ?? -1) - (a.fit_score ?? -1);
        return fitDelta || dateDelta;
      }

      // Default: prioritize evidence of actual profile fit, then the overall match score.
      const fitDelta = (b.fit_score ?? -1) - (a.fit_score ?? -1);
      if (fitDelta !== 0) return fitDelta;
      const matchDelta = (b.match_score ?? -1) - (a.match_score ?? -1);
      return matchDelta || dateDelta;
    });

    return items;
  }, [opportunities, search, type, savedOnly, saved, sortMode]);

  async function updateStatus(item: OpportunityItem, nextStatus: string) {
    const previousStatus = statuses.get(item.id) || 'new';
    if (previousStatus === nextStatus) return;

    setMessage('');
    setBusy(item.id);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Сессия истекла. Войди в аккаунт заново.');
      }

      const { error: updateError } = await supabase.from('user_opportunities').upsert(
        {
          user_id: user.id,
          opportunity_id: item.id,
          status: nextStatus,
          is_saved: saved.has(item.id),
        },
        { onConflict: 'user_id,opportunity_id' },
      );
      if (updateError) throw updateError;

      const { error: historyError } = await supabase.from('opportunity_status_history').insert({
        user_id: user.id,
        opportunity_id: item.id,
        from_status: previousStatus,
        to_status: nextStatus,
        note: 'Статус изменён пользователем в ленте возможностей',
      });

      setStatuses((current) => new Map(current).set(item.id, nextStatus));
      if (historyError) {
        setMessage(`Статус сохранён, но историю не удалось записать: ${historyError.message}`);
      } else {
        setMessage(`Статус обновлён: ${statusLabels[nextStatus] || nextStatus}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось изменить статус.');
    } finally {
      setBusy(null);
    }
  }

  async function toggleSaved(item: OpportunityItem) {
    setMessage('');
    setBusy(item.id);
    const nextSaved = !saved.has(item.id);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Сессия истекла. Войди в аккаунт заново.');
      }

      const { error } = await supabase.from('user_opportunities').upsert(
        {
          user_id: user.id,
          opportunity_id: item.id,
          is_saved: nextSaved,
          status: statuses.get(item.id) || 'new',
        },
        { onConflict: 'user_id,opportunity_id' },
      );
      if (error) throw error;

      setSaved((current) => {
        const next = new Set(current);
        if (nextSaved) next.add(item.id);
        else next.delete(item.id);
        return next;
      });
      setMessage(nextSaved ? 'Возможность сохранена.' : 'Убрано из сохранённого.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось изменить сохранение.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="opportunity-filters panel">
        <label className="opportunity-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по названию, компании или описанию"
            aria-label="Поиск возможностей"
          />
        </label>
        <div className={`opportunity-type-filter custom-type-filter ${typeMenuOpen ? 'is-open' : ''}`}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          <button
            className="type-filter-trigger"
            type="button"
            aria-label="Тип возможности"
            aria-haspopup="listbox"
            aria-expanded={typeMenuOpen}
            onClick={() => setTypeMenuOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setTypeMenuOpen(false);
            }}
          >
            <span>{selectedTypeLabel}</span>
            <ChevronDown size={16} className="type-filter-chevron" aria-hidden="true" />
          </button>
          {typeMenuOpen && (
            <>
              <button
                className="type-filter-dismiss"
                type="button"
                aria-label="Закрыть список типов"
                onClick={() => setTypeMenuOpen(false)}
                tabIndex={-1}
              />
              <div className="type-filter-menu" role="listbox" aria-label="Тип возможности">
                {[
                  ['all', 'Заказы и вакансии'],
                  ['freelance', 'Фриланс'],
                  ['project', 'Проекты'],
                  ['client', 'Клиенты'],
                  ['job', 'Вакансии'],
                  ['other', 'Не классифицировано'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="option"
                    aria-selected={type === value}
                    className={`type-filter-option ${type === value ? 'active' : ''}`}
                    onClick={() => {
                      setType(value);
                      setTypeMenuOpen(false);
                    }}
                  >
                    <span>{label}</span>
                    {type === value && <Check size={15} aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <label
          className="opportunity-type-filter"
          style={{ flex: '0 1 230px' }}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span className="sr-only">Сортировка возможностей</span>
          <select
            aria-label="Сортировка возможностей"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as 'relevance' | 'match' | 'newest')}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 40,
              border: 0,
              outline: 0,
              background: 'transparent',
              color: 'var(--text)',
              font: 'inherit',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <option value="relevance">По релевантности</option>
            <option value="match">По Match Score</option>
            <option value="newest">Сначала новые</option>
          </select>
        </label>
        <button
          className={`secondary ${savedOnly ? 'selected' : ''}`}
          type="button"
          aria-pressed={savedOnly}
          onClick={() => setSavedOnly((value) => !value)}
        >
          <Bookmark size={15} /> Сохранённые
        </button>
      </div>

      {type === 'all' && (
        <p className="client" role="note" style={{ margin: '0 0 14px', color: '#9aa9c5', lineHeight: 1.5 }}>
          Основная лента показывает заказы, клиентские проекты и вакансии. Публикации, где фрилансер сам предлагает услуги, и записи без ясного типа доступны отдельно в фильтре.
        </p>
      )}

      {message && <p className="auth-message" role="status">{message}</p>}

      {filtered.length === 0 ? (
        <div className="panel opportunity-empty">
          <div className="empty-icon"><Search size={22} /></div>
          <h2>{opportunities.length === 0 ? 'Пока нет реальных предложений' : 'Ничего не найдено'}</h2>
          <p>
            {opportunities.length === 0
              ? 'Таблица opportunities пока пуста. Следующий этап — подключить источники и загрузку предложений в Supabase.'
              : 'Измени запрос или фильтры. Сохранённые предложения появятся здесь после добавления.'}
          </p>
        </div>
      ) : (
        <div className="opportunities-feed-list">
          {filtered.map((item) => {
            const moneyStatus = item.money_score_status || 'missing_budget';
            const moneyComparable = moneyStatus === 'comparable';
            const moneyStatusLabel = moneyStatusLabels[moneyStatus] || 'Нет данных';
            const moneyStatusDetail = moneyStatusDetails[moneyStatus] || 'Финансовую оценку нельзя подтвердить.';
            const evidenceReason = item.score_reasons.find((reason) =>
              /^(Навыки\/технологии указаны в названии:|Упоминания навыков найдены только в описании:|Совпадения есть только в категории предложения:)/i.test(reason),
            );
            const relevanceCaution = item.score_cautions.find((caution) =>
              /Совпадения найдены только в описании|Совпадения найдены только в категории|Не найдено значимых совпадений|недостаточно конкретных навыков или услуг/i.test(caution),
            );
            const descriptionText = plainText(item.description);
            const publishedAtMs = item.published_at ? Date.parse(item.published_at) : Date.parse(item.discovered_at);
            const ageDays =
              currentTimeMs !== null && Number.isFinite(publishedAtMs)
                ? Math.max(0, (currentTimeMs - publishedAtMs) / 86400000)
                : null;
            const oldListing = ageDays != null && ageDays >= 45;

            return (
              <article className="opportunity opportunity-feed-card" key={item.id}>
                <div className="opp-top">
                  <span className="source"><span className="source-dot" /> {item.company_name || 'Источник предложения'}</span>
                  <span className="tag">{typeLabels[item.type] || item.type}</span>
                </div>
                <h3>{item.title}</h3>
                {descriptionText && <p className="opportunity-description">{descriptionText}</p>}
                <div className="opportunity-meta">
                  <span>{item.remote ? 'Удалённо' : item.location || 'Локация не указана'}</span>
                  <span>Конкуренция: {competitionLabels[item.competition] || 'Неизвестна'}</span>
                  <span>
                    {item.published_at
                      ? `Опубликовано: ${new Date(item.published_at).toLocaleDateString('ru-RU')}`
                      : `Добавлено: ${new Date(item.discovered_at).toLocaleDateString('ru-RU')}`}
                  </span>
                </div>
                {oldListing && (
                  <p role="note" className="client" style={{ margin: '6px 0 0', color: '#e7b567', lineHeight: 1.5 }}>
                    Объявление опубликовано {Math.floor(ageDays!)} дней назад. Проверь, что оно ещё актуально, прежде чем тратить время на отклик.
                  </p>
                )}
                {isFreelancerSelfPromotion(item) && (
                  <p role="note" className="client" style={{ margin: '6px 0 0', color: '#e7b567', lineHeight: 1.5 }}>
                    Автор сам ищет работу и рекламирует свои услуги. Это не заказ клиента; публикация исключена из основной ленты.
                  </p>
                )}
                <div className="budget">
                  {item.budget_min != null || item.budget_max != null ? (
                    <>
                      {moneyStatus === 'heuristic_budget' && (
                        <div className="budget-caption">{item.type === 'job' ? 'Диапазон оплаты из вакансии · не подтверждён' : isFreelancerSelfPromotion(item) ? 'Сумма из публикации · не подтверждена' : 'Бюджет проекта из объявления · не подтверждён'}</div>
                      )}
                      <strong>
                        {item.budget_min != null &&
                        item.budget_max != null &&
                        Number(item.budget_min) === Number(item.budget_max)
                          ? money(Number(item.budget_min), item.currency_code)
                          : `${item.budget_min != null ? money(Number(item.budget_min), item.currency_code) : 'Открытый бюджет'} — ${item.budget_max != null ? money(Number(item.budget_max), item.currency_code) : 'По договорённости'}`}
                      </strong>
                    </>
                  ) : (
                    (item.type === 'job' ? 'Оплата не указана' : isFreelancerSelfPromotion(item) ? 'Сумма не указана' : 'Бюджет не указан')
                  )}
                </div>
                <div className="scores">
                  <div className="score">
                    <span>Match Score</span>
                    <strong>{item.match_score == null ? 'Не рассчитан' : `${item.match_score}/100`}</strong>
                  </div>
                  <div className="score">
                    <span>Fit Score</span>
                    <strong>{item.fit_score == null ? 'Не рассчитан' : `${item.fit_score}/100`}</strong>
                  </div>
                  <div className="score">
                    <span>Money Score</span>
                    <strong title={moneyStatusDetail} aria-label={`Money Score: ${moneyStatusLabel}`}>
                      {moneyComparable && item.money_score != null
                        ? `${item.money_score}/100`
                        : moneyStatusLabel}
                    </strong>
                  </div>
                  <div className="score">
                    <span>Текущий статус</span>
                    <strong>{statusLabels[statuses.get(item.id) || item.status] || item.status}</strong>
                  </div>
                </div>
                <p
                  className="client"
                  style={{ margin: '10px 0 0', color: '#9aa9c5', lineHeight: 1.6, overflowWrap: 'anywhere' }}
                >
                  {item.matched_keywords.length > 0
                    ? `Совпавшие навыки: ${item.matched_keywords.map(readableScoreText).join(', ')}`
                    : 'Совпадения по конкретным навыкам из профиля не найдены.'}
                </p>
                {evidenceReason && (
                  <p
                    className="client"
                    style={{ margin: '5px 0 0', color: '#9aa9c5', lineHeight: 1.6 }}
                  >
                    {readableScoreText(evidenceReason)}
                  </p>
                )}
                {relevanceCaution && (
                  <p
                    role="note"
                    className="client"
                    style={{ margin: '5px 0 0', color: '#e7b567', lineHeight: 1.6 }}
                  >
                    {relevanceCaution}
                  </p>
                )}
                {!moneyComparable && (
                  <p className="money-score-note" role="note" title={moneyStatusDetail}>
                    {moneyStatusDetail}
                  </p>
                )}
                <div className="opp-actions">
                  <label className="opportunity-status-control">
                    <History size={15} aria-hidden="true" />
                    <span className="sr-only">Изменить статус</span>
                    <select
                      aria-label={`Статус возможности: ${item.title}`}
                      value={statuses.get(item.id) || item.status || 'new'}
                      onChange={(event) => void updateStatus(item, event.target.value)}
                      disabled={busy === item.id}
                    >
                      {statusOptions.map((value) => (
                        <option key={value} value={value}>{statusLabels[value]}</option>
                      ))}
                    </select>
                  </label>
                  <div className="opp-footer">
                    <button
                      className={`secondary ${saved.has(item.id) ? 'selected' : ''}`}
                      type="button"
                      onClick={() => void toggleSaved(item)}
                      disabled={busy === item.id}
                    >
                      {busy === item.id
                        ? <LoaderCircle size={15} className="spin" />
                        : <Bookmark size={15} fill={saved.has(item.id) ? 'currentColor' : 'none'} />}
                      {saved.has(item.id) ? 'Сохранено' : 'Сохранить'}
                    </button>
                    <a className="primary opportunity-external" href={item.source_url} target="_blank" rel="noreferrer">
                      Открыть источник <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
