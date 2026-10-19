import { unstable_cache } from "next/cache";

export const newsSources = [
  {
    id: "technology",
    label: "Технологии",
    publisher: "Хабр",
    feed: "https://habr.com/ru/rss/articles/?fl=ru",
    site: "https://habr.com/ru/articles/",
    host: "habr.com",
  },
  {
    id: "design",
    label: "Дизайн",
    publisher: "Хабр",
    feed: "https://habr.com/ru/rss/hubs/design/articles/all/?fl=ru",
    site: "https://habr.com/ru/hubs/design/",
    host: "habr.com",
  },
  {
    id: "video",
    label: "Видео",
    publisher: "Хабр",
    feed: "https://habr.com/ru/rss/hubs/video/articles/all/?fl=ru",
    site: "https://habr.com/ru/hubs/video/",
    host: "habr.com",
  },
  {
    id: "marketing",
    label: "Маркетинг",
    publisher: "Cossa",
    feed: "https://www.cossa.ru/rss/",
    site: "https://www.cossa.ru/",
    host: "www.cossa.ru",
  },
] as const;
export type NewsItem = {
  title: string;
  url: string;
  publishedAt: string;
  category: string;
  publisher: string;
};

function text(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, raw: string) => {
      const code = raw.startsWith("x")
        ? parseInt(raw.slice(1), 16)
        : Number(raw);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : " ";
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Read only bounded RSS items; never execute markup or accept arbitrary feeds. */
export function parseNews(
  xml: string,
  source: (typeof newsSources)[number],
  now = Date.now(),
): NewsItem[] {
  if (xml.length > 600_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) return [];
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  for (const match of Array.from(
    xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
  ).slice(0, 30)) {
    const tag = (name: string) =>
      text(
        match[1].match(
          new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"),
        )?.[1] || "",
      );
    const title = tag("title").slice(0, 240);
    const date = Date.parse(tag("pubDate"));
    if (
      !/[а-яё]{3}/i.test(title) ||
      !Number.isFinite(date) ||
      date > now + 600_000 ||
      date < now - 90 * 86400000
    )
      continue;
    try {
      const url = new URL(tag("link"));
      if (
        url.protocol !== "https:" ||
        url.hostname !== source.host ||
        url.port ||
        url.username ||
        url.password ||
        seen.has(url.href)
      )
        continue;
      seen.add(url.href);
      items.push({
        title,
        url: url.href,
        publishedAt: new Date(date).toISOString(),
        category: source.id,
        publisher: source.publisher,
      });
    } catch {
      continue;
    }
    if (items.length >= 4) break;
  }
  return items;
}

async function readSource(source: (typeof newsSources)[number]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(source.feed, {
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
      headers: {
        Accept: "application/rss+xml, application/xml",
        "User-Agent": "LEADLY/0.1 (public RSS headlines)",
      },
    });
    if (!response.ok || !response.body) return [];
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let xml = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 600_000) {
          await reader.cancel();
          return [];
        }
        xml += decoder.decode(value, { stream: true });
      }
      xml += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    return parseNews(xml, source);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Cache headlines server-side. The dashboard streams independently of publishers.
export const loadIndustryNews = unstable_cache(
  async () => {
    const feeds = await Promise.all(newsSources.map(readSource));
    return feeds.flat();
  },
  ["leadly-industry-headlines-v2"],
  { revalidate: 900 },
);
