const assert = require("node:assert/strict");
const { siteOrigin, probeDeployment } = require("./deployment-probe.cjs");
const origin = "https://leadly.example",
  supabase = "https://project.supabase.co";
const authHeaders = {
  "Content-Type": "text/html",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
const redirect = (location) =>
  new Response(null, { status: 307, headers: { Location: location } });
function fixture(overrides = {}) {
  return async (input, init) => {
    assert.equal(init.redirect, "manual");
    assert.ok(init.signal);
    const url = new URL(input),
      path = url.pathname + url.search;
    assert.equal(url.origin, origin);
    if (Object.hasOwn(overrides, path)) return overrides[path]();
    if (path === "/auth")
      return new Response(
        '<html lang="ru"><h1>LEADLY</h1><link href="/_next/static/app.css?dpl=test"></html>',
        { headers: authHeaders },
      );
    if (path === "/privacy")
      return new Response("Обработка персональных данных");
    if (path.startsWith("/_next/static/"))
      return new Response("css", { headers: { "Content-Type": "text/css" } });
    if (path === "/" || path === "/profile") return redirect(origin + "/auth");
    if (path.startsWith("/api/")) return new Response("{}", { status: 401 });
    if (path.startsWith("/auth/callback"))
      return redirect(
        origin +
          "/auth?error=" +
          (path.includes("access_denied") ? "oauth" : "callback"),
      );
    return redirect(origin + "/auth?error=provider");
  };
}
function google(to = supabase) {
  const url = new URL(to + "/auth/v1/authorize");
  url.search = new URLSearchParams({
    provider: "google",
    redirect_to: origin + "/auth/callback",
    code_challenge: "a".repeat(43),
    code_challenge_method: "s256",
  });
  return new Response(null, {
    status: 307,
    headers: {
      Location: url.href,
      "Set-Cookie":
        "sb-project-auth-token-code-verifier=test; Path=/; HttpOnly; Secure",
    },
  });
}
(async () => {
  let count = 0;
  async function test(name, fn) {
    await fn();
    count++;
    console.log("PASS " + name);
  }
  await test("accepts exact HTTPS origins and rejects ambiguous production URLs", () => {
    assert.equal(siteOrigin(origin), origin);
    for (const url of [
      "http://leadly.example",
      "https://user:password@leadly.example",
      origin + "/app",
      origin + "?key=secret",
      origin + "#fragment",
      origin + ":8443",
      "http://localhost:3000",
      "https://127.0.0.1",
    ])
      assert.throws(() => siteOrigin(url));
    assert.equal(
      siteOrigin("http://127.0.0.1:3000", true),
      "http://127.0.0.1:3000",
    );
  });
  await test("read-only deployment passes transport checks while disabled Google stays pending", async () => {
    const report = await probeDeployment(origin, { fetcher: fixture() });
    assert.equal(report.transportReady, true);
    assert.equal(report.realUserSignInVerified, false);
    assert.equal(
      report.checks.find((c) => c.id === "google_oauth").status,
      "pending",
    );
    assert.equal(
      report.checks.find((c) => c.id === "static_asset").status,
      "pass",
    );
  });
  await test("an unavailable or protected deployment fails before private checks", async () => {
    const report = await probeDeployment(origin, {
      fetcher: fixture({
        "/auth": () => new Response("Locked", { status: 401 }),
      }),
    });
    assert.equal(report.transportReady, false);
    assert.equal(report.checks.length, 1);
    assert.equal(report.checks[0].status, "fail");
  });
  await test("TLS and network failures never count as readiness", async () => {
    const report = await probeDeployment(origin, {
      fetcher: async () => {
        throw new Error("TLS unavailable");
      },
    });
    assert.equal(report.transportReady, false);
  });
  await test("oversized HTML is bounded", async () => {
    const report = await probeDeployment(origin, {
      fetcher: fixture({
        "/auth": () =>
          new Response("LEADLY".repeat(200000), { headers: authHeaders }),
      }),
    });
    assert.equal(report.transportReady, false);
  });
  await test("a private page rendered without session fails", async () => {
    const report = await probeDeployment(origin, {
      fetcher: fixture({ "/profile": () => new Response("Private dashboard") }),
    });
    assert.equal(report.transportReady, false);
  });
  await test("a callback sent to localhost or foreign domain fails", async () => {
    for (const host of ["http://localhost:3000", "https://foreign.example"]) {
      const report = await probeDeployment(origin, {
        fetcher: fixture({
          "/auth/callback?next=https://example.invalid": () =>
            redirect(host + "/auth?error=callback"),
        }),
      });
      assert.equal(report.transportReady, false);
    }
  });
  await test("missing session guards on avatar or tasks API fail", async () => {
    for (const path of ["/api/profile/avatar", "/api/tasks"]) {
      const report = await probeDeployment(origin, {
        fetcher: fixture({ [path]: () => new Response("{}") }),
      });
      assert.equal(report.transportReady, false);
    }
  });
  await test("valid Google redirect checks PKCE, expected Supabase, cookie and local callback", async () => {
    const report = await probeDeployment(origin, {
      fetcher: fixture({ "/auth/social/google": () => google() }),
      supabaseOrigin: supabase,
    });
    assert.equal(report.transportReady, true);
    assert.equal(report.realUserSignInVerified, false);
    assert.equal(
      report.checks.find((c) => c.id === "google_oauth").status,
      "pass",
    );
  });
  await test("foreign Google destination or wrong Supabase project fails", async () => {
    for (const host of ["https://evil.example", "https://other.supabase.co"]) {
      const report = await probeDeployment(origin, {
        fetcher: fixture({ "/auth/social/google": () => google(host) }),
        supabaseOrigin: supabase,
      });
      assert.equal(report.transportReady, false);
    }
  });
  await test("missing verifier cookie fails without exposing OAuth parameters", async () => {
    const report = await probeDeployment(origin, {
      fetcher: fixture({
        "/auth/social/google": () => {
          const response = google();
          response.headers.delete("set-cookie");
          return response;
        },
      }),
      supabaseOrigin: supabase,
    });
    assert.equal(report.transportReady, false);
    assert.ok(!JSON.stringify(report).includes("code_challenge="));
  });
  await test("bad security headers and a missing build asset fail", async () => {
    const report = await probeDeployment(origin, {
      fetcher: fixture({
        "/auth": () =>
          new Response("<h1>LEADLY</h1>", {
            headers: { "Content-Type": "text/html" },
          }),
      }),
    });
    assert.equal(report.transportReady, false);
    assert.ok(report.checks.filter((c) => c.status === "fail").length >= 3);
  });
  console.log(`RESULT ${count}/${count} deployment checks passed`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
