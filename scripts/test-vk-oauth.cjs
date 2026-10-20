const assert = require("node:assert/strict"),
  path = require("node:path"),
  { createHash } = require("node:crypto");
const { createTsLoader } = require("./ts-loader.cjs");
const {
  vkAuthorize,
  vkCallback,
  vkToken,
  vkUserinfo,
  vkClaims,
  vkConfig,
  VK_FLOW_COOKIE,
} = createTsLoader({ Buffer, URLSearchParams })(
  path.join(__dirname, "../lib/vk-oauth.ts"),
);
const tests = [],
  test = (name, run) => tests.push([name, run]);
const config = {
  clientId: "54837022",
  secret: "1a".repeat(32),
  site: "https://app.example",
  supabase: "https://auth.example",
};
const now = 2000000000,
  state = "synthetic-state-" + "s".repeat(50),
  verifier = "v".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("base64url");
function begin(changes = {}) {
  const p = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.supabase + "/auth/v1/callback",
    response_type: "code",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...changes,
  });
  return vkAuthorize(
    new Request(config.site + "/api/auth/vk/authorize?" + p),
    config,
    now,
  );
}
function flow(changes = {}, seconds = 0) {
  const started = begin(),
    cookie = started.headers.get("set-cookie").split(";")[0];
  return vkCallback(
    new Request(
      config.site +
        "/auth/vk/callback?" +
        new URLSearchParams({
          state,
          code: "synthetic-code-1234",
          device_id: "synthetic-device-1234",
          ...changes,
        }),
      { headers: { cookie } },
    ),
    config,
    now + seconds,
  );
}
function exchange(changes = {}, auth = true, bodyAuth = false) {
  const code = new URL(flow().headers.get("location")).searchParams.get("code");
  return new Request(config.site + "/api/auth/vk/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(auth && !bodyAuth
        ? {
            authorization:
              "Basic " +
              Buffer.from(config.clientId + ":" + config.secret).toString(
                "base64",
              ),
          }
        : {}),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      redirect_uri: config.supabase + "/auth/v1/callback",
      code,
      code_verifier: verifier,
      ...(bodyAuth
        ? { client_id: config.clientId, client_secret: config.secret }
        : {}),
      ...changes,
    }),
  });
}
test("disabled configuration never starts an OAuth or network request", async () => {
  assert.equal(vkConfig(), null);
  for (const run of [
    () => vkAuthorize(new Request(config.site), null),
    () => vkCallback(new Request(config.site), null),
    () => vkToken(exchange(), null),
    () => vkUserinfo(new Request(config.site), null),
  ])
    assert.equal((await run()).status, 503);
});
test("authorization fixes VK destination and preserves S256 with a secure encrypted browser cookie", () => {
  const r = begin(),
    u = new URL(r.headers.get("location"));
  assert.equal(r.status, 303);
  assert.equal(u.origin + u.pathname, "https://id.vk.ru/authorize");
  assert.equal(
    u.searchParams.get("redirect_uri"),
    config.site + "/auth/vk/callback",
  );
  assert.equal(u.searchParams.get("code_challenge"), challenge);
  assert.equal(u.searchParams.get("scope"), "email");
  const cookie = r.headers.get("set-cookie");
  for (const flag of [
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=300",
  ])
    assert(cookie.includes(flag));
  assert(!cookie.includes(state));
  assert(r.headers.get("cache-control").includes("no-store"));
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
});
test("rejects changed client, callback, response type, weak PKCE and oversized state", () => {
  for (const changes of [
    { client_id: "123" },
    { redirect_uri: "https://evil.example" },
    { response_type: "token" },
    { code_challenge_method: "plain" },
    { code_challenge: "bad" },
    { state: "s".repeat(1801) },
    { state: "x" },
  ])
    assert.equal(begin(changes).status, 400);
});
test("duplicate authorization parameters fail closed", () => {
  const u = new URL(
    config.site +
      "/api/auth/vk/authorize?" +
      new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.supabase + "/auth/v1/callback",
        response_type: "code",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }),
  );
  u.searchParams.append("state", state);
  assert.equal(vkAuthorize(new Request(u), config, now).status, 400);
});
test("callback sends only an encrypted code envelope to the fixed Supabase callback and clears cookie", () => {
  const r = flow(),
    u = new URL(r.headers.get("location"));
  assert.equal(u.origin + u.pathname, config.supabase + "/auth/v1/callback");
  assert.equal(u.searchParams.get("state"), state);
  assert(!u.searchParams.get("code").includes("synthetic-code"));
  assert(r.headers.get("set-cookie").includes("Max-Age=0"));
  assert.deepEqual([...u.searchParams.keys()].sort(), ["code", "state"]);
});
test("callback rejects wrong state, missing device, provider error and expired flow without reflecting text", () => {
  for (const r of [
    flow({ state: "foreign-state" }),
    flow({ device_id: "" }),
    flow({ error: "access_denied", error_description: "private-error" }),
    flow({}, 300),
    vkCallback(
      new Request(config.site + "/auth/vk/callback?state=" + state),
      config,
      now,
    ),
  ])
    assert.equal(r.headers.get("location"), config.site + "/auth?error=oauth");
});
test("tampered or duplicated cookies cannot authorize a callback", () => {
  const good = begin().headers.get("set-cookie").split(";")[0];
  for (const cookie of [good.slice(0, -8) + "wrongend", good + "; " + good]) {
    const r = vkCallback(
      new Request(
        config.site +
          "/auth/vk/callback?" +
          new URLSearchParams({
            state,
            code: "synthetic-code-1234",
            device_id: "device",
          }),
        { headers: { cookie } },
      ),
      config,
      now,
    );
    assert.equal(r.headers.get("location"), config.site + "/auth?error=oauth");
  }
});
test("token endpoint requires server authentication before calling VK", async () => {
  let calls = 0;
  const never = async () => {
    calls++;
    throw Error();
  };
  for (const request of [
    exchange({}, false),
    exchange({ client_id: config.clientId, client_secret: "wrong" }, false),
    new Request(config.site, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  ])
    assert(
      [400, 401].includes((await vkToken(request, config, never, now)).status),
    );
  assert.equal(calls, 0);
});
test("token endpoint rejects forged envelopes, changed verifier, callback and unsupported grants before network", async () => {
  let calls = 0;
  const never = async () => {
    calls++;
    throw Error();
  };
  for (const changes of [
    { code: "fake-code" },
    { code_verifier: "z".repeat(64) },
    { redirect_uri: "https://evil.example" },
    { grant_type: "refresh_token" },
  ])
    assert.equal(
      (await vkToken(exchange(changes), config, never, now)).status,
      400,
    );
  assert.equal(calls, 0);
});
test("successful authenticated exchange sends device, verifier and real callback only to fixed VK", async () => {
  for (const bodyAuth of [false, true]) {
    const r = await vkToken(
      exchange({}, true, bodyAuth),
      config,
      async (url, init) => {
        assert.equal(url, "https://id.vk.ru/oauth2/auth");
        assert.equal(init.method, "POST");
        assert.equal(init.redirect, "error");
        assert.equal(init.cache, "no-store");
        assert.equal(init.body.get("code"), "synthetic-code-1234");
        assert.equal(init.body.get("device_id"), "synthetic-device-1234");
        assert.equal(init.body.get("code_verifier"), verifier);
        assert.equal(
          init.body.get("redirect_uri"),
          config.site + "/auth/vk/callback",
        );
        assert(!init.body.has("client_secret"));
        assert.equal(init.body.get("state"), state);
        return Response.json({
          access_token: "a".repeat(64),
          state,
          expires_in: 3600,
          refresh_token: "never-persist",
          id_token: "never-persist",
        });
      },
      now,
    );
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.deepEqual(Object.keys(body).sort(), [
      "access_token",
      "expires_in",
      "token_type",
    ]);
    assert.equal(body.token_type, "Bearer");
  }
});
test("token rejection, invalid upstream state and provider secrets never leak", async () => {
  const responses = [
    Response.json({
      access_token: "a".repeat(64),
      state: "wrong",
      expires_in: 3600,
    }),
    Response.json({ access_token: "a".repeat(64), state, expires_in: -1 }),
    Response.json({ error: "private-provider-secret" }),
    new Response("private-provider-secret", { status: 400 }),
    new Response("private-provider-secret", { status: 500 }),
    new Response("private-provider-secret", { status: 429 }),
  ];
  for (const response of responses) {
    const r = await vkToken(exchange(), config, async () => response, now);
    assert([400, 503].includes(r.status));
    assert(!(await r.text()).includes("private-provider"));
  }
});
test("expired encrypted code and a capsule from another client or key fail closed", async () => {
  for (const [c, t] of [
    [config, now + 300],
    [{ ...config, clientId: "99999999" }, now],
    [{ ...config, secret: "2b".repeat(32) }, now],
  ])
    assert(
      [400, 401].includes(
        (
          await vkToken(
            exchange(),
            c,
            async () => {
              throw Error("must not call");
            },
            t,
          )
        ).status,
      ),
    );
});
test("no ambiguous duplicate token parameters are accepted", async () => {
  const req = exchange(),
    text = await req.text();
  for (const extra of [
    "&code=another",
    "&code_verifier=" + verifier,
    "&client_secret=wrong",
  ]) {
    const r = await vkToken(
      new Request(config.site, {
        method: "POST",
        headers: req.headers,
        body: text + extra,
      }),
      config,
      async () => {
        throw Error("must not call");
      },
      now,
    );
    assert([400, 401].includes(r.status));
  }
});
test("large or invalid token bodies are bounded before processing", async () => {
  for (const body of ["x".repeat(16001), "client_id=x&client_secret=y"])
    assert(
      [400, 401].includes(
        (
          await vkToken(
            new Request(config.site, {
              method: "POST",
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body,
            }),
            config,
            async () => {
              throw Error();
            },
            now,
          )
        ).status,
      ),
    );
});
test("claims use a stable VK user ID and do not infer verified email or return optional PII", () => {
  const c = vkClaims({
    user: {
      user_id: 1234567,
      email: "own@example.com",
      first_name: "Имя",
      last_name: "Фамилия",
      phone: "private",
      avatar: "private",
      verified: true,
    },
  });
  assert.equal(c.sub, "1234567");
  assert.equal(c.email_verified, false);
  assert.equal(c.name, "Имя Фамилия");
  assert.deepEqual(Object.keys(c).sort(), [
    "email",
    "email_verified",
    "name",
    "sub",
  ]);
});
test("claims reject missing email, invalid or unsafe IDs and malformed profiles", () => {
  for (const x of [
    null,
    {},
    [],
    { user: { user_id: "123" } },
    { user: { user_id: "../x", email: "a@example.com" } },
    { user: { user_id: 9007199254740992, email: "a@example.com" } },
    { user: { user_id: "123", email: "bad" } },
  ])
    assert.equal(vkClaims(x), null);
});
test("userinfo refuses query-only tokens, bad schemes and overlong headers without network", async () => {
  let calls = 0;
  for (const authorization of [
    "",
    "OAuth secret",
    "Bearer short",
    "Bearer " + "x".repeat(8193),
  ])
    assert.equal(
      (
        await vkUserinfo(
          new Request(config.site + "?access_token=private", {
            headers: { authorization },
          }),
          config,
          async () => {
            calls++;
            throw Error();
          },
        )
      ).status,
      401,
    );
  assert.equal(calls, 0);
});
test("userinfo POSTs only to fixed VK API with body credentials, no redirects or token query", async () => {
  const r = await vkUserinfo(
    new Request(config.site + "?url=https://evil.example", {
      headers: { authorization: "Bearer " + "a".repeat(64) },
    }),
    config,
    async (url, init) => {
      assert.equal(url, "https://id.vk.ru/oauth2/user_info");
      assert.equal(init.method, "POST");
      assert.equal(init.body.get("client_id"), config.clientId);
      assert.equal(init.body.get("access_token"), "a".repeat(64));
      assert.equal(init.redirect, "error");
      assert.equal(init.cache, "no-store");
      return Response.json({
        user: { user_id: "123", email: "own@example.com" },
      });
    },
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).email_verified, false);
});
test("userinfo fails closed on missing email, upstream errors, oversized JSON or network failure", async () => {
  for (const response of [
    Response.json({ user: { user_id: "123" } }),
    Response.json({ error: "private" }),
    new Response("private", { status: 401 }),
    new Response("private", { status: 503 }),
    new Response("x".repeat(64001)),
    new Response("invalid json"),
  ]) {
    const r = await vkUserinfo(
      new Request(config.site, {
        headers: { authorization: "Bearer " + "a".repeat(64) },
      }),
      config,
      async () => response,
    );
    assert([401, 422, 503].includes(r.status));
    assert(!(await r.text()).includes("private"));
  }
  const r = await vkUserinfo(
    new Request(config.site, {
      headers: { authorization: "Bearer " + "a".repeat(64) },
    }),
    config,
    async () => {
      throw Error("secret");
    },
  );
  assert.equal(r.status, 503);
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
    `RESULT ${tests.length - failures}/${tests.length} VK OAuth checks passed`,
  );
  if (failures) process.exitCode = 1;
})();
