import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readLimitedJson } from "@/lib/request-guards";
import { normalizeTelegramPost } from "@/lib/telegram-source";
export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const actual = request.headers.get("x-telegram-bot-api-secret-token") || "";
  if (
    !expected ||
    Buffer.byteLength(expected) !== Buffer.byteLength(actual) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    !url ||
    !key ||
    !process.env.TELEGRAM_ALLOWED_CHAT_IDS ||
    !process.env.TELEGRAM_OPPORTUNITY_TYPE
  )
    return NextResponse.json(
      { error: "Connector not configured" },
      { status: 503 },
    );
  let input: unknown;
  try {
    input = await readLimitedJson(request, 32000);
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: e instanceof RangeError ? 413 : 400 },
    );
  }
  const post = normalizeTelegramPost(
    input,
    process.env.TELEGRAM_ALLOWED_CHAT_IDS.split(",").map((v) => v.trim()),
    process.env.TELEGRAM_OPPORTUNITY_TYPE,
  );
  if (!post) return NextResponse.json({ ok: true, ignored: true });
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const source = await db
    .from("opportunity_sources")
    .upsert(
      {
        name: `${post.channel} · Telegram ${post.chatId}`,
        slug: `telegram-${post.chatId.replace(/[^0-9]/g, "")}`,
        base_url: `https://t.me/${new URL(post.url).pathname.split("/")[1]}`,
        source_type: "telegram",
        is_active: true,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (source.error || !source.data)
    return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  const saved = await db.from("opportunities").upsert(
    {
      source_id: source.data.id,
      canonical_key: createHash("sha256").update(post.url).digest("hex"),
      external_id: post.url,
      title: post.title,
      description: post.description,
      type: post.type,
      source_url: post.url,
      company_name: null,
      remote: false,
      currency_code: "RUB",
      budget_min: null,
      budget_max: null,
      published_at: post.publishedAt,
      raw_metadata: {
        ingestion: "telegram-authorized-ru-v2",
        content_language: "ru",
        language_filter: "ru-content-v1",
        remote_evidence: "unknown",
        currency_evidence: "defaulted_rub",
        budget_extraction: "not_found",
      },
      evidence: [{ type: "source_link", url: post.url }],
      is_active: true,
    },
    { onConflict: "canonical_key" },
  );
  if (saved.error)
    return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
