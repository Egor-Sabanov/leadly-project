const assert = require("node:assert/strict"),
  path = require("node:path");
const { createTsLoader } = require("./ts-loader.cjs");
const root = path.join(__dirname, "../lib"),
  a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const site = "https://app.example",
  env = {
    LEADLY_SITE_URL: site,
    NEXT_PUBLIC_SUPABASE_URL: "https://auth.example",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-server",
    LEADLY_VK_CLIENT_ID: "54837022",
    LEADLY_VK_BRIDGE_SECRET: "1a".repeat(32),
  };
let s;
function reset() {
  s = {
    actor: {
      id: a,
      email: "own@example.com",
      email_confirmed_at: new Date().toISOString(),
      is_anonymous: false,
    },
    mapping: null,
    connection: null,
    pending: null,
    calls: [],
    rpcResult: { ok: true },
    target: {
      id: a,
      email: "own@example.com",
      email_confirmed_at: new Date().toISOString(),
      is_anonymous: false,
    },
  };
}
reset();
const client = {
  auth: {
    getUser: async () => ({ data: { user: s.actor }, error: null }),
    verifyOtp: async (p) => {
      s.calls.push(["verify", p]);
      return {
        data: {
          user: { id: s.verifyWrong ? b : a },
          session: { access_token: "never-expose" },
        },
        error: s.verifyError ? { message: "private" } : null,
      };
    },
    signOut: async (p) => {
      s.calls.push(["signOut", p]);
      return { error: null };
    },
  },
};
const db = {
  from(table) {
    const filters = {};
    let removing = false;
    const q = {
      select() {
        return q;
      },
      eq(k, v) {
        filters[k] = v;
        return q;
      },
      delete() {
        removing = true;
        return q;
      },
      async maybeSingle() {
        s.calls.push(["read", table, { ...filters }]);
        if (s.dbError)
          return { data: null, error: { message: "private database detail" } };
        return {
          data:
            table === "vk_accounts"
              ? filters.vk_user_id
                ? s.mapping
                : s.connection
              : s.pending,
          error: null,
        };
      },
      async upsert(value) {
        s.calls.push(["upsert", table, value]);
        return { error: s.dbError ? { message: "private" } : null };
      },
      then(resolve, reject) {
        s.calls.push([removing ? "delete" : "write", table, { ...filters }]);
        return Promise.resolve({
          error: s.dbError ? { message: "private" } : null,
        }).then(resolve, reject);
      },
    };
    return q;
  },
  async rpc(name, args) {
    s.calls.push(["rpc", name, args]);
    return {
      data: s.rpcResult,
      error: s.dbError ? { message: "private" } : null,
    };
  },
  auth: {
    admin: {
      async getUserById(id) {
        s.calls.push(["target", id]);
        return { data: { user: s.target }, error: null };
      },
      async generateLink(p) {
        s.calls.push(["generate", p]);
        return {
          data: {
            user: { id: s.generateWrong ? b : a },
            properties: { hashed_token: "h".repeat(64) },
          },
          error: s.generateError ? { message: "private" } : null,
        };
      },
    },
  },
};
const provider = async (url, init) => {
  s.calls.push(["vk", url]);
  if (url.endsWith("/auth"))
    return Response.json({
      access_token: "a".repeat(64),
      expires_in: 3600,
      state: init.body.get("state"),
    });
  return Response.json({
    user: { user_id: "101", email: "vk@example.com", first_name: "Профиль" },
  });
};
const pure = createTsLoader({
  URLSearchParams,
  process: { env },
  fetch: provider,
});
const guards = pure(path.join(root, "request-guards.ts")),
  flow = pure(path.join(root, "vk-account-oauth.ts")),
  vk = pure(path.join(root, "vk-oauth.ts"));
const account = createTsLoader({
  process: { env },
  require: (id) =>
    id === "./supabase/server"
      ? { createSupabaseServerClient: async () => client }
      : id === "./request-guards"
        ? guards
        : require(id),
})(path.join(root, "account-api.ts"));
const modules = {
  "./account-api": account,
  "./supabase/server": { createSupabaseServerClient: async () => client },
  "./request-guards": guards,
  "./vk-oauth": vk,
  "./vk-account-oauth": flow,
  "@supabase/supabase-js": { createClient: () => db },
};
const server = createTsLoader({
  URLSearchParams,
  process: { env },
  require: (id) => modules[id] || require(id),
})(path.join(root, "vk-account-server.ts"));
const tests = [],
  test = (name, run) => tests.push([name, run]);
