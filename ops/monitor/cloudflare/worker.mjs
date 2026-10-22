import core from "../core.cjs";
import { DurableObject } from "cloudflare:workers";

const site = "https://leadly-topaz-seven.vercel.app";

// The object has no public route. Only the scheduled event can call its binding.
const worker = {
  fetch() {
    return new Response("Not found", { status: 404 });
  },
  scheduled(_event, env, ctx) {
    const id = env.OWNER_MONITOR.idFromName("leadly-owner-monitor-v1");
    ctx.waitUntil((async () => {
      const response = await env.OWNER_MONITOR.get(id).fetch("https://monitor.internal/check", { method: "POST" });
      const report = await response.json();
      console.log(JSON.stringify(report));
      if (!response.ok) throw new Error("owner_monitor_requires_attention");
    })());
  },
};

export default worker;

export class OwnerMonitor extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.inFlight = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/check") return new Response("Not found", { status: 404 });
    // A Durable Object has one active instance. Coalesce overlapping ticks;
    // persist the send intent before Telegram so a restart cannot repeat it.
    if (!this.inFlight) {
      this.inFlight = this.check().finally(() => { this.inFlight = null; });
    }
    try {
      const result = await this.inFlight;
      const healthy = result.status === "ok" && result.notification === "none";
      // A successful recovery notification also means the check succeeded.
      return Response.json(result, { status: healthy || (result.status === "ok" && result.notification === "sent") ? 200 : 503 });
    } catch {
      return Response.json({ error: "owner_monitor_failed" }, { status: 503 });
    }
  }

  async check() {
    const testId = this.env.MONITOR_SETUP_TEST_ID;
    if (testId && !/^[a-zA-Z0-9_-]{1,64}$/.test(testId)) throw new Error("invalid_setup_test_id");
    const test = Boolean(testId && await this.ctx.storage.get("setupTestId") !== testId);
    // Explicit activation test: consume once before any send, including crashes
    // and rate limits. An operator can request another attempt with a new ID.
    if (test) await this.ctx.storage.put("setupTestId", testId);
    return core.runMonitor({
      site,
      token: this.env.TELEGRAM_BOT_TOKEN,
      chatId: this.env.TELEGRAM_CHAT_ID,
      loadState: () => this.ctx.storage.get("state"),
      saveState: state => this.ctx.storage.put("state", state),
      test,
    });
  }
}
