import { notFound } from "next/navigation";
import { Radio, Rss, Send, ArrowUpRight, ShieldCheck } from "lucide-react";
import { getAccount } from "@/lib/workspace";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryError } from "@/components/layout/QueryError";
import {
  marketplaceDirectory,
  telegramDirectory,
} from "@/lib/source-directory";
import { disciplines } from "@/lib/disciplines";
import { approvedTelegramRules } from "@/lib/telegram-source-discovery";
export const dynamic = "force-dynamic";
export default async function SourcesPage() {
  const account = await getAccount();
  // Operations belong to deployment owners; a server key is not user authorization.
  const operators = (process.env.LEADLY_OPERATOR_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!account || !operators.includes(account.user.id)) notFound();
  const feeds = !!process.env.LEADLY_RSS_FEEDS?.trim();
  const fh = !!process.env.FREELANCEHUNT_API_TOKEN;
  let channelCount = 0;
  let channelConfigError = false;
  try {
    channelCount = (await approvedTelegramRules(account.supabase,
      process.env.TELEGRAM_CHANNEL_RULES,
      process.env.TELEGRAM_ALLOWED_CHAT_IDS,
      process.env.TELEGRAM_OPPORTUNITY_TYPE,
    )).length;
  } catch {
    channelConfigError = true;
  }
  const telegram = !!process.env.TELEGRAM_WEBHOOK_SECRET && channelCount > 0;
  const database = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sources = account
    ? await account.supabase
        .from("opportunity_sources")
        .select("id,name,source_type,is_active,updated_at")
        .order("name")
    : null;
  const cards = [
    {
      name: "hh.ru",
      icon: Radio,
      configured: process.env.LEADLY_HH_ENABLED === "true" && database,
      text: "Официальный API: digital-вакансии России с проверкой русского языка. По отдельному запросу на каждое из 12 направлений, до 60 записей за синхронизацию; иностранные и неопределённые тексты не попадают в ленту.",
      href: "https://api.hh.ru/openapi/redoc",
    },
    {
      name: "RSS / Atom",
      icon: Rss,
      configured: feeds && database,
      text: "Официальные публичные ленты, которые разрешают агрегирование. Защита адресов, редиректов, размера ответа и повторного импорта.",
      href: "https://www.rssboard.org/rss-specification",
    },
    {
      name: "Freelancehunt",
      icon: Radio,
      configured: fh && database,
      text: "Официальный API проектов с фильтром русского языка. Нормализация бюджета, проверка срока и идемпотентный импорт. Для подключения нужен токен владельца источника.",
      href: "https://apidocs.freelancehunt.com/",
    },
    {
      name: "Telegram",
      icon: Send,
      configured: telegram && database,
      text: "Webhook принимает публикации только из явно разрешённых публичных каналов, к которым боту предоставлен доступ. Чтения произвольных каналов нет.",
      href: "https://core.telegram.org/bots/api",
    },
  ];
  return (
    <main className="app-shell">
      <Sidebar activeHref="/sources" />
      <section className="content">
        <PageHeader
          eyebrow="ПРОЗРАЧНОЕ ПРОИСХОЖДЕНИЕ"
          title="Источники"
          description="Только русскоязычные задания. Официальные API, RSS и разрешённые Telegram-каналы."
        />
        <div className="source-grid">
          {cards.map(({ name, icon: Icon, configured, text, href }) => (
            <section className="panel source-card" key={name}>
              <div className="source-top">
                <Icon size={24} />
                <span className="badge">
                  {configured ? "КОНФИГУРАЦИЯ ЗАДАНА" : "НЕ ПОДКЛЮЧЁН"}
                </span>
              </div>
              <h2>{name}</h2>
              <p>{text}</p>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link"
              >
                Документация источника <ArrowUpRight size={13} />
              </a>
            </section>
          ))}
          <section className="panel source-card">
            <ShieldCheck size={24} />
            <h2>Качество важнее количества</h2>
            <p>
              Ссылки на оригиналы, отделение вакансий от клиентских заказов и
              саморекламы, отметки свежести и неподтверждённых бюджетов.
              Проверяй условия до отклика.
            </p>
            <span className="badge">БЕЗ НЕРАЗРЕШЁННОГО СКРЕЙПИНГА</span>
          </section>
        </div>
        <section className="panel source-directory" style={{ marginTop: 22 }}>
          <h2>Поиск под твою профессию</h2>
          <p className="muted">
            Один профиль и один кабинет для разных digital-направлений. В ленте
            можно выбрать направление; совпадения оцениваются по твоим реальным
            навыкам.
          </p>
          <div className="direction-tags">
            {disciplines.map((d) => (
              <span key={d.id} className="badge">
                {d.label}
              </span>
            ))}
          </div>
        </section>
        <section className="panel source-directory" style={{ marginTop: 22 }}>
          <h2>Фриланс-биржи</h2>
          <p className="muted">
            Каталог для расширения поиска. Ссылки ведут на сами площадки;
            автоматический сбор с перечисленных бирж пока не подключён. Для
            импорта нужен подтверждённый официальный API или разрешённый RSS.
          </p>
          <div className="source-grid">
            {marketplaceDirectory.map((s) => (
              <article className="source-card" key={s.name}>
                <span className="badge">АВТОСБОР НЕ ПОДКЛЮЧЁН</span>
                <h3>{s.name}</h3>
                <p>{s.description}</p>
                <a
                  className="text-link"
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Открыть биржу <ArrowUpRight size={14} />
                </a>
              </article>
            ))}
          </div>
        </section>
        <section className="panel source-directory" style={{ marginTop: 22 }}>
          <h2>Telegram: кандидаты для подключения</h2>
          <p className="muted">
            Подобраны каналы для первого просмотра. Перед подключением нужен доступ бота к каналу. Публичная ссылка сама по себе не включает импорт публикаций.
          </p>
          <div className="source-grid">
            {telegramDirectory.map((s) => (
              <article className="source-card" key={s.username}>
                <span className="badge">КАНДИДАТ · НЕ ПРОВЕРЕН</span>
                <h3>{s.name}</h3>
                <p>{s.description}</p>
                <a
                  className="text-link"
                  href={`https://t.me/${s.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @{s.username} <ArrowUpRight size={14} />
                </a>
              </article>
            ))}
          </div>
          <p className="profile-muted">
            Бот принимает только новые публикации из разрешённых публичных
            каналов после предоставления доступа владельцем. Историю и
            произвольные чужие каналы Bot API не загружает. Для каждого
            подключённого канала задаётся тип: заказ, вакансия или клиент.
          </p>
          <p className="profile-muted">
            {channelConfigError
              ? "Проверь настройки разрешённых каналов."
              : `Разрешённых каналов в конфигурации: ${channelCount}.`}{" "}
            Это не подтверждает установленный webhook или успешный импорт.
          </p>
        </section>
        <section className="panel" style={{ marginTop: 22 }}>
          <h2>Источники в базе</h2>
          {sources?.error ? (
            <QueryError message={sources.error.message} />
          ) : sources?.data?.length ? (
            sources.data.map((s) => (
              <div className="check-status" key={s.id}>
                <span>
                  {s.name}
                  <small style={{ display: "block" }}>
                    {s.source_type} · обновлён{" "}
                    {new Date(s.updated_at).toLocaleString("ru-RU")}
                  </small>
                </span>
                <span className="badge">
                  {s.is_active ? "АКТИВЕН В БАЗЕ" : "ВЫКЛЮЧЕН"}
                </span>
              </div>
            ))
          ) : (
            <p className="muted">
              Пока нет данных о подключённых источниках. После настройки и
              первого импорта они появятся здесь.
            </p>
          )}
          <p className="profile-muted" style={{ marginTop: 18 }}>
            Наличие конфигурации не подтверждает доступ к API или успешный
            импорт. Время обновления источника не означает время последней
            успешной загрузки каждой записи.
          </p>
        </section>
      </section>
    </main>
  );
}
