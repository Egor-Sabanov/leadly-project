const assert = require("node:assert/strict"),
  path = require("node:path");
const { createTsLoader } = require("./ts-loader.cjs");
const load = createTsLoader({ URLSearchParams });
const api = load(path.join(__dirname, "../lib/vk-account-oauth.ts"));
const { sealVKFlow } = load(path.join(__dirname, "../lib/vk-oauth.ts"));
const c = {
  clientId: "54837022",
  secret: "1a".repeat(32),
  site: "https://app.example",
  supabase: "https://auth.example",
};
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  now = 2000000000;
const tests = [],
  test = (name, run) => tests.push([name, run]);
function flow(mode = "connect", actor = a, changes = {}) {
  const started = api.startVKAccountFlow(
      c,
      mode,
      mode === "connect" ? actor : null,
      now,
    ),
    url = new URL(started.url),
    state = url.searchParams.get("state");
  const request = new Request(
    c.site +
      "/auth/vk/callback?" +
      new URLSearchParams({
        state,
        code: "synthetic-code-1234",
        device_id: "synthetic-device-1234",
        ...changes,
      }),
    { headers: { cookie: started.cookie.split(";")[0] } },
  );
  return { started, url, state, request };
}
function provider(calls) {
  return async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    assert(!String(url).includes("access_token="));
    if (url === "https://id.vk.ru/oauth2/auth")
      return Response.json({
        access_token: "a".repeat(64),
        expires_in: 3600,
        state: init.body.get("state"),
        refresh_token: "never-store",
      });
    assert.equal(url, "https://id.vk.ru/oauth2/user_info");
    return Response.json({
      user: {
        user_id: "101",
        email: "own@example.com",
        first_name: "Имя",
        phone: "private",
      },
    });
  };
}
test("connect flow requires a valid authenticated actor; signin flow cannot carry an actor", () => {
  for (const id of [null, "", b + "x"])
    assert.throws(() => api.startVKAccountFlow(c, "connect", id, now));
  assert.throws(() => api.startVKAccountFlow(c, "signin", a, now));
});
test("native flow fixes destination and app callback with S256 and no unnecessary email scope", () => {
  const { started, url } = flow();
  assert.equal(url.origin + url.pathname, "https://id.vk.ru/authorize");
  assert.equal(url.searchParams.get("client_id"), c.clientId);
  assert.equal(
    url.searchParams.get("redirect_uri"),
    c.site + "/auth/vk/callback",
  );
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.has("scope"), false);
  for (const flag of [
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=300",
    "Path=/",
  ])
    assert(started.cookie.includes(flag));
  assert(!started.cookie.includes(a));
  assert(!started.cookie.includes(url.searchParams.get("state")));
});
test("independent starts generate distinct state, encrypted cookies and PKCE challenges", () => {
  const x = flow(),
    y = flow();
  assert.notEqual(x.state, y.state);
  assert.notEqual(x.started.cookie, y.started.cookie);
  assert.notEqual(
    x.url.searchParams.get("code_challenge"),
    y.url.searchParams.get("code_challenge"),
  );
});
test("connect proof verifies actor, device, state and PKCE before returning the stable VK ID", async () => {
  const x = flow(),
    calls = [];
  const proof = await api.verifyVKAccountReturn(
    x.request,
    c,
    a,
    provider(calls),
    now,
  );
  assert.equal(proof.vkId, "101");
  assert.equal(proof.flow.actor, a);
  assert.equal(proof.flow.mode, "connect");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.body.get("device_id"), "synthetic-device-1234");
  assert.equal(calls[0].init.body.get("code"), "synthetic-code-1234");
  assert.equal(calls[0].init.body.get("state"), x.state);
  assert.equal(calls[1].init.body.get("client_id"), c.clientId);
  assert(!JSON.stringify(proof).includes("a".repeat(64)));
  assert(!JSON.stringify(proof).includes("own@example.com"));
});
test("a signed-in account switch cannot claim a proof started by another actor", async () => {
  let calls = 0;
  assert.equal(
    await api.verifyVKAccountReturn(
      flow().request,
      c,
      b,
      async () => {
        calls++;
        throw Error();
      },
      now,
    ),
    null,
  );
  assert.equal(calls, 0);
});
test("login mode proves VK without acquiring connect privileges or an actor", async () => {
  const proof = await api.verifyVKAccountReturn(
    flow("signin").request,
    c,
    null,
    provider([]),
    now,
  );
  assert.equal(proof.flow.mode, "signin");
  assert.equal(proof.flow.actor, null);
});
test("wrong state, cancellation, missing device and unicode parameters do not call VK", async () => {
  let calls = 0;
  for (const changes of [
    { state: "lvk_" + "x".repeat(43) },
    { error: "access_denied" },
    { device_id: "" },
    { state: "lvk_" + "ё".repeat(43) },
  ])
    assert.equal(
      await api.verifyVKAccountReturn(
        flow("connect", a, changes).request,
        c,
        a,
        async () => {
          calls++;
          throw Error();
        },
        now,
      ),
      null,
    );
  assert.equal(calls, 0);
});
test("duplicate query values and cookies fail closed", async () => {
  const x = flow(),
    u = new URL(x.request.url);
  u.searchParams.append("state", x.state);
  const cookie = x.started.cookie.split(";")[0];
  for (const request of [
    new Request(u, { headers: { cookie } }),
    new Request(x.request.url, { headers: { cookie: cookie + "; " + cookie } }),
  ])
    assert.equal(
      await api.verifyVKAccountReturn(
        request,
        c,
        a,
        async () => {
          throw Error("must not call");
        },
        now,
      ),
      null,
    );
});
test("expired or tampered cookies and cross-key or cross-client replay cannot be used", async () => {
  const x = flow();
  assert.equal(api.readVKAccountFlow(x.request, c, now + 300), null);
  assert.equal(
    api.readVKAccountFlow(x.request, { ...c, secret: "2b".repeat(32) }, now),
    null,
  );
  assert.equal(
    api.readVKAccountFlow(x.request, { ...c, clientId: "99999999" }, now),
    null,
  );
  assert.equal(
    api.readVKAccountFlow(
      new Request(x.request.url, {
        headers: {
          cookie: x.started.cookie.split(";")[0].slice(0, -8) + "wrongend",
        },
      }),
      c,
      now,
    ),
    null,
  );
});
test("provider-browser capsules cannot be substituted for native account proofs", () => {
  const value = sealVKFlow(
    c,
    "browser",
    {
      mode: "connect",
      actor: a,
      state: "lvk_" + "s".repeat(43),
      verifier: "v".repeat(43),
    },
    now,
  );
  assert.equal(
    api.readVKAccountFlow(
      new Request(c.site, {
        headers: { cookie: api.VK_ACCOUNT_COOKIE + "=" + value },
      }),
      c,
      now,
    ),
    null,
  );
});
test("cookie reader rejects ambiguous values and preserves a single opaque receipt", () => {
  const t = "t".repeat(43),
    name = api.VK_RECEIPT_COOKIE;
  assert.equal(
    api.vkCookie(
      new Request(c.site, { headers: { cookie: name + "=" + t } }),
      name,
    ),
    t,
  );
  assert.equal(
    api.vkCookie(
      new Request(c.site, {
        headers: { cookie: name + "=" + t + "; " + name + "=" + t },
      }),
      name,
    ),
    "",
  );
  assert.equal(api.vkCookie(new Request(c.site), name), "");
});
test("receipt hashing is deterministic, one-way and stores no token text", () => {
  const token = "t".repeat(43),
    hash = api.vkReceiptHash(token);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, api.vkReceiptHash(token));
  assert.notEqual(hash, api.vkReceiptHash(token + "x"));
  assert(!hash.includes(token));
});
test("upstream token rejection or missing stable identity never produces an account proof", async () => {
  for (const response of [
    new Response("private", { status: 401 }),
    Response.json({ error: "private" }),
    Response.json({
      access_token: "a".repeat(64),
      state: "wrong",
      expires_in: 3600,
    }),
  ])
    assert.equal(
      await api.verifyVKAccountReturn(
        flow().request,
        c,
        a,
        async () => response,
        now,
      ),
      null,
    );
  const base = provider([]);
  assert.equal(
    await api.verifyVKAccountReturn(
      flow().request,
      c,
      a,
      async (url, init) =>
        url.endsWith("user_info")
          ? Response.json({ user: {} })
          : base(url, init),
      now,
    ),
    null,
  );
});
test("linked identity proof does not need or pretend to verify a VK email", async () => {
  const base = provider([]);
  const proof = await api.verifyVKAccountReturn(
    flow().request,
    c,
    a,
    async (url, init) =>
      url.endsWith("user_info")
        ? Response.json({ user: { user_id: "101", first_name: "Имя" } })
        : base(url, init),
    now,
  );
  assert.equal(proof.vkId, "101");
  assert.equal(proof.name, "Имя");
  assert.equal(Object.hasOwn(proof, "email"), false);
  assert.equal(Object.hasOwn(proof, "email_verified"), false);
});
(async () => {
  let failures = 0;
  for (const [name, run] of tests) {
    try {
      await run();
      console.log("PASS " + name);
    } catch (e) {
      failures++;
      console.error("FAIL " + name + ": " + e.message);
    }
  }
  console.log(
    `RESULT ${tests.length - failures}/${tests.length} VK account OAuth checks passed`,
  );
  if (failures) process.exitCode = 1;
})();
