import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/browser-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command:
      "npm run build && npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/auth",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      LEADLY_SITE_URL: "http://127.0.0.1:3100",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      CRON_SECRET: "",
      LEADLY_AI_API_KEY: "",
      TELEGRAM_WEBHOOK_SECRET: "",
      TELEGRAM_ALLOWED_CHAT_IDS: "",
      LEADLY_RSS_FEEDS: "",
      FREELANCEHUNT_API_TOKEN: "",
      HH_API_TOKEN: "",
      LEADLY_HH_ENABLED: "false",
      LEADLY_VK_AUTH_PROVIDER: "",
      LEADLY_YANDEX_AUTH_PROVIDER: "",
    },
  },
});