const req = (body = {}, options = {}) =>
  new Request(site + "/api/account/vk/confirm", {
    method: "POST",
    headers: {
      origin: site,
      "content-type": "application/json",
      cookie: flow.VK_RECEIPT_COOKIE + "=" + "r".repeat(43),
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
function returned(mode = "connect", actor = a) {
  const f = flow.startVKAccountFlow(
    vk.vkConfig(),
    mode,
    mode === "connect" ? actor : null,
  );
  const u = new URL(f.url);
  return new Request(
    site +
      "/auth/vk/callback?" +
      new URLSearchParams({
        state: u.searchParams.get("state"),
        code: "synthetic-code-1234",
        device_id: "synthetic-device-1234",
      }),
    { headers: { cookie: f.cookie.split(";")[0] } },
  );
}
test("account mutations reject cross-origin requests before any storage access", async () => {
  const r = await server.vkAccountChange(
    req(
      { acknowledged: true },
      { headers: { origin: "https://evil.example" } },
    ),
    "confirm",
  );
  assert.equal(r.status, 403);
  assert.equal(s.calls.length, 0);
});
test("signed-out callers cannot inspect or mutate another account connection", async () => {
  s.actor = null;
  assert.equal((await server.vkAccountStatus(new Request(site))).status, 401);
  assert.equal(
    (await server.vkAccountChange(req({ intent: true }), "start")).status,
    401,
  );
  assert.equal(s.calls.length, 0);
});
test("unconfirmed target cannot start a VK link even with a live session", async () => {
  s.actor.email_confirmed_at = null;
  assert.equal(
    (await server.vkAccountChange(req({ intent: true }), "start")).status,
    403,
  );
  assert.equal(s.calls.length, 0);
});
test("connect start requires intent and refuses replacement of an existing connection", async () => {
  assert.equal((await server.vkAccountChange(req({}), "start")).status, 400);
  s.connection = { user_id: a };
  assert.equal(
    (await server.vkAccountChange(req({ intent: true }), "start")).status,
    409,
  );
  assert(!s.calls.some((c) => c[0] === "vk" || c[0] === "rpc"));
});
test("authenticated start binds the actual actor and returns only a fixed VK authorize URL", async () => {
  const r = await server.vkAccountChange(
    req({ intent: true, user_id: b }),
    "start",
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(new URL(body.url).origin, "https://id.vk.ru");
  const cookie = r.headers.get("set-cookie");
  assert(cookie.includes("HttpOnly"));
  assert(cookie.includes("Secure"));
  assert(!cookie.includes(a));
  assert(!JSON.stringify(body).includes(env.LEADLY_VK_BRIDGE_SECRET));
});
test("fresh verified VK callback creates a pending receipt, never a login mapping", async () => {
  const r = await server.vkAccountCallback(returned());
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), site + "/profile#vk");
  const upsert = s.calls.find((c) => c[0] === "upsert");
  assert.equal(upsert[1], "vk_link_requests");
  assert.equal(upsert[2].user_id, a);
  assert.equal(upsert[2].vk_user_id, "101");
  assert.match(upsert[2].token_hash, /^[a-f0-9]{64}$/);
  assert(r.headers.get("set-cookie").includes(flow.VK_RECEIPT_COOKIE));
  assert(
    !s.calls.some(
      (c) => c[0] === "rpc" || c[0] === "generate" || c[0] === "verify",
    ),
  );
});
test("account switch while VK is open cannot create a pending receipt or issue a session", async () => {
  const request = returned();
  s.actor.id = b;
  const r = await server.vkAccountCallback(request);
  assert.equal(r.headers.get("location"), site + "/profile?vk=error#vk");
  assert(
    !s.calls.some((c) =>
      ["vk", "upsert", "rpc", "generate", "verify"].includes(c[0]),
    ),
  );
});
test("confirmation requires consent and an HttpOnly receipt, not a body-supplied token", async () => {
  assert.equal(
    (await server.vkAccountChange(req({ acknowledged: false }), "confirm"))
      .status,
    400,
  );
  assert.equal(
    (
      await server.vkAccountChange(
        req(
          { acknowledged: true, token: "r".repeat(43) },
          { headers: { cookie: "" } },
        ),
        "confirm",
      )
    ).status,
    410,
  );
  assert(!s.calls.some((c) => c[0] === "rpc"));
});
test("confirmation passes only the authenticated actor and cookie hash to the private RPC", async () => {
  const r = await server.vkAccountChange(
    req({ acknowledged: true, user_id: b, vk_user_id: "999" }),
    "confirm",
  );
  assert.equal(r.status, 200);
  const call = s.calls.find((c) => c[0] === "rpc");
  assert.equal(call[1], "leadly_confirm_vk_link");
  assert.equal(call[2].p_user_id, a);
  assert.equal(call[2].p_token_hash, flow.vkReceiptHash("r".repeat(43)));
  assert.equal(call[2].p_acknowledged, true);
  assert(r.headers.get("set-cookie").includes("Max-Age=0"));
});
test("expired, conflicting and private DB errors never become success or disclose internals", async () => {
  for (const result of [
    { ok: false, reason: "expired" },
    { ok: false, reason: "identity_in_use" },
    { ok: false, reason: "already_connected" },
  ]) {
    s.rpcResult = result;
    const r = await server.vkAccountChange(
      req({ acknowledged: true }),
      "confirm",
    );
    assert.equal(r.status, 409);
    assert(!(await r.text()).includes("private"));
  }
  s.dbError = true;
  const r = await server.vkAccountChange(
    req({ acknowledged: true }),
    "confirm",
  );
  assert.equal(r.status, 503);
  assert(!(await r.text()).includes("private"));
});
test("disconnect requires explicit confirmation and cannot choose another owner", async () => {
  assert.equal(
    (await server.vkAccountChange(req({ action: "disconnect" }), "remove"))
      .status,
    400,
  );
  const r = await server.vkAccountChange(
    req({ action: "disconnect", acknowledged: true, user_id: b }),
    "remove",
  );
  assert.equal(r.status, 200);
  assert.equal(s.calls.find((c) => c[0] === "rpc")[2].p_user_id, a);
});
test("cancel removes only the current owner pending receipt and clears temporary cookies", async () => {
  const r = await server.vkAccountChange(
    req({ action: "cancel", user_id: b }),
    "remove",
  );
  assert.equal(r.status, 200);
  const call = s.calls.find((c) => c[0] === "delete");
  assert.equal(call[1], "vk_link_requests");
  assert.equal(call[2].user_id, a);
  assert(!s.calls.some((c) => c[0] === "rpc"));
});
test("unmapped sign-in retains original Supabase registration and creates no binding/session", async () => {
  const r = await server.vkAccountCallback(returned("signin"));
  assert.equal(
    r.headers.get("location"),
    site + "/auth/social/vk?transport=provider",
  );
  assert(
    !s.calls.some((c) =>
      ["upsert", "rpc", "generate", "verify"].includes(c[0]),
    ),
  );
});
test("a mapped VK opens exactly the confirmed target account without sending a mail or exposing its token", async () => {
  s.mapping = { user_id: a, vk_user_id: "101" };
  assert.equal(await server.signInLinkedVK(db, client, "101"), "signed_in");
  assert.deepEqual(
    JSON.parse(JSON.stringify(s.calls.find((c) => c[0] === "generate")[1])),
    { type: "magiclink", email: "own@example.com" },
  );
  assert.equal(s.calls.find((c) => c[0] === "verify")[1].type, "magiclink");
});
test("missing, malformed, banned and unconfirmed mappings cannot issue a session", async () => {
  assert.equal(await server.signInLinkedVK(db, client, "101"), "missing");
  s.mapping = { user_id: "not-a-uuid", vk_user_id: "101" };
  assert.equal(await server.signInLinkedVK(db, client, "101"), "unavailable");
  s.mapping = { user_id: a, vk_user_id: "101" };
  s.target.email_confirmed_at = null;
  assert.equal(await server.signInLinkedVK(db, client, "101"), "unavailable");
  s.target.email_confirmed_at = new Date().toISOString();
  s.target.banned_until = new Date(Date.now() + 86400000).toISOString();
  assert.equal(await server.signInLinkedVK(db, client, "101"), "unavailable");
  assert(!s.calls.some((c) => c[0] === "generate" || c[0] === "verify"));
});
test("generateLink must belong to the mapped user before OTP is consumed", async () => {
  s.mapping = { user_id: a, vk_user_id: "101" };
  s.generateWrong = true;
  assert.equal(await server.signInLinkedVK(db, client, "101"), "unavailable");
  assert(!s.calls.some((c) => c[0] === "verify"));
});
test("a wrong account returned during session creation is signed out locally", async () => {
  s.mapping = { user_id: a, vk_user_id: "101" };
  s.verifyWrong = true;
  assert.equal(await server.signInLinkedVK(db, client, "101"), "unavailable");
  assert.deepEqual(
    JSON.parse(JSON.stringify(s.calls.find((c) => c[0] === "signOut")[1])),
    { scope: "local" },
  );
});
test("unconfigured or private storage does not surface SQL instructions or another user data", async () => {
  s.dbError = true;
  const r = await server.vkAccountStatus(new Request(site));
  assert.deepEqual(await r.json(), { available: false });
  assert(
    !JSON.stringify(
      await (
        await server.vkAccountChange(req({ intent: true }), "start")
      ).json(),
    ).includes("private"),
  );
});
(async () => {
  let failures = 0;
  for (const [name, run] of tests) {
    reset();
    try {
      await run();
      console.log("PASS " + name);
    } catch (e) {
      failures++;
      console.error("FAIL " + name + ": " + e.message);
    }
  }
  console.log(
    `RESULT ${tests.length - failures}/${tests.length} VK account service checks passed`,
  );
  if (failures) process.exitCode = 1;
})();
