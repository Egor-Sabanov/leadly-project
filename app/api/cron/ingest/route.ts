import { importHhDiscovery } from "@/lib/sources/hh";
import { isRussianOpportunity } from "@/lib/opportunity-language";
import { createHash, randomUUID } from "node:crypto";
import { isCronAuthorized, retryIngestion, summarizeIngestion, TransientIngestError, type IngestResult } from "@/lib/sources/ingest-runtime";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FEEDS = 10;
const MAX_ITEMS_PER_FEED = 40;
const MAX_DESCRIPTION = 6000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const MAX_FREELANCEHUNT_PAGES = 3;
const MAX_FREELANCEHUNT_PROJECTS_PER_SYNC = 40;
const FREELANCEHUNT_API_BASE = "https://api.freelancehunt.com/v2/projects";

type FeedItem = {
  title: string;
  link: string;
  description: string;
  publishedAt: string | null;
  guid: string | null;
};
type Budget = {
  min: number | null;
  max: number | null;
  currency: "RUB" | "USD" | "EUR";
  currencyEvidence: "explicit" | "defaulted_rub";
  confidence: "medium" | "low" | "none";
};

function extractBudget(text: string): Budget {
  const normalized = text.replace(/\u00a0/g, " ");
  const currencyMatches = [
    { currency: "USD" as const, re: /\$|\bUSD\b|доллар/i },
    { currency: "EUR" as const, re: /€|\bEUR\b|евро/i },
    { currency: "RUB" as const, re: /₽|\bRUB\b|руб(?:лей|ля|ль|\.)?/i },
  ].filter((entry) => entry.re.test(normalized));
  const currency =
    currencyMatches.length === 1 ? currencyMatches[0].currency : "RUB";
  const currencyEvidence: Budget["currencyEvidence"] = currencyMatches.length
    ? "explicit"
    : "defaulted_rub";
  const empty = {
    min: null,
    max: null,
    currency,
    currencyEvidence,
    confidence: "none" as const,
  };

  // Unsupported currencies must never be displayed as a ruble budget.
  if (/\bUAH\b|₴|грн|грив|\bBYN\b|\bKZT\b|тенге/i.test(normalized))
    return empty;

  const amount = String.raw`(?:\d{1,3}(?:[ ,]\d{3})+|\d{3,9})(?:[.,]\d{1,2})?`;
  const moneyWord = String.raw`(?:бюджет|стоимость|цена|оплата|гонорар|зарплата|доход|вознаграждение|ставка|budget|price|pay|salary|rate)`;
  const currencyWord = String.raw`(?:₽|руб(?:лей|ля|ль|\.)?|\$|USD|€|EUR|RUB|доллар(?:ов|а)?|евро)`;
  const candidates: number[] = [];
  const add = (value: string) => {
    let numeric = value.replace(/ /g, "");
    const comma = numeric.lastIndexOf(",");
    const dot = numeric.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
      const decimalSeparator = comma > dot ? "," : ".";
      const thousandsSeparator = decimalSeparator === "," ? "." : ",";
      numeric = numeric.split(thousandsSeparator).join("");
      if (decimalSeparator === ",") numeric = numeric.replace(",", ".");
    } else if (comma >= 0) {
      numeric = /,\d{1,2}$/.test(numeric)
        ? numeric.replace(",", ".")
        : numeric.replace(/,/g, "");
    }
    const parsed = Number(numeric);
    if (Number.isFinite(parsed) && parsed >= 100 && parsed <= 100_000_000)
      candidates.push(parsed);
  };

  // Strong signal: amount has a currency marker next to it.
  const markedAmount = new RegExp(
    String.raw`(?:${currencyWord})\s*(${amount})|(${amount})\s*${currencyWord}`,
    "gi",
  );
  for (const match of normalized.matchAll(markedAmount))
    add(match[1] || match[2]);

  // Strong signal: amount follows an explicit budget/price/pay label.
  const labelledAmount = new RegExp(
    String.raw`${moneyWord}[^\d\n]{0,12}(${amount})`,
    "gi",
  );
  for (const match of normalized.matchAll(labelledAmount)) add(match[1]);

  // Only treat a pair as a budget range when the range itself is tied to a money label or currency.
  let rangeFound = false;
  const labelledRange = new RegExp(
    String.raw`${moneyWord}[^\d\n]{0,15}(${amount})\s*(?:-|–|—|\bдо\b)\s*(${amount})`,
    "gi",
  );
  const currencyRange = new RegExp(
    String.raw`(${amount})\s*(?:-|–|—|\bдо\b)\s*(${amount})\s*${currencyWord}`,
    "gi",
  );
  for (const pattern of [labelledRange, currencyRange]) {
    for (const match of normalized.matchAll(pattern)) {
      add(match[1]);
      add(match[2]);
      rangeFound = true;
    }
  }

  const unique = [...new Set(candidates)].sort((a, b) => a - b);
  if (!unique.length) return empty;
  const hasMoneyLabel = new RegExp(moneyWord, "i").test(normalized);
  const confidence: Budget["confidence"] =
    currencyMatches.length === 1 && (hasMoneyLabel || rangeFound)
      ? "medium"
      : "low";
  if (rangeFound && unique.length >= 2)
    return {
      min: unique[0],
      max: unique[unique.length - 1],
      currency,
      currencyEvidence,
      confidence,
    };
  if (/\bот\b/i.test(normalized) && !/\bдо\b/i.test(normalized))
    return {
      min: unique[0],
      max: null,
      currency,
      currencyEvidence,
      confidence,
    };
  if (/\bдо\b/i.test(normalized) && !/\bот\b/i.test(normalized))
    return {
      min: null,
      max: unique[unique.length - 1],
      currency,
      currencyEvidence,
      confidence,
    };
  return {
    min: unique[0],
    max: unique.length > 1 ? unique[unique.length - 1] : unique[0],
    currency,
    currencyEvidence,
    confidence,
  };
}
function isPublicIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    if (
      octets.length !== 4 ||
      octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
    )
      return false;
    const [a, b, c] = octets;
    // IANA special-purpose, private, loopback, link-local, documentation, multicast and reserved ranges.
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 shared space
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && c === 0) return false; // 192.0.0.0/24
    if (a === 192 && b === 0 && c === 2) return false; // TEST-NET-1
    if (a === 192 && b === 88 && c === 99) return false; // deprecated 6to4 relay anycast
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
    if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
    return true;
  }
  if (version === 6) {
    const host = address.toLowerCase();
    // Reject IPv4-mapped, unspecified, loopback, unique-local, link-local, multicast and non-global ranges.
    if (host.startsWith("::ffff:") || host === "::" || host === "::1")
      return false;
    const first = parseInt(host.split(":")[0] || "0", 16);
    if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff)
      return false; // only 2000::/3
    if (host.startsWith("2001:db8:")) return false; // documentation
    if (/^2001:(?:0|2|10|20|0db8):/i.test(host)) return false; // special-purpose subranges
    if (host.startsWith("2002:")) return false; // 6to4 transition mechanism
    return true;
  }
  return false;
}
function parseFeedUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.port && url.port !== "443") return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      !host ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    )
      return null;
    if (isIP(host)) return isPublicIp(host) ? url : null;
    return url;
  } catch {
    return null;
  }
}

