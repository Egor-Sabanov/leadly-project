import { Radio, Rss, Send, ArrowUpRight, ShieldCheck } from "lucide-react";
import { getAccount } from "@/lib/workspace";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryError } from "@/components/layout/QueryError";
export const dynamic = "force-dynamic";
export default async function SourcesPage() {
  const account = await getAccount();
  const feeds = !!process.env.LEADLY_RSS_FEEDS?.trim();
  const fh = !!process.env.FREELANCEHUNT_API_TOKEN;
  const telegram = !!(
    process.env.TELEGRAM_WEBHOOK_SECRET &&
    process.env.TELEGRAM_ALLOWED_CHAT_IDS &&
    process.env.TELEGRAM_OPPORTUNITY_TYPE
  );
  const database = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sources = account
    ? await account.supabase
        .from("opportunity_sources")
        .select("id,name,source_type,is_active,updated_at")
        .order("name")
    : null;
  const cards = [
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
      text: "Официальный API проектов. Нормализация бюджета, проверка срока и идемпотентный импорт. Для подключения нужен токен владельца источника.",
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
          description="У каждой возможности должен быть оригинал. Подключаем разрешённые API и ленты."
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
