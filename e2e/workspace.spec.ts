import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("demo personalizes scores, saves, filters and changes status without a database", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/demo");
  await expect(
    page.getByText("Демонстрационное пространство.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".opportunity-feed-card")).toHaveCount(12);
  await page.getByRole("button", { name: "Разработка", exact: true }).click();
  await expect(
    page.locator(".opportunity-feed-card").first().locator("h3"),
  ).toContainText("React");
  const first = page.locator(".opportunity-feed-card").first();
  await first.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByRole("button", { name: "Сохранённые", exact: true }).click();
  await expect(page.locator(".opportunity-feed-card")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: /Статус возможности:/ })
    .selectOption("applied");
  await expect(page.locator(".score").last()).toContainText("Откликнулся");
  await page
    .getByRole("textbox", { name: "Поиск возможностей" })
    .fill("нет такого предложения");
  await expect(
    page.getByRole("heading", { name: "Ничего не найдено" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Поиск возможностей" }).fill("");
  await expect(page.locator(".opportunity-feed-card")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("auth offers login and recovery, missing configuration fails visibly", async ({
  page,
}) => {
  await page.goto("/auth");
  await page.getByRole("tab", { name: "Вход", exact: true }).click();
  await page
    .getByRole("button", { name: "Забыли пароль?", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Вернём доступ." }),
  ).toBeVisible();
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("test@example.com");
  await page.getByRole("button", { name: "Отправить ссылку" }).click();
  await expect(page.locator(".auth-message[role=alert]")).toContainText(
    "Подключение аккаунтов ещё не настроено",
  );
});

test("navigation is usable, tariff cards only appear in profile", async ({
  page,
  isMobile,
}) => {
  await page.goto("/demo");
  if (isMobile)
    await page.getByRole("button", { name: "Открыть меню" }).click();
  await page.getByRole("link", { name: "Источники", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Источники", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".plan-card")).toHaveCount(0);
  for (const route of [
    "/",
    "/crm",
    "/clients",
    "/analytics",
    "/revenue",
    "/settings",
    "/sources",
    "/ai-outreach",
  ]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator(".plan-card")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/profile");
  await expect(page.locator(".plan-card")).toHaveCount(4);
  await expect(page.locator(".plan-card").last()).toContainText("4 990");
  await expect(page.getByText(/Сейчас доступен бесплатный MVP/)).toBeVisible();
});

test("demo and auth have no WCAG A/AA violations", async ({ page }) => {
  for (const route of ["/demo", "/auth"]) {
    await page.goto(route);
    await page.locator("h1").waitFor();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});

test("API rejects unauthorized connectors and cross-origin AI, callback is not an open redirect", async ({
  request,
}) => {
  expect((await request.get("/api/cron/ingest")).status()).toBe(401);
  expect(
    (
      await request.post("/api/telegram/webhook", {
        data: { channel_post: { text: "fake" } },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/outreach", {
        headers: { origin: "https://evil.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  const callback = await request.get(
    "/auth/callback?next=https://evil.example",
    { maxRedirects: 0 },
  );
  expect(callback.status()).toBe(307);
  expect(callback.headers().location).toBe(
    "http://127.0.0.1:3100/auth?error=callback",
  );
});

test("dark theme, Russian font and sidebar remain readable on narrow and short screens", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 640 },
    { width: 1024, height: 600 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/demo");
    await page.locator(".opportunity-feed-card").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const style = await page.evaluate(() => ({
      font: getComputedStyle(document.body).fontFamily,
      size: parseFloat(getComputedStyle(document.body).fontSize),
      background: getComputedStyle(document.body).backgroundColor,
      loaded: Array.from(document.fonts).some(
        (f) => f.family.includes("Golos") && f.status === "loaded",
      ),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    expect(style.font).toContain("Golos");
    expect(style.loaded).toBe(true);
    expect(style.size).toBeGreaterThanOrEqual(16);
    expect(style.background).toBe("rgb(16, 16, 16)");
    expect(style.overflow).toBe(false);
    expect(
      parseFloat(
        await page
          .locator(".opportunity-description")
          .first()
          .evaluate((el) => getComputedStyle(el).fontSize),
      ),
    ).toBeGreaterThanOrEqual(16);
    if (viewport.width <= 700) {
      await page.getByRole("button", { name: "Открыть меню" }).click();
      await expect(
        page.getByRole("link", { name: "Настройки", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Открыть меню" }),
      ).toBeFocused();
    }
  }
});

test("social providers are visible and unavailable ones fail closed without credentials", async ({
  page,
  request,
}) => {
  await page.goto("/auth");
  for (const name of ["Google", "GitHub", "VK ID", "Яндекс ID"])
    await expect(
      page.getByRole("button", { name: new RegExp(name) }),
    ).toBeDisabled();
  const response = await request.get("/auth/social/google", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe(
    "http://127.0.0.1:3100/auth?error=provider",
  );
  const invalid = await request.get("/auth/social/unknown", {
    maxRedirects: 0,
  });
  expect(invalid.headers().location).toBe(
    "http://127.0.0.1:3100/auth?error=provider",
  );
  await page.goto("/auth?error=provider");
  await expect(page.locator(".auth-message[role=alert]")).toContainText(
    "Этот способ входа пока недоступен",
  );
});

test("profession filter finds video, sound, translations and assistance without development", async ({
  page,
}) => {
  await page.goto("/demo");
  const select = page.getByRole("combobox", { name: "Направление заданий" });
  for (const [id, title] of [
    ["video", "Монтаж Reels"],
    ["audio", "Озвучка"],
    ["translation", "Перевод"],
    ["marketplaces", "Ozon"],
    ["analytics", "Power BI"],
    ["assistance", "бизнес-ассистент"],
    ["education", "образовательных"],
  ]) {
    await select.selectOption(id);
    await expect(
      page
        .locator(".opportunity-feed-card")
        .filter({ has: page.locator("h3", { hasText: title }) }),
    ).toHaveCount(1);
    expect(
      await page.locator(".opportunity-feed-card").count(),
    ).toBeGreaterThanOrEqual(1);
  }
  await select.selectOption("all");
  await expect(page.locator(".opportunity-feed-card")).toHaveCount(12);
  await page.goto("/sources");
  await expect(
    page.getByRole("heading", { name: "Kwork", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Telegram: кандидаты для подключения",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "@finder_vc" })).toHaveAttribute(
    "href",
    "https://t.me/finder_vc",
  );
});
