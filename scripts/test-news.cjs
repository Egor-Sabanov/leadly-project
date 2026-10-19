const assert = require("node:assert/strict");
const path = require("node:path");
const { createTsLoader } = require("./ts-loader.cjs");
const load = createTsLoader({
  require: (id) =>
    id === "next/cache" ? { unstable_cache: (fn) => fn } : require(id),
});
const { parseNews, newsSources } = load(
  path.join(__dirname, "../lib/industry-news.ts"),
);
const now = Date.parse("2026-10-19T09:00:00Z");
const source = newsSources[1];
const item = (
  link = "https://habr.com/ru/articles/123/",
  title = "Новый инструмент для дизайнеров",
  date = "Mon, 19 Oct 2026 08:00:00 GMT",
) =>
  `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${date}</pubDate></item>`;
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("PASS " + name);
}
test("Russian headline retains publisher, category, verified link and actual publication date", () => {
  const [row] = parseNews(`<rss>${item()}</rss>`, source, now);
  assert.equal(row.category, "design");
  assert.equal(row.publisher, "Хабр");
  assert.equal(row.publishedAt, "2026-10-19T08:00:00.000Z");
  assert.equal(row.title, "Новый инструмент для дизайнеров");
});
test("off-site, lookalike, credentialed, script and insecure links are rejected", () => {
  for (const link of [
    "https://habr.com.evil.test/a",
    "https://evil.test/a",
    "https://user:password@habr.com/a",
    "javascript:alert(1)",
    "http://habr.com/a",
    "https://habr.com:8443/a",
  ])
    assert.equal(parseNews(item(link), source, now).length, 0, link);
});
test("missing, invalid, future and stale dates cannot masquerade as current news", () => {
  for (const date of [
    "",
    "unknown",
    "Tue, 20 Oct 2026 08:00:00 GMT",
    "Mon, 19 Jan 2026 08:00:00 GMT",
  ])
    assert.equal(
      parseNews(item(undefined, undefined, date), source, now).length,
      0,
    );
});
test("non-Russian headlines are omitted", () =>
  assert.equal(
    parseNews(item(undefined, "A new design application"), source, now).length,
    0,
  ));
test("duplicate links are displayed once per feed", () =>
  assert.equal(parseNews(item() + item(), source, now).length, 1));
test("entity declarations and oversized XML are rejected", () => {
  assert.equal(
    parseNews(
      '<!DOCTYPE rss [<!ENTITY test SYSTEM "file:///etc/passwd">]>' + item(),
      source,
      now,
    ).length,
    0,
  );
  assert.equal(parseNews(" ".repeat(600001) + item(), source, now).length, 0);
});
test("RSS markup is treated as text and no more than four headlines are returned", () => {
  const rows = parseNews(
    Array.from({ length: 8 }, (_, i) =>
      item(
        `https://habr.com/ru/articles/${i}/`,
        "<b>Новый</b> инструмент &amp; дизайн",
      ),
    ).join(""),
    source,
    now,
  );
  assert.equal(rows.length, 4);
  assert.equal(rows[0].title, "Новый инструмент & дизайн");
});
console.log(`${passed} news checks passed`);
