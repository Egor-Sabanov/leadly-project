import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }, testInfo) => {
  if (!testInfo.title.includes("cookies"))
    await page.addInitScript(() =>
      localStorage.setItem("leadly-cookie-notice", "necessary-v1"),
    );
});

test("cookies notice is readable, remembered and can be reopened without enabling tracking", async ({
  page,
}) => {
  await page.goto("/auth");
  const notice = page.getByRole("region", { name: "Использование cookies" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(
    "Рекламных cookies и сторонних трекеров у нас нет",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await notice.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(notice).toHaveCount(0);
  await page.goto("/privacy#cookies");
  await page
    .getByRole("button", { name: "Настройки cookies", exact: true })
    .click();
  await expect(notice).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await notice.getByRole("button", { name: "Понятно", exact: true }).click();
  expect(
    await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--cookie-notice-space"),
    ),
  ).toBe("");
});

test("cookies notice still closes when local storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.goto("/auth");
  const notice = page.getByRole("region", { name: "Использование cookies" });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await page.getByRole("tab", { name: "Вход", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "С возвращением." }),
  ).toBeVisible();
});

test("dropdown keeps native keyboard selection and dark theme", async ({
  page,
  isMobile,
}) => {
  await page.goto("/demo");
  if (isMobile)
    await page.getByRole("button", { name: "Фильтры", exact: true }).click();
  const control = page.getByRole("combobox", { name: "Направление заданий" });
  await control.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  expect(await control.inputValue()).not.toBe("all");
  expect(await control.evaluate((e) => getComputedStyle(e).colorScheme)).toBe(
    "dark",
  );
  await control.selectOption("all");
  await expect(page.locator(".opportunity-feed-card")).toHaveCount(12);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

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

test("email confirmation is a separate compact form without a password", async ({ page }) => {
  await page.goto("/auth?mode=confirm");
  await expect(page.getByRole("heading", { name: "Подтверди почту." })).toBeVisible();
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("test@example.com");
  await page.getByRole("button", { name: "Отправить письмо повторно", exact: true }).click();
  await expect(page.locator(".auth-message[role=alert]")).toContainText("Подключение аккаунтов ещё не настроено");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("unverified social email callback gives confirmation guidance without leaking provider text", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied&error_code=provider_email_needs_verification&error_description=private-data&next=https://evil.example");
  await expect(page).toHaveURL("http://127.0.0.1:3100/auth?error=email_verification&mode=confirm");
  await expect(page.getByRole("heading", { name: "Подтверди почту." })).toBeVisible();
  await expect(page.locator(".auth-message[role=status]")).toContainText("снова нажми кнопку своего сервиса");
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveCount(0);
  await expect(page.locator(".auth-message[role=alert]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Отправить письмо повторно", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("private-data");
});

test("malformed email links expose no token or automatic confirmation", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/auth/v1/verify")) requests.push(request.url()); });
  const response = await page.goto("/auth/confirm?token_hash=invalid&type=invite");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page).toHaveURL("http://127.0.0.1:3100/auth/confirm");
  await expect(page.getByText("В ссылке не хватает данных или она повреждена. Запроси новое письмо.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Подтвердить и продолжить" })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("navigation is usable, tariff cards only appear in profile", async ({
  page,
  isMobile,
}) => {
  await page.goto("/demo");
  if (isMobile)
    await page.getByRole("button", { name: "Открыть меню" }).click();
  await expect(
    page.getByRole("link", { name: "Источники", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Настройки", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Настройки", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".plan-card")).toHaveCount(0);
  for (const route of [
    "/",
    "/crm",
    "/clients",
    "/analytics",
    "/revenue",
    "/settings",
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
  await page.goto("/profile/plans");
  await expect(page.locator(".plan-card")).toHaveCount(4);
  await expect(page.locator(".plan-card").last()).toContainText("4 990");
  await expect(page.getByText(/Бесплатный план уже доступен/)).toBeVisible();
});

test("demo and auth have no WCAG A/AA violations", async ({ page }) => {
  for (const route of ["/demo", "/auth"]) {
    await page.goto(route);
    await page.locator("h1").waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      );
    });
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

test("unavailable social providers are hidden and their endpoints fail closed", async ({
  page,
  request,
}) => {
  await page.goto("/auth");
  await expect(page.locator(".social-auth-button")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Вход через сервисы" })).toHaveCount(0);
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
  isMobile,
}) => {
  await page.goto("/demo");
  if (isMobile) {
    await page.getByRole("button", { name: "Фильтры", exact: true }).click();
  }
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
  // Next streams its not-found UI with 200 when the loading boundary already flushed.
  await page.goto("/sources");
  await expect(
    page.locator('meta[name="robots"][content*="noindex"]').first(),
  ).toBeAttached();
  await expect(page.locator(".source-card")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Здесь пока нет возможности.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kwork", exact: true }),
  ).toHaveCount(0);
});

test("registration requires data notice acknowledgement; providers stay icon-only and accessible", async ({
  page,
}) => {
  await page.goto("/auth");
  await page
    .getByRole("textbox", { name: "Как к тебе обращаться" })
    .fill("Проверка");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("test@example.com");
  await page.getByLabel("Пароль", { exact: true }).fill("example-password");
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/auth/v1/signup")) requests.push(request.url());
  });
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  const acknowledgement = page.getByRole("checkbox", { name: /Я ознакомился/ });
  await expect(acknowledgement).not.toBeChecked();
  expect(
    await acknowledgement.evaluate(
      (element: HTMLInputElement) => element.validity.valueMissing,
    ),
  ).toBe(true);
  expect(requests).toEqual([]);
  await acknowledgement.check();
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page.locator(".auth-message[role=alert]")).toContainText(
    "Подключение аккаунтов ещё не настроено",
  );
  for (const button of await page.locator(".social-auth-button").all()) {
    await expect(button).toHaveAttribute(
      "aria-label",
      /Google|GitHub|VK|Яндекс/,
    );
    expect((await button.innerText()).trim()).toMatch(/^(vk|Я)?$/);
  }
  await expect(page.getByRole("link", { name: /Посмотреть демо/ })).toHaveCount(
    0,
  );
});

test("brand motion stays active without a pause button and remains gentle with reduced motion", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("leadly.motion.paused", "true"),
  );
  await page.goto("/auth");
  await expect(page.getByRole("button", { name: /анимаци/i })).toHaveCount(0);
  expect(
    await page
      .locator(".brand-atmosphere span")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).not.toBe("none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".brand-atmosphere span")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("icon-breathe");
  await expect(page.locator(".story-reveal")).toBeVisible();
});
