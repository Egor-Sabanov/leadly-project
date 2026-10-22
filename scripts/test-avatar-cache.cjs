const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

async function run(source) {
  const state = {
    profile: { avatar_url: "/api/profile/avatar?v=first" },
    bytes: Buffer.from("first photo"),
    authorized: true,
    profileError: false,
  };
  const cached = new Map();
  const downloads = [];
  const actor = "own-account";
  const checks = [];
  const pass = (name) => checks.push(name);
  const storageFetch = async (input) => {
    const url = String(input);
    downloads.push(url);
    // This CDN keeps old responses even after an overwrite or deletion.
    if (!cached.has(url))
      cached.set(url, state.bytes && Buffer.from(state.bytes));
    const bytes = cached.get(url);
    return bytes
      ? new Response(bytes, { headers: { "Content-Type": "image/webp" } })
      : new Response(null, { status: 404 });
  };
  const modules = {
    "node:crypto": require("node:crypto"),
    "next/server": { NextResponse: Response },
    "next/cache": { revalidatePath() {} },
    "@/lib/avatar": { AVATAR_BUCKET: "leadly-profile-avatars" },
    "@/lib/account-api": {
      accountApi: async () =>
        state.authorized
          ? {
              error: null,
              account: {
                user: { id: actor },
                supabase: {
                  from(table) {
                    assert.equal(table, "profiles");
                    return {
                      select(column) {
                        assert.equal(column, "avatar_url");
                        return {
                          eq(column, id) {
                            assert.equal(column, "id");
                            assert.equal(id, actor);
                            return {
                              maybeSingle: async () => ({
                                data: state.profile,
                                error: state.profileError
                                  ? new Error("profile unavailable")
                                  : null,
                              }),
                            };
                          },
                        };
                      },
                    };
                  },
                },
              },
            }
          : { error: new Response(null, { status: 401 }), account: null },
    },
    "@supabase/supabase-js": {
      createClient: (url, key, options) => ({
        storage: {
          from(bucket) {
            assert.equal(bucket, "leadly-profile-avatars");
            return {
              async download(file) {
                assert.equal(file, `${actor}/avatar.webp`);
                const response = await options.global.fetch(
                  `${url}/storage/v1/object/${bucket}/${file}`,
                );
                return response.ok
                  ? { data: await response.blob(), error: null }
                  : {
                      data: null,
                      error: { message: "Object not found", status: 404 },
                    };
              },
            };
          },
        },
      }),
    },
  };
  const compiledModule = { exports: {} };
  const script = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  vm.runInNewContext(script, {
    module: compiledModule,
    exports: compiledModule.exports,
    require(name) {
      assert(Object.hasOwn(modules, name), `Unexpected import: ${name}`);
      return modules[name];
    },
    Request,
    Response,
    URL,
    Buffer,
    AbortSignal,
    fetch: storageFetch,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://storage.invalid",
        SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
      },
    },
  });
  const get = (query = "", headers) =>
    compiledModule.exports.GET(
      new Request("https://app.invalid/api/profile/avatar" + query, { headers }),
    );

  const first = await get("?v=first");
  assert.equal(first.status, 200);
  assert.equal(await first.text(), "first photo");
  const firstEtag = first.headers.get("etag");
  assert(firstEtag);
  pass("the current saved avatar is returned with an ETag");

  state.bytes = Buffer.from("second photo");
  state.profile.avatar_url = "/api/profile/avatar?v=second";
  const second = await get("?v=first");
  assert.equal(second.status, 200);
  assert.equal(
    await second.text(),
    "second photo",
    "replacement must bypass a cached earlier image",
  );
  pass("replacement bypasses a cached earlier image");
  const secondEtag = second.headers.get("etag");
  const savedStorageUrl = downloads.at(-1);

  const tampered = await get("?v=caller-controlled");
  assert.equal(await tampered.text(), "second photo");
  assert.equal(downloads.at(-1), savedStorageUrl);
  pass("client query strings cannot change the saved Storage version");

  assert.equal((await get("", { "If-None-Match": secondEtag })).status, 304);
  pass("a matching current ETag returns 304");
  const oldValidator = await get("", { "If-None-Match": firstEtag });
  assert.equal(oldValidator.status, 200);
  assert.equal(await oldValidator.text(), "second photo");
  pass("an old ETag receives the replacement");

  state.bytes = null;
  state.profile.avatar_url = null;
  const beforeDeletionRead = downloads.length;
  assert.equal((await get("?v=second")).status, 404);
  assert.equal(downloads.length, beforeDeletionRead);
  pass("deletion returns 404 without consulting the stale CDN");

  state.profile = null;
  assert.equal((await get()).status, 404);
  assert.equal(downloads.length, beforeDeletionRead);
  pass("a missing profile cannot expose a retained Storage object");

  state.profileError = true;
  assert.equal((await get()).status, 503);
  assert.equal(downloads.length, beforeDeletionRead);
  pass("profile read failure returns 503 without serving an old photo");

  state.authorized = false;
  assert.equal((await get()).status, 401);
  assert.equal(downloads.length, beforeDeletionRead);
  pass("an unsigned request cannot access Storage");

  state.authorized = true;
  state.profileError = false;
  state.profile = { avatar_url: "/api/profile/avatar?v=third" };
  state.bytes = Buffer.from("third photo");
  assert.equal(await (await get()).text(), "third photo");
  pass("uploading again after deletion uses the new saved version");
  return checks;
}

module.exports = { run };
if (require.main === module)
  run(
    fs.readFileSync(
      path.join(__dirname, "../app/api/profile/avatar/route.ts"),
      "utf8",
    ),
  )
    .then((checks) => {
      for (const name of checks) console.log("PASS " + name);
      console.log(`RESULT ${checks.length} avatar cache checks; outbound requests 0`);
    })
    .catch((error) => {
      console.error("FAIL avatar cache", error.message);
      process.exitCode = 1;
    });
