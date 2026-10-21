const assert = require("node:assert/strict");
const path = require("node:path");
const { createTsLoader } = require("./ts-loader.cjs");
const load = createTsLoader();
const root = path.resolve(__dirname, "..");
const { disciplines, opportunityDisciplines, mergeProfileSkills } = load(
  path.join(root, "lib/disciplines.ts"),
);
const { parseTelegramChannelRules } = load(
  path.join(root, "lib/telegram-channel-rules.ts"),
);
const { isRussianOpportunity } = load(
  path.join(root, "lib/opportunity-language.ts"),
);
const { scoreOpportunity } = load(
  path.join(root, "lib/opportunity-scoring.ts"),
);
const tests = [];
const add = (name, fn) => tests.push([name, fn]);
add("12 unique professions each have actual discovery queries", () => {
  assert.equal(disciplines.length, 12);
  assert.equal(new Set(disciplines.map((d) => d.id)).size, 12);
  for (const d of disciplines)
    assert.ok(d.query && d.services.length && d.skills.length);
});
for (const [id, title] of [
  ["video", "Видеомонтаж в DaVinci Resolve"],
  ["audio", "Озвучка подкаста"],
  ["translation", "Перевод текстов на русский"],
  ["marketplaces", "Оформить карточки товаров на Ozon"],
  ["analytics", "Аналитик данных Power BI"],
  ["assistance", "Бизнес-ассистент удалённо"],
  ["education", "Методист онлайн-обучения"],
]) {
  add(
    "Russian " + id + " discovery does not require developer keywords",
    () => {
      assert.equal(isRussianOpportunity({ title }), true);
      assert.ok(opportunityDisciplines({ title }).includes(id));
      assert.ok(!opportunityDisciplines({ title }).includes("development"));
    },
  );
}
add(
  "missing or malicious content cannot break discipline classification",
  () => {
    assert.equal(
      opportunityDisciplines({ title: {}, description: null }).length,
      0,
    );
    assert.ok(
      opportunityDisciplines({ title: "<b>Монтаж видео</b>" }).includes(
        "video",
      ),
    );
  },
);
add("presets keep user-entered skills and avoid duplicates", () => {
  assert.equal(
    mergeProfileSkills("Цветокоррекция; DaVinci Resolve", [
      "DaVinci Resolve",
      "Видеомонтаж",
    ]),
    "Цветокоррекция, DaVinci Resolve, Видеомонтаж",
  );
  assert.ok(
    mergeProfileSkills("А".repeat(999), ["DaVinci Resolve"]).length <= 1000,
  );
});
for (const [skill, title] of [
  ["DaVinci Resolve", "Монтаж видео в Давинчи Резолв"],
  ["Adobe Premiere Pro", "Монтаж видео в Премьер Про"],
  ["Power BI", "Дашборд в Пауэр Би"],
  ["Wildberries", "Карточки товаров Вайлдберриз"],
  ["Письменный перевод", "Перевод текстов"],
])
  add("scoring understands " + skill + " alias", () => {
    const result = scoreOpportunity(
      {
        headline: "",
        skillNames: [skill],
        serviceNames: [],
        preferredTypes: ["project"],
        currencyCode: "RUB",
      },
      { title, description: "Нужен специалист для проекта", type: "project" },
    );
    assert.ok(
      result.explanation.matched_keywords.length > 0,
      JSON.stringify(result.explanation),
    );
  });
add("channel rules preserve each channel type", () => {
  const rules = parseTelegramChannelRules(
    '[{"chatId":"-1001234567","type":"project"},{"chatId":"-1007654321","type":"job"}]',
  );
  assert.equal(rules[0].type, "project");
  assert.equal(rules[1].type, "job");
});
add("legacy channel config remains available", () =>
  assert.equal(
    parseTelegramChannelRules("", "-10012345,-10012345", "project").length,
    1,
  ),
);
for (const invalid of [
  "bad",
  "{}",
  '[{"chatId":"@name","type":"project"}]',
  '[{"chatId":"-10012345","type":"unknown"}]',
  '[{"chatId":"-10012345","type":"job"},{"chatId":"-10012345","type":"client"}]',
])
  add("invalid channel rules fail closed: " + invalid, () =>
    assert.throws(() =>
      parseTelegramChannelRules(invalid, "-1009999", "project"),
    ),
  );
