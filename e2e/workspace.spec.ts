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
  await expect(page.locator(".opportunity-feed-card")).toHaveCount(5);
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