async function safePublicHttpsUrl(value: string): Promise<boolean> {
  const url = parseFeedUrl(value);
  if (!url) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isPublicIp(host);
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return (
      addresses.length > 0 &&
      addresses.every((entry) => isPublicIp(entry.address))
    );
  } catch {
    return false;
  }
}

async function fetchPublicFeed(initialUrl: string, signal: AbortSignal): Promise<string> {
  let currentUrl = initialUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (!(await safePublicHttpsUrl(currentUrl)))
      throw new Error("Feed URL or redirect resolves to a non-public address.");
    const response = await fetch(currentUrl, {
      headers: {
        "user-agent": "LEADLY Opportunity Reader/1.0 (+RSS feed reader)",
        accept:
          "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
      },
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      cache: "no-store",
      redirect: "manual",
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location)
        throw new Error("Feed redirect did not include a Location header.");
      await response.body?.cancel();
      if (redirects === MAX_REDIRECTS)
        throw new Error("Feed exceeded the redirect limit.");
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 408 || response.status === 429 || response.status >= 500)
        throw new TransientIngestError(`Feed returned HTTP ${response.status}`);
      throw new Error(`Feed returned HTTP ${response.status}`);
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      await response.body?.cancel();
      throw new Error("Feed response exceeds the 2 MB limit.");
    }
    if (!response.body) throw new Error("Feed response body is empty.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error("Feed response exceeds the 2 MB limit.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(combined);
  }
  throw new Error("Feed exceeded the redirect limit.");
}
function decodeXml(value: string): string {
  return (
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      // Strip literal HTML first, then decode entities (RSS frequently escapes
      // the HTML markup itself, which would otherwise leak tags into the UI).
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&nbsp;|&#160;|&#x0*a0;/gi, " ")
      .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, raw: string) => {
        const codePoint =
          raw[0].toLowerCase() === "x"
            ? Number.parseInt(raw.slice(1), 16)
            : Number(raw);
        return Number.isInteger(codePoint) &&
          codePoint >= 0 &&
          codePoint <= 0x10ffff &&
          !(codePoint >= 0xd800 && codePoint <= 0xdfff)
          ? String.fromCodePoint(codePoint)
          : " ";
      })
      // A second pass removes tags that were entity-encoded in the original RSS.
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
      .replace(/<\/?[a-z][^>]*>/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function tag(block: string, names: string[]): string {
  for (const name of names) {
    const re = new RegExp(
      `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}\\s*>`,
      "i",
    );
    const match = block.match(re);
    if (match?.[1]) return decodeXml(match[1]);
  }
  return "";
}

function parseFeed(xml: string): FeedItem[] {
  const blocks = [
    ...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi),
  ]
    .map((m) => m[0])
    .slice(0, MAX_ITEMS_PER_FEED);
  return blocks
    .map((block) => {
      const title = tag(block, ["title"]);
      const description = tag(block, [
        "description",
        "content:encoded",
        "summary",
        "content",
      ]);
      const guid = tag(block, ["guid", "id"]);
      let link = tag(block, ["link"]);
      if (!link) {
        const href = block.match(
          /<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i,
        );
        link = href?.[1] || "";
      }
      const date = tag(block, ["pubDate", "published", "updated", "dc:date"]);
      const parsedDate = date ? new Date(date) : null;
      return {
        title,
        link,
        description: description.slice(0, MAX_DESCRIPTION),
        publishedAt:
          parsedDate && !Number.isNaN(parsedDate.getTime())
            ? parsedDate.toISOString()
            : null,
        guid: guid || null,
      };
    })
    .filter((item) => item.title.length > 0 && /^https:\/\//i.test(item.link));
}

type OpportunityType = "freelance" | "job" | "project" | "client" | "other";

function classify(text: string): OpportunityType {
  const t = text.toLowerCase();
  if (/ваканс|работа|job|career|hiring|full.?time|part.?time/.test(t))
    return "job";
  if (/фриланс|freelance|заказ|подряд|gig/.test(t)) return "freelance";
  if (
    /клиент|ищем исполнител|ищу специалист|looking for (a )?(developer|designer|freelancer)/.test(
      t,
    )
  )
    return "client";
  if (/проект|project|тендер|конкурс/.test(t)) return "project";
  return "other";
}

/** Prefer explicit feed semantics over generic keywords when classifying RSS items. */
function classifyFeedItem(
  text: string,
  feedUrlValue: string,
  itemBodyText?: string,
): OpportunityType {
  let feedUrl: URL;
  try {
    feedUrl = new URL(feedUrlValue);
  } catch {
    return classify(text);
  }
  const host = feedUrl.hostname.toLowerCase().replace(/^www\./, "");
  const path = feedUrl.pathname.replace(/\/+$/, "") || "/";

  if (
    (host === "fl.ru" && path === "/rss/all.xml") ||
    (host === "freelancehunt.com" && path === "/projects.rss")
  )
    return "project";
  // These endpoints are employment-job feeds by their published purpose.
  if (
    host === "weworkremotely.com" ||
    host === "remotive.com" ||
    host === "remoteok.com"
  ) {
    return "job";
  }
  // Jobicy's public remote-jobs RSS is a job feed even if an item body contains
  // generic phrases like "freelancer". Keep it out of the freelancer-self-promotion type.
  if (
    host === "jobicy.com" &&
    (path === "/jobs/feed" || path === "/feed/job_feed")
  ) {
    return "job";
  }
  if (host === "hnrss.org" && path === "/whoishiring/jobs") return "job";
  // Codeur's /projects RSS is a client-posted freelance-project board,
  // not an employment listing or a freelancer advertising availability.
  if (host === "codeur.com" && path === "/projects") return "project";
  if (host === "hnrss.org" && path === "/whoishiring/freelance") {
    // HNRSS wraps every comment with a generic thread title containing
    // "Freelancer? Seeking freelancer?". Classify from the comment body first,
    // otherwise that wrapper falsely makes every post look ambiguous.
    const body = (itemBodyText ?? text)
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .trim();
    const heading = body.match(/^SEEKING\s+(FREELANCER|WORK)\b/i)?.[0];
    if (heading && /^SEEKING\s+FREELANCER\b/i.test(heading)) return "client";
    if (heading && /^SEEKING\s+WORK\b/i.test(heading)) return "freelance";

    // Fall back only to clear signals in the body, never the generic feed title.
    const seekingClient = /\bSEEKING\s+FREELANCER\b/i.test(body);
    const seekingWork = /\bSEEKING\s+WORK\b/i.test(body);
    if (seekingClient && !seekingWork) return "client";
    if (seekingWork && !seekingClient) return "freelance";
    // Ambiguous records stay out of the client-lead bucket by default.
    return "other";
  }
  return classify(text);
}

function sourceIdentity(sourceUrl: URL): {
  name: string;
  slug: string;
  baseUrl: string;
} {
  const host = sourceUrl.hostname.toLowerCase().replace(/^www\./, "");
  const path = sourceUrl.pathname.replace(/\/+$/, "") || "/";
  if (host === "fl.ru" && path === "/rss/all.xml")
    return {
      name: "FL.ru",
      slug: "fl-ru-projects",
      baseUrl: "https://www.fl.ru",
    };
  if (host === "freelancehunt.com" && path === "/projects.rss")
    return {
      name: "Freelancehunt",
      slug: "freelancehunt-rss",
      baseUrl: "https://freelancehunt.com",
    };
  if (host === "hnrss.org" && path === "/whoishiring/freelance") {
    return {
      name: "Hacker News Freelance",
      slug: "hacker-news-freelance",
      baseUrl: "https://news.ycombinator.com",
    };
  }
  if (host === "codeur.com" && path === "/projects") {
    return {
      name: "Codeur Projects",
      slug: "codeur-projects",
      baseUrl: "https://www.codeur.com",
    };
  }
  if (
    host === "jobicy.com" &&
    (path === "/jobs/feed" || path === "/feed/job_feed")
  ) {
    return {
      name: "Jobicy Contract Jobs",
      slug: "jobicy-contract-jobs",
      baseUrl: "https://jobicy.com",
    };
  }
  if (
    host === "remotive.com" &&
    (path === "/feed" || path.startsWith("/remote-jobs/feed/"))
  ) {
    return {
      name: path.includes("software-development")
        ? "Remotive Software Development"
        : "Remotive Remote Jobs",
      slug: path.includes("software-development")
        ? "remotive-software-development"
        : "remotive-remote-jobs",
      baseUrl: "https://remotive.com",
    };
  }
  return {
    name: host,
    slug: host.replace(/[^a-z0-9.-]+/g, "-").slice(0, 80),
    baseUrl: `${sourceUrl.protocol}//${sourceUrl.host}`,
  };
}

type UnknownRecord = Record<string, unknown>;

type NormalizedFreelancehuntProject = {
  externalId: string;
  title: string;
  description: string;
  url: string;
  publishedAt: string | null;
  expiresAt: string | null;
  budgetAmount: number | null;
  currencyCode: string | null;
  skillNames: string[];
  location: string | null;
  remote: boolean;
  remoteEvidence: "api" | "inferred_no_location";
  status: string | null;
};

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function parseSafeFreelancehuntWebUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password || (url.port && url.port !== "443"))
      return null;
    if (host !== "freelancehunt.com" || !url.pathname.startsWith("/project/"))
      return null;
    url.protocol = "https:";
    url.hostname = "freelancehunt.com";
    url.port = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function safeFreelancehuntNextUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "api.freelancehunt.com" ||
      url.pathname !== "/v2/projects" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeFreelancehuntProject(
  value: unknown,
): NormalizedFreelancehuntProject | null {
  const item = asRecord(value);
  const attributes = asRecord(item.attributes);
  const itemLinks = asRecord(item.links);
  const selfLink = asRecord(itemLinks.self);
  const rawUrl =
    selfLink.web ??
    attributes.url ??
    attributes.web_url ??
    attributes.source_url;
  const url = parseSafeFreelancehuntWebUrl(rawUrl);
  const idValue = item.id ?? attributes.id;
  const externalId =
    idValue === undefined || idValue === null ? "" : String(idValue).trim();
  const title = String(attributes.name ?? attributes.title ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!externalId || !/^\d+$/.test(externalId) || !title || !url) return null;

  const rawDescription =
    attributes.description_html ??
    attributes.description ??
    attributes.summary ??
    "";
  const description = decodeXml(String(rawDescription)).slice(
    0,
    MAX_DESCRIPTION,
  );
  const budget = asRecord(attributes.budget);
  const amountRaw = budget.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
        ? Number(amountRaw.replace(/[ ,]/g, ""))
        : NaN;
  const rawCurrency =
    typeof budget.currency === "string"
      ? budget.currency.toUpperCase().trim()
      : "";
  const hasBudget =
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= 100_000_000 &&
    /^[A-Z]{3}$/.test(rawCurrency);
  const rawPublished =
    attributes.published_at ?? attributes.created_at ?? attributes.createdAt;
  const publishedDate =
    typeof rawPublished === "string" ? new Date(rawPublished) : null;
  const rawExpires =
    attributes.expired_at ?? attributes.expires_at ?? attributes.expiresAt;
  const expiresDate =
    typeof rawExpires === "string" ? new Date(rawExpires) : null;
  const statusObject = asRecord(attributes.status);
  const rawStatus =
    typeof attributes.status === "string"
      ? attributes.status
      : statusObject.name;
  const status = typeof rawStatus === "string" ? rawStatus.trim() : null;
  const rawSkills = Array.isArray(attributes.skills) ? attributes.skills : [];
  const skillNames = rawSkills
    .map((skill) => {
      if (typeof skill === "string") return skill.trim();
      const skillObject = asRecord(skill);
      return typeof skillObject.name === "string"
        ? skillObject.name.trim()
        : "";
    })
    .filter(Boolean)
    .slice(0, 40);
  const locationObject = asRecord(attributes.location);
  const rawLocation =
    typeof attributes.location === "string"
      ? attributes.location
      : [locationObject.city, locationObject.country]
          .filter((part) => typeof part === "string" && part.trim())
          .join(", ");
  const location = rawLocation.trim() || null;
  const rawRemote = attributes.is_remote_job;
  const remoteEvidence: NormalizedFreelancehuntProject["remoteEvidence"] =
    typeof rawRemote === "boolean" ? "api" : "inferred_no_location";
  const remote = typeof rawRemote === "boolean" ? rawRemote : location === null;

  return {
    externalId,
    title: title.slice(0, 300),
    description,
    url,
    publishedAt:
      publishedDate && !Number.isNaN(publishedDate.getTime())
        ? publishedDate.toISOString()
        : null,
    expiresAt:
      expiresDate && !Number.isNaN(expiresDate.getTime())
        ? expiresDate.toISOString()
        : null,
    budgetAmount: hasBudget ? amount : null,
    currencyCode: hasBudget ? rawCurrency : null,
    skillNames,
    location,
    remote,
    remoteEvidence,
    status,
  };
}