add(
  "multi-profession HH searches are bounded and deduplicate across directions",
  async () => {
    let active = 0,
      maxActive = 0;
    const urls = [];
    const rows = new Map();
    const hhLoad = createTsLoader({
      fetch: async (input) => {
        const u = new URL(input);
        urls.push(u);
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "123",
                name: "Нужен специалист по монтажу видео",
                snippet: {
                  requirement: "Нужен видеомонтажёр с опытом работы.",
                },
              },
              {
                id: "999",
                name: "English editor required",
                snippet: { requirement: "We need an editor" },
              },
            ],
          }),
          { status: 200 },
        );
      },
    });
    const db = {
      from(table) {
        return {
          upsert(row) {
            if (table === "opportunity_sources")
              return {
                select() {
                  return { single: async () => ({ data: { id: "source" } }) };
                },
              };
            rows.set(row.canonical_key, row);
            return Promise.resolve({ error: null });
          },
        };
      },
    };
    const { importHhDiscovery } = hhLoad(path.join(root, "lib/sources/hh.ts"));
    const report = await importHhDiscovery(db);
    assert.equal(urls.length, 12);
    assert.ok(maxActive <= 3);
    assert.ok(maxActive > 1);
    assert.equal(rows.size, 1);
    assert.equal(
      report.reduce((n, r) => n + r.imported, 0),
      1,
    );
    for (const u of urls) {
      assert.equal(u.origin, "https://api.hh.ru");
      assert.equal(u.searchParams.get("per_page"), "5");
      assert.equal(u.searchParams.get("locale"), "RU");
    }
    assert.ok(
      urls.some((u) => u.searchParams.get("text").includes("видеомонтаж")),
    );
    assert.ok(urls.some((u) => u.searchParams.get("text").includes("диктор")));
    urls.length = 0;
    await importHhDiscovery(db, { disciplineIds: "video,audio" });
    assert.equal(urls.length, 2);
    urls.length = 0;
    await importHhDiscovery(db, { query: "моушн-дизайнер" });
    assert.equal(urls.length, 1);
    assert.equal(urls[0].searchParams.get("per_page"), "20");
    await assert.rejects(
      importHhDiscovery(db, { disciplineIds: "made-up" }),
      /Неизвестные направления/,
    );
  },
);
add("HH failure is visible per direction", async () => {
  const bad = createTsLoader({
    fetch: async () => new Response("", { status: 403 }),
  });
  const report = await bad(
    path.join(root, "lib/sources/hh.ts"),
  ).importHhDiscovery({}, { disciplineIds: "video" });
  assert.equal(report[0].imported, 0);
  assert.match(report[0].error, /403/);
});
const { setupTelegramWebhook } = load(
  path.join(root, "lib/telegram-webhook-setup.ts"),
);
const botConfig = {
  token: "123456:" + "a".repeat(30),
  secret: "s".repeat(40),
  siteUrl: "https://leadly.example",
  rules: [{ chatId: "-1001234567", type: "project" }],
  apply: false,
};
function botApi({ access = true } = {}) {
  const calls = [];
  const request = async (url, init) => {
    calls.push({
      method: new URL(url).pathname.split("/").at(-1),
      payload: JSON.parse(init.body),
      host: new URL(url).host,
    });
    const method = calls.at(-1).method;
    const result =
      method === "getMe"
        ? { id: 123456, is_bot: true, username: "test_leadly_bot" }
        : method === "getChat"
          ? { id: -1001234567, type: "channel", username: "test_channel" }
          : method === "getChatMember"
            ? { status: access ? "administrator" : "left" }
            : ["setWebhook", "setMyCommands", "setChatMenuButton"].includes(method)
              ? true
              : {
                  url: "https://leadly.example/api/telegram/webhook",
                  pending_update_count: 0,
                };
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  };
  return { calls, request };
}
add(
  "Telegram check validates channel access without changing webhook",
  async () => {
    const api = botApi();
    const result = await setupTelegramWebhook(botConfig, api.request);
    assert.equal(result.applied, false);
    assert.equal(result.configuredUrlMatches, true);
    assert.ok(api.calls.every((c) => c.host === "api.telegram.org"));
    assert.ok(!api.calls.some((c) => c.method === "setWebhook"));
  },
);
add(
  "Telegram setup preserves pending updates and signs incoming deliveries",
  async () => {
    const api = botApi();
    await setupTelegramWebhook({ ...botConfig, apply: true }, api.request);
    const call = api.calls.find((c) => c.method === "setWebhook");
    assert.ok(call);
    assert.equal(call.payload.drop_pending_updates, false);
    assert.equal(call.payload.secret_token, botConfig.secret);
    assert.deepEqual(Array.from(call.payload.allowed_updates), [
      "message", "channel_post", "callback_query",
    ]);
  },
);
add(
  "Telegram setup rejects channels without bot access before setWebhook",
  async () => {
    const api = botApi({ access: false });
    await assert.rejects(
      setupTelegramWebhook({ ...botConfig, apply: true }, api.request),
      /администратора/,
    );
    assert.ok(!api.calls.some((c) => c.method === "setWebhook"));
  },
);
add(
  "Telegram setup rejects missing credentials and local HTTP destinations",
  async () => {
    const api = botApi();
    await assert.rejects(
      setupTelegramWebhook({ ...botConfig, token: "" }, api.request),
      /BOT_TOKEN/,
    );
    await assert.rejects(
      setupTelegramWebhook(
        { ...botConfig, siteUrl: "http://localhost:3000" },
        api.request,
      ),
      /HTTPS/,
    );
    assert.equal(api.calls.length, 0);
  },
);
add("Telegram network failures do not disclose bot credentials", async () => {
  await assert.rejects(
    setupTelegramWebhook(botConfig, async () => {
      throw new Error(botConfig.token);
    }),
    (error) =>
      !error.message.includes(botConfig.token) &&
      error.message.includes("Telegram Bot API"),
  );
});
add("Telegram Mini App setup works without channel collection", async () => {
  const api = botApi();
  const result = await setupTelegramWebhook({ ...botConfig, rules: [], apply: true }, api.request);
  assert.equal(result.authorizedChannels, 0);
  assert.ok(api.calls.some(c => c.method === "setMyCommands"));
  const menu = api.calls.find(c => c.method === "setChatMenuButton");
  assert.equal(menu.payload.menu_button.web_app.url, "https://leadly.example/telegram");
});
add("Telegram setup refuses a different bot before mutations", async () => {
  const api = botApi();
  await assert.rejects(setupTelegramWebhook({ ...botConfig, expectedUsername: "another_bot", apply: true }, api.request), /другому боту/);
  assert.ok(!api.calls.some(c => ["setWebhook", "setChatMenuButton", "setMyCommands"].includes(c.method)));
});
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
    `RESULT ${tests.length - failed}/${tests.length} discovery checks passed`,
  );
  if (failed) process.exitCode = 1;
})();
