import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isRecord, readLimitedJson } from "../request-guards";
import { isRussianOpportunity } from "../opportunity-language";
const HH_API = "https://api.hh.ru/vacancies";
export function normalizeHhVacancy(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !/^\d+$/.test(value.id) ||
    typeof value.name !== "string" ||
    value.archived === true
  )
    return null;
  const snippet = isRecord(value.snippet) ? value.snippet : {};
  const clean = (v: unknown) =>
    typeof v === "string"
      ? v
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "";
  const title = clean(value.name).slice(0, 300);
  const description = [
    clean(snippet.requirement),
    clean(snippet.responsibility),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);
  if (!isRussianOpportunity({ title, description })) return null;
  const employer = isRecord(value.employer) ? value.employer : {};
  const area = isRecord(value.area) ? value.area : {};
  const salary = isRecord(value.salary_range)
    ? value.salary_range
    : isRecord(value.salary)
      ? value.salary
      : {};
  const numeric = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100_000_000
      ? v
      : null;
  const rawCurrency =
    typeof salary.currency === "string" ? salary.currency.toUpperCase() : "";
  const currency =
    rawCurrency === "RUR"
      ? "RUB"
      : /^[A-Z]{3}$/.test(rawCurrency)
        ? rawCurrency
        : null;
  const from = currency ? numeric(salary.from) : null;
  const to = currency ? numeric(salary.to) : null;
  if (from !== null && to !== null && from > to) return null;
  const format = Array.isArray(value.work_format) ? value.work_format : [];
  const schedule = isRecord(value.schedule) ? value.schedule : {};
  const remote =
    format.some((f) => isRecord(f) && f.id === "REMOTE") ||
    schedule.id === "remote";
  const date =
    typeof value.published_at === "string"
      ? new Date(value.published_at)
      : null;
  const mode = isRecord(salary.mode) ? salary.mode : {};
  const period =
    mode.id === "MONTH"
      ? "monthly"
      : mode.id === "YEAR"
        ? "annual"
        : mode.id === "HOUR"
          ? "hourly"
          : "unknown";
  return {
    title,
    description,
    url: `https://hh.ru/vacancy/${value.id}`,
    externalId: value.id,
    company: clean(employer.name) || null,
    location: clean(area.name) || null,
    remote,
    budgetMin: from,
    budgetMax: to,
    currency: currency || "RUB",
    currencyConfirmed: !!currency,
    budgetPeriod: period,
    gross: typeof salary.gross === "boolean" ? salary.gross : null,
    publishedAt:
      date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
  };
}
export async function importHhVacancies(
  db: SupabaseClient<any, "public", "public", any, any>,
  query: string,
  token?: string,
) {
  const url = new URL(HH_API);
  url.searchParams.set("locale", "RU");
  url.searchParams.set("area", "113");
  url.searchParams.set("per_page", "20");
  url.searchParams.set("order_by", "publication_time");
  url.searchParams.set("text", query.slice(0, 500));
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "LEADLY/0.1 (https://github.com/Egor-Sabanov/leadly-project)",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(12000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      `HH API: HTTP ${response.status}. Проверь сетевой доступ и разрешения приложения.`,
    );
  const payload = await readLimitedJson(response, 2_000_000);
  if (!isRecord(payload) || !Array.isArray(payload.items))
    throw new Error("HH API вернул неожиданный формат.");
  const { data: source, error } = await db
    .from("opportunity_sources")
    .upsert(
      {
        name: "hh.ru · русскоязычные digital-вакансии",
        slug: "hh-russian-digital",
        base_url: "https://hh.ru",
        source_type: "api",
        is_active: true,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (error || !source) throw new Error("Не удалось сохранить источник hh.ru.");
  let imported = 0,
    skipped = 0;
  for (const row of payload.items.slice(0, 20)) {
    const item = normalizeHhVacancy(row);
    if (!item) {
      skipped++;
      continue;
    }
    const saved = await db
      .from("opportunities")
      .upsert(
        {
          source_id: source.id,
          external_id: item.externalId,
          canonical_key: createHash("sha256").update(item.url).digest("hex"),
          title: item.title,
          description: item.description || null,
          source_url: item.url,
          company_name: item.company,
          category: "Digital · hh.ru",
          type: "job",
          location: item.location,
          remote: item.remote,
          budget_min: item.budgetMin,
          budget_max: item.budgetMax,
          currency_code: item.currency,
          competition: "unknown",
          published_at: item.publishedAt,
          is_active: true,
          raw_metadata: {
            ingestion: "hh-api-ru-v1",
            content_language: "ru",
            language_filter: "ru-content-v1",
            budget_extraction:
              item.budgetMin !== null || item.budgetMax !== null
                ? "api"
                : "not_found",
            budget_confidence:
              item.budgetMin !== null || item.budgetMax !== null
                ? "medium"
                : "none",
            budget_period: item.budgetPeriod,
            currency_evidence: item.currencyConfirmed ? "explicit" : "unknown",
            salary_gross: item.gross,
            remote_evidence: "api",
          },
          evidence: [{ type: "source_link", url: item.url }],
        },
        { onConflict: "canonical_key" },
      );
    if (saved.error)
      throw new Error(
        "Не удалось записать вакансии hh.ru. Проверь миграции и права.",
      );
    imported++;
  }
  return { feed: "hh.ru · русскоязычные digital-вакансии", imported, skipped };
}
