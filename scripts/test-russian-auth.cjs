const assert = require("node:assert/strict");
const path = require("node:path");
const { createTsLoader } = require("./ts-loader.cjs");
const root = path.resolve(__dirname, "..");
const load = createTsLoader();
const { isRussianOpportunity: ru } = load(
  path.join(root, "lib/opportunity-language.ts"),
);
const { socialAuthCatalog, enabledNativeProviders } = load(
  path.join(root, "lib/auth-providers.ts"),
);
const languageCases = [
  [
    "Russian development project",
    "Разработать сайт на React",
    "Нужно создать сайт компании и настроить интеграцию API.",
    true,
  ],
  [
    "English technology title with Russian requirements",
    "Senior UI/UX Designer",
    "Ищем дизайнера интерфейсов. Нужно собрать прототип в Figma и подготовить макеты.",
    true,
  ],
  ["short Russian project", "Нужен дизайнер Figma", "", true],
  [
    "copywriting",
    "Ищу копирайтера",
    "Нужны тексты для сайта. Необходимо подготовить описание услуг.",
    true,
  ],
  [
    "marketing",
    "SEO-аудит сайта",
    "Требуется специалист по продвижению. Необходимо проверить сайт и предложить план работ.",
    true,
  ],
  [
    "video",
    "Монтаж Reels и Shorts",
    "Нужен специалист: сделать монтаж, субтитры и обработку звука.",
    true,
  ],
  [
    "mixed technology vocabulary",
    "Нужен .NET разработчик",
    "Нужно настроить API и интеграции с CRM.",
    true,
  ],
  [
    "Russian text with code",
    "Разработка приложения",
    'Нужно доработать сайт и исправить ошибки. ```const description = "very long English code and comments about component props"```',
    true,
  ],
  [
    "English project",
    "Build a Next.js website",
    "We need an experienced developer to build our company website.",
    false,
  ],
  [
    "Russian employer name does not translate a job",
    "ООО Ромашка",
    "We are looking for an experienced graphic designer to develop a complete visual identity for our business.",
    false,
  ],
  [
    "Russian footer cannot promote English job",
    "React Developer",
    "We are looking for an experienced software developer to maintain our customer platform and develop new services. Applicants must have significant experience and submit a portfolio. По вопросам пишите нам.",
    false,
  ],
  [
    "Ukrainian job",
    "Потрібен дизайнер",
    "Шукаємо дизайнера інтерфейсів з досвідом роботи.",
    false,
  ],
  [
    "Belarusian job",
    "Патрэбны дызайнер",
    "Шукаем спецыяліста для працы над праектам.",
    false,
  ],
  [
    "Bulgarian job",
    "Търсим дизайнер",
    "Изисквания и заплащане за работа по проект.",
    false,
  ],
  ["Cyrillic names alone", "Иван Петров", "Компания Ромашка", false],
  ["URL is not content", "https://example.com/нужен-дизайнер", "", false],
  [
    "English markup labels are ignored",
    '<div title="Нужен дизайнер">Web designer</div>',
    "Build an ecommerce website with an experienced team.",
    false,
  ],
  ["empty content", "", "", false],
  [
    "objects are not stringified into content",
    { title: "Нужен дизайнер" },
    null,
    false,
  ],
  ["uncertain fragments", "React API UI", "Figma", false],
];
const tests = languageCases.map(([name, title, description, expected]) => [
  name,
  () => assert.equal(ru({ title, description }), expected),
]);
tests.push(
  [
    "only literal enabled provider flags activate buttons",
    () => {
      const result = enabledNativeProviders(socialAuthCatalog(), {
        external: { google: true, github: "true", vk: true },
      });
      assert.equal(result.find((x) => x.id === "google").enabled, true);
      assert.equal(result.find((x) => x.id === "github").enabled, false);
      assert.equal(result.find((x) => x.id === "vk").enabled, false);
    },
  ],
  [
    "missing or malformed auth settings fail closed",
    () => {
      for (const settings of [null, [], {}, { external: [] }])
        assert.equal(
          enabledNativeProviders(socialAuthCatalog(), settings).some(
            (x) => x.enabled,
          ),
          false,
        );
    },
  ],
  [
    "custom provider identifiers cannot become arbitrary redirects",
    () => {
      const items = socialAuthCatalog("https://evil.example", "google");
      assert.equal(items.find((x) => x.id === "vk").provider, "custom:vk");
      assert.equal(
        items.find((x) => x.id === "yandex").provider,
        "custom:yandex",
      );
    },
  ],
);
let mockFetch = async () => {
  throw new Error("Unexpected network request in test");
};
const hhLoad = createTsLoader({ fetch: (...args) => mockFetch(...args) });
const { normalizeHhVacancy, importHhVacancies } = hhLoad(
  path.join(root, "lib/sources/hh.ts"),
);
const record = {
  id: "12345",
  name: "Нужен дизайнер интерфейсов",
  snippet: {
    requirement: "Нужно подготовить прототип в Figma.",
    responsibility: "Разработать интерфейс и адаптивные макеты.",
  },
  salary: { from: 80000, to: 120000, currency: "RUR", gross: true },
  work_format: [{ id: "REMOTE" }],
  employer: { name: "Пример" },
  area: { name: "Москва" },
  published_at: "2026-10-18T08:00:00Z",
};
tests.push(
  [
    "HH normalization uses official canonical links and structured salary",
    () => {
      const result = normalizeHhVacancy({
        ...record,
        alternate_url: "https://evil.example",
      });
      assert.equal(result.url, "https://hh.ru/vacancy/12345");
      assert.equal(result.currency, "RUB");
      assert.equal(result.remote, true);
      assert.equal(result.budgetMin, 80000);
      assert.equal(result.budgetPeriod, "unknown");
    },
  ],
  [
    "HH rejects foreign vacancies and archived records",
    () => {
      assert.equal(
        normalizeHhVacancy({
          ...record,
          name: "UI Designer",
          snippet: {
            requirement: "Create modern interfaces for a global company.",
          },
        }),
        null,
      );
      assert.equal(normalizeHhVacancy({ ...record, archived: true }), null);
    },
  ],
  [
    "HH rejects unsafe IDs and reversed budget ranges",
    () => {
      assert.equal(normalizeHhVacancy({ ...record, id: "../evil" }), null);
      assert.equal(
        normalizeHhVacancy({
          ...record,
          salary: { from: 120000, to: 80000, currency: "RUR" },
        }),
        null,
      );
    },
  ],
  [
    "HH importer filters, preserves provenance and stays idempotent",
    async () => {
      const writes = [];
      const db = {
        from: (table) => ({
          upsert: (row, options) =>
            table === "opportunity_sources"
              ? {
                  select: () => ({
                    single: async () => ({
                      data: { id: "source" },
                      error: null,
                    }),
                  }),
                }
              : (writes.push({ row, options }),
                Promise.resolve({ error: null })),
        }),
      };
      mockFetch = async (url, options) => {
        assert.equal(url.origin, "https://api.hh.ru");
        assert.equal(url.searchParams.get("area"), "113");
        assert.equal(url.searchParams.get("locale"), "RU");
        assert.equal(options.redirect, "error");
        return new Response(
          JSON.stringify({
            items: [
              record,
              {
                ...record,
                id: "999",
                name: "Build a website",
                snippet: { requirement: "Experienced web developer required." },
              },
            ],
          }),
          { status: 200 },
        );
      };
      for (let i = 0; i < 2; i++) {
        const result = await importHhVacancies(db, "дизайнер");
        assert.equal(result.imported, 1);
        assert.equal(result.skipped, 1);
      }
      assert.equal(writes.length, 2);
      assert.equal(writes[0].row.canonical_key, writes[1].row.canonical_key);
      assert.equal(writes[0].row.raw_metadata.content_language, "ru");
      assert.equal(writes[0].options.onConflict, "canonical_key");
    },
  ],
  [
    "HH API failures never report success",
    async () => {
      mockFetch = async () => new Response("{}", { status: 403 });
      await assert.rejects(importHhVacancies({}, "дизайнер"), /HTTP 403/);
    },
  ],
);
const { loadRussianOpportunities } = load(
  path.join(root, "lib/russian-opportunities.ts"),
);
function readerDb(pages, onRange = () => {}) {
  return {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        or: () => chain,
        order: () => chain,
        range: async (start, end) => {
          onRange(start, end);
          return pages[Math.floor(start / 100)] || { data: [], error: null };
        },
      };
      return chain;
    },
  };
}
tests.push(
  [
    "reader scans beyond a foreign first page to find Russian records",
    async () => {
      const foreign = Array.from({ length: 100 }, () => ({
        title: "Build a website",
        description: "English job description.",
      }));
      const russian = Array.from({ length: 100 }, () => ({
        title: "Нужен дизайнер",
        description: "Разработать интерфейс на Figma.",
      }));
      const result = await loadRussianOpportunities(
        readerDb([
          { data: foreign, error: null },
          { data: russian, error: null },
        ]),
      );
      assert.equal(result.data.length, 100);
      assert.equal(result.scanned, 200);
      assert.equal(result.error, null);
    },
  ],
  [
    "reader has a hard scan limit and never includes uncertain content",
    async () => {
      let calls = 0;
      const page = {
        data: Array.from({ length: 100 }, () => ({
          title: "React API",
          description: "Global company",
        })),
        error: null,
      };
      const result = await loadRussianOpportunities(
        readerDb(Array(6).fill(page), () => calls++),
      );
      assert.equal(calls, 5);
      assert.equal(result.data.length, 0);
    },
  ],
  [
    "reader fails closed on partial database errors",
    async () => {
      const result = await loadRussianOpportunities(
        readerDb([{ data: [], error: { message: "Database unavailable" } }]),
      );
      assert.equal(result.data.length, 0);
      assert.equal(result.error.message, "Database unavailable");
    },
  ],
);
// Exercise actual Supabase SSR PKCE URL/cookie generation without contacting Google or Supabase.
tests.push([
  "social sign-in sets a PKCE verifier and restricts redirects",
  async () => {
    const { createServerClient } = require("@supabase/ssr");
    const writes = [];
    const client = createServerClient(
      "https://testproject.supabase.co",
      "public-test-key",
      {
        cookies: { getAll: () => [], setAll: (items) => writes.push(...items) },
      },
    );
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://testproject.supabase.co",
      LEADLY_SITE_URL: "https://app.example",
    };
    const mocks = {
      "@/lib/auth-provider-settings": {
        loadSocialAuthOptions: async () => [
          { id: "google", provider: "google", enabled: true },
        ],
      },
      "@/lib/supabase/server": {
        createSupabaseServerClient: async () => client,
      },
      "@/lib/request-guards": { requestOrigin: () => env.LEADLY_SITE_URL },
    };
    const file = path.join(root, "app/auth/social/[provider]/route.ts");
    const vm = require("node:vm");
    const ts = require("typescript");
    const fs = require("node:fs");
    const shim = { exports: {} };
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText;
    vm.runInNewContext(js, {
      module: shim,
      exports: shim.exports,
      require: (id) => mocks[id] || require(id),
      process: { env },
      URL,
    });
    const response = await shim.exports.GET(
      new Request(
        "https://app.example/auth/social/google?next=https://evil.example",
      ),
      { params: Promise.resolve({ provider: "google" }) },
    );
    assert.equal(response.status, 307);
    const destination = new URL(response.headers.get("location"));
    assert.equal(destination.origin, "https://testproject.supabase.co");
    assert.equal(destination.searchParams.get("provider"), "google");
    assert.equal(
      destination.searchParams.get("redirect_to"),
      "https://app.example/auth/callback",
    );
    assert.ok(destination.searchParams.get("code_challenge"));
    assert.equal(destination.searchParams.get("code_challenge_method"), "s256");
    assert.ok(writes.some((c) => c.name.includes("code-verifier") && c.value));
    client.auth.signInWithOAuth = async () => ({
      data: { url: "https://evil.example/authorize" },
      error: null,
    });
    const rejected = await shim.exports.GET(
      new Request("https://app.example/auth/social/google"),
      { params: Promise.resolve({ provider: "google" }) },
    );
    assert.equal(
      rejected.headers.get("location"),
      "https://app.example/auth?error=provider",
    );
    const unknown = await shim.exports.GET(
      new Request("https://app.example/auth/social/google"),
      { params: Promise.resolve({ provider: "evil" }) },
    );
    assert.equal(
      unknown.headers.get("location"),
      "https://app.example/auth?error=provider",
    );
  },
]);
(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log("PASS " + name);
    } catch (e) {
      failed++;
      console.error("FAIL " + name + ": " + e.message);
    }
  }
  console.log(
    `RESULT ${tests.length - failed}/${tests.length} Russian-source/social checks passed`,
  );
  if (failed) process.exitCode = 1;
})();