function shouldSkipFreelancehuntProject(
  project: NormalizedFreelancehuntProject,
  now = Date.now(),
): boolean {
  if (project.expiresAt && new Date(project.expiresAt).getTime() <= now)
    return true;
  return Boolean(
    project.status &&
    /\b(closed|completed|complete|paid|blocked|cancelled|canceled|expired)\b|закрыт|заверш[её]н|оплачен|заблокирован|отмен[её]н|ист[её]к/i.test(
      project.status,
    ),
  );
}

async function fetchFreelancehuntProjectPage(
  urlValue: string,
  token: string,
): Promise<{ records: unknown[]; next: string | null }> {
  const safeUrl = safeFreelancehuntNextUrl(urlValue);
  if (!safeUrl)
    throw new Error("Freelancehunt API returned an unexpected pagination URL.");
  const response = await fetch(safeUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Accept-Language": "ru",
      "User-Agent": "LEADLY Opportunity Aggregator/1.0",
    },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Freelancehunt API returned HTTP ${response.status}; check FREELANCEHUNT_API_TOKEN and its access.`,
      );
    }
    throw new Error(`Freelancehunt API returned HTTP ${response.status}.`);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("Freelancehunt API response exceeds the 2 MB limit.");
  }
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES)
    throw new Error("Freelancehunt API response exceeds the 2 MB limit.");
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("Freelancehunt API returned invalid JSON.");
  }
  const root = asRecord(payload);
  if (root.error) {
    const error = asRecord(root.error);
    const title = typeof error.title === "string" ? error.title : "API error";
    throw new Error(`Freelancehunt API error: ${title}.`);
  }
  if (!Array.isArray(root.data))
    throw new Error(
      "Freelancehunt API response does not contain a data array.",
    );
  const links = asRecord(root.links);
  const next = links.next == null ? null : safeFreelancehuntNextUrl(links.next);
  if (links.next != null && !next)
    throw new Error(
      "Freelancehunt API returned an invalid next-page URL; pagination stopped for safety.",
    );
  return { records: root.data, next };
}

async function importFreelancehuntProjects(
  supabase: SupabaseClient<any, "public", "public", any, any>,
  token: string,
): Promise<{ feed: string; imported: number; skipped: number; pages: number }> {
  const sourceInfo = {
    name: "Freelancehunt Projects",
    slug: "freelancehunt-projects",
    baseUrl: "https://freelancehunt.com",
  };
  const { data: source, error: sourceError } = await supabase
    .from("opportunity_sources")
    .upsert(
      {
        name: sourceInfo.name,
        slug: sourceInfo.slug,
        base_url: sourceInfo.baseUrl,
        source_type: "api",
        is_active: true,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (sourceError || !source)
    throw new Error(
      sourceError?.message || "Could not save Freelancehunt source.",
    );

  let pageUrl: string | null = `${FREELANCEHUNT_API_BASE}?page%5Bnumber%5D=1`;
  let imported = 0;
  let skipped = 0;
  let pages = 0;
  let processed = 0;
  while (
    pageUrl &&
    pages < MAX_FREELANCEHUNT_PAGES &&
    processed < MAX_FREELANCEHUNT_PROJECTS_PER_SYNC
  ) {
    const page = await fetchFreelancehuntProjectPage(pageUrl, token);
    pages += 1;
    if (page.records.length === 0) break;
    for (const record of page.records) {
      if (processed >= MAX_FREELANCEHUNT_PROJECTS_PER_SYNC) break;
      processed += 1;
      const project = normalizeFreelancehuntProject(record);
      if (
        !project ||
        shouldSkipFreelancehuntProject(project) ||
        !isRussianOpportunity(project)
      ) {
        skipped += 1;
        continue;
      }
      const budgetAmount = project.budgetAmount;
      const rawMetadata = {
        ingestion: "freelancehunt-api-ru-v2",
        content_language: "ru",
        language_filter: "ru-content-v1",
        external_project_id: project.externalId,
        skills: project.skillNames,
        source_status: project.status,
        remote_evidence: project.remoteEvidence,
        budget_extraction: budgetAmount == null ? "not_found" : "api",
        budget_confidence: budgetAmount == null ? "none" : "medium",
        currency_evidence: project.currencyCode ? "explicit" : "unknown",
      };
      const { error } = await supabase.from("opportunities").upsert(
        {
          source_id: source.id,
          external_id: project.externalId,
          canonical_key: canonicalKey(project.url),
          type: "project",
          title: project.title,
          company_name: sourceInfo.name,
          description: project.description || null,
          source_url: project.url,
          category: project.skillNames.length
            ? project.skillNames.join(", ").slice(0, 300)
            : "Freelance marketplace project",
          location: project.location,
          remote: project.remote,
          budget_min: budgetAmount,
          budget_max: budgetAmount,
          ...(project.currencyCode
            ? { currency_code: project.currencyCode }
            : {}),
          competition: "unknown",
          published_at: project.publishedAt,
          expires_at: project.expiresAt,
          raw_metadata: rawMetadata,
          evidence: [
            { type: "source_link", url: project.url },
            ...project.skillNames
              .slice(0, 10)
              .map((name) => ({ type: "api_skill", name })),
          ],
          is_active: true,
        },
        { onConflict: "canonical_key", ignoreDuplicates: false },
      );
      if (error)
        throw new Error(
          "Не удалось записать проект Freelancehunt. Проверь схему и права базы.",
        );
      else imported += 1;
    }
    pageUrl = page.next;
  }
  return { feed: sourceInfo.name, imported, skipped, pages };
}

function canonicalKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()])
      if (/^(utm_|ref$|source$|fbclid$|gclid$)/i.test(key))
        parsed.searchParams.delete(key);
    parsed.searchParams.sort();
    if (parsed.pathname.length > 1)
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    // URL normalizes the hostname; preserve case-sensitive path/query values.
    const normalized = parsed.toString();
    return createHash("sha256").update(normalized).digest("hex");
  } catch {
    return createHash("sha256").update(url.trim()).digest("hex");
  }
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const responseHeaders = { "Cache-Control": "no-store, max-age=0" };
  if (!isCronAuthorized(cronSecret, authorization)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: responseHeaders });
  }
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const started = Date.now();
  // Leave time for a final report before the platform's 300-second ceiling.
  const signal = AbortSignal.timeout(240_000);
  console.info(JSON.stringify({ event: "ingestion_started", runId, startedAt }));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "На сервере не настроены Supabase URL и service role key." },
      { status: 503, headers: responseHeaders },
    );
  }

  const feeds = (
    process.env.LEADLY_RSS_FEEDS ??
    "https://www.fl.ru/rss/all.xml\nhttps://freelancehunt.com/projects.rss"
  )
    .split(/\r?\n|,/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, MAX_FEEDS);
  const hhEnabled = process.env.LEADLY_HH_ENABLED === "true";
  const freelancehuntToken = process.env.FREELANCEHUNT_API_TOKEN?.trim() || "";
  if (!feeds.length && !freelancehuntToken && !hhEnabled) {
    return NextResponse.json(
      {
        error:
          "Добавь HTTPS RSS/Atom адреса в LEADLY_RSS_FEEDS (по одному на строку).",
      },
      { status: 400, headers: responseHeaders },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      }),
    },
  });
  const report: IngestResult[] = [];

  for (const feedUrl of feeds) {
    let imported = 0;
    let skipped = 0;
    try {
      signal.throwIfAborted();
      const xml = await retryIngestion(() => fetchPublicFeed(feedUrl, signal), signal);
      const items = parseFeed(xml);
      if (!items.length)
        throw new Error(
          "Не удалось найти подходящие RSS/Atom записи с HTTPS-ссылками.",
        );

      const sourceUrl = new URL(feedUrl);
      const sourceInfo = sourceIdentity(sourceUrl);
      const sourceName = sourceInfo.name;
      const slug = sourceInfo.slug;
      const { data: source, error: sourceError } = await supabase
        .from("opportunity_sources")
        .upsert(
          {
            name: sourceName,
            slug,
            base_url: sourceInfo.baseUrl,
            source_type: "rss",
            is_active: true,
          },
          { onConflict: "slug" },
        )
        .select("id")
        .single();
      if (sourceError || !source)
        throw new Error(
          "Не удалось сохранить источник. Проверь схему и доступ к базе.",
        );

      // A feed can repeat the same URL with different tracking parameters.
      // Deduplicate before a single atomic upsert (Postgres rejects duplicate
      // conflict keys in one statement). Never touch users' saved states.
      const rows = new Map<string, Record<string, unknown>>();
      for (const item of items) {
        if (!isRussianOpportunity(item)) {
          skipped++;
          continue;
        }
        const budget = extractBudget(`${item.title} ${item.description}`);
        const key = canonicalKey(item.link);
        if (rows.has(key)) {
          skipped++;
          continue;
        }
        rows.set(key, {
          source_id: source.id,
          external_id: item.guid || item.link,
          canonical_key: key,
          type: classifyFeedItem(
            `${item.title} ${item.description}`,
            feedUrl,
            item.description,
          ),
          title: item.title.slice(0, 300),
          company_name:
            (sourceUrl.hostname.toLowerCase().replace(/^www\./, "") ===
              "hnrss.org" &&
              /^\/whoishiring\/freelance\/?$/i.test(sourceUrl.pathname)) ||
            (sourceUrl.hostname.toLowerCase().replace(/^www\./, "") ===
              "codeur.com" &&
              /^\/projects\/?$/i.test(sourceUrl.pathname))
              ? null
              : sourceName,
          description: item.description || null,
          source_url: item.link,
          category: "RSS",
          remote:
            /(^|\.)(weworkremotely\.com|remotive\.com|jobicy\.com|remoteok\.com)$/.test(
              sourceUrl.hostname,
            ) ||
            /\bremote\b|удал[её]нн/i.test(
              `${item.title} ${item.description}`,
            ),
          currency_code: budget.currency,
          budget_min: budget.min,
          budget_max: budget.max,
          published_at: item.publishedAt,
          raw_metadata: {
            remote_evidence: "source_or_text_inference",
            feed_url: feedUrl,
            guid: item.guid,
            ingestion: "rss-ru-v4",
            content_language: "ru",
            language_filter: "ru-content-v1",
            budget_extraction:
              budget.confidence === "none" ? "not_found" : "heuristic",
            budget_confidence: budget.confidence,
            currency_evidence: budget.currencyEvidence,
          },
          evidence: [{ type: "source_link", url: item.link }],
          is_active: true,
        });
      }
      if (rows.size) {
        await retryIngestion(async () => {
          const { error, status } = await supabase.from("opportunities").upsert(
            [...rows.values()],
            { onConflict: "canonical_key", ignoreDuplicates: false },
          );
          if (error) {
            if (status === 0 || status === 408 || status === 429 || status >= 500)
              throw new TransientIngestError("База временно недоступна.");
            throw new Error("Не удалось записать предложения. Проверь схему и доступ к базе.");
          }
        }, signal);
        imported = rows.size;
      }
      report.push({ feed: sourceName, imported, skipped });
    } catch (error) {
      report.push({
        // Configuration URLs can contain private query parameters. Logs and
        // responses identify the source without copying its full URL.
        feed: parseFeedUrl(feedUrl)?.hostname || "Некорректный RSS",
        imported,
        skipped,
        error: signal.aborted
          ? "Превышено время импорта. Источник будет проверен при следующем запуске."
          : error instanceof Error ? error.message : "Импорт источника не выполнен.",
      });
    }
  }

  if (freelancehuntToken) {
    try {
      signal.throwIfAborted();
      report.push(
        await importFreelancehuntProjects(supabase, freelancehuntToken),
      );
    } catch (error) {
      report.push({
        feed: "Freelancehunt Projects",
        imported: 0,
        skipped: 0,
        error:
          error instanceof Error
            ? error.message
            : "Freelancehunt import failed.",
      });
    }
  }

  if (hhEnabled) {
    try {
      signal.throwIfAborted();
      report.push(
        ...(await importHhDiscovery(supabase, {
          query: process.env.LEADLY_HH_QUERY,
          disciplineIds: process.env.LEADLY_HH_DISCIPLINES,
          token: process.env.HH_API_TOKEN,
        })),
      );
    } catch (error) {
      report.push({
        feed: "hh.ru",
        imported: 0,
        skipped: 0,
        error:
          error instanceof Error ? error.message : "Импорт hh.ru не выполнен.",
      });
    }
  }
  const summary = summarizeIngestion(report);
  const outcome = {
    ...summary,
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    results: report,
  };
  console.info(JSON.stringify({ event: "ingestion_finished", ...outcome }));
  return NextResponse.json({
    ...outcome,
    note: "Обработаны русскоязычные записи RSS/Atom и API. imported — созданные и обновлённые записи. Иностранные и записи с неопределённым языком пропущены. Эвристические бюджеты из RSS не подтверждены. Проверяй условия и актуальность перед откликом.",
  }, { status: summary.ok ? 200 : 502, headers: responseHeaders });
}
