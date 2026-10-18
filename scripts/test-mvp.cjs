const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const moduleShim = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  vm.runInNewContext(source, {
    module: moduleShim,
    exports: moduleShim.exports,
    require: (id) =>
      id.startsWith(".")
        ? load(path.resolve(path.dirname(file), id + ".ts"))
        : require(id),
    process:{env:{}},
    Request,
    URL,
    TextDecoder,
    Uint8Array,
    Number,
    JSON,
    RangeError,
    SyntaxError,
  });
  cache.set(file, moduleShim.exports);
  return moduleShim.exports;
}
const guards = load(path.join(__dirname, "../lib/request-guards.ts"));
const { normalizeTelegramPost } = load(
  path.join(__dirname, "../lib/telegram-source.ts"),
);
const post = {
  channel_post: {
    chat: {
      id: -100123,
      type: "channel",
      username: "my_public_channel",
      title: "Public",
    },
    message_id: 2,
    date: 1792310400,
    text: "Нужен дизайнер\nFigma, интерфейсы",
  },
};
const tests = [
  ['handles Next normalized URL without rejecting same-origin requests',()=>{const request=new Request('http://localhost:3100/api',{headers:{host:'127.0.0.1:3100',origin:'http://127.0.0.1:3100'}});assert.equal(guards.sameOrigin(request),true);assert.equal(guards.requestOrigin(request),'http://127.0.0.1:3100');}],

  [
    "accepts authorized public Telegram channel",
    () =>
      assert.equal(
        normalizeTelegramPost(post, ["-100123"], "project").url,
        "https://t.me/my_public_channel/2",
      ),
  ],
  [
    "rejects channel absent from allowlist",
    () =>
      assert.equal(normalizeTelegramPost(post, ["-100999"], "project"), null),
  ],
  [
    "rejects arbitrary direct messages",
    () =>
      assert.equal(
        normalizeTelegramPost(
          { message: post.channel_post },
          ["-100123"],
          "project",
        ),
        null,
      ),
  ],
  [
    "rejects forwarded content as authorization bypass",
    () =>
      assert.equal(
        normalizeTelegramPost(
          {
            message: {
              forward_origin: { chat: post.channel_post.chat },
              text: "test",
            },
          },
          ["-100123"],
          "project",
        ),
        null,
      ),
  ],
  [
    "rejects private channels without public source URL",
    () =>
      assert.equal(
        normalizeTelegramPost(
          {
            channel_post: {
              ...post.channel_post,
              chat: { id: -100123, type: "channel" },
            },
          },
          ["-100123"],
          "project",
        ),
        null,
      ),
  ],
  [
    "rejects invalid Telegram source type",
    () => assert.equal(normalizeTelegramPost(post, ["-100123"], "admin"), null),
  ],
  [
    "rejects unsafe channel username",
    () =>
      assert.equal(
        normalizeTelegramPost(
          {
            channel_post: {
              ...post.channel_post,
              chat: { ...post.channel_post.chat, username: "../../evil" },
            },
          },
          ["-100123"],
          "project",
        ),
        null,
      ),
  ],
  [
    "limits Telegram content size",
    () =>
      assert.equal(
        normalizeTelegramPost(
          { channel_post: { ...post.channel_post, text: "x".repeat(10000) } },
          ["-100123"],
          "job",
        ).description.length,
        6000,
      ),
  ],
  [
    "rejects non-finite Telegram date",
    () =>
      assert.equal(
        normalizeTelegramPost(
          { channel_post: { ...post.channel_post, date: Infinity } },
          ["-100123"],
          "project",
        ),
        null,
      ),
  ],
  [
    "accepts UUID and rejects injected query fragments",
    () => {
      assert.equal(
        guards.validUuid("11111111-1111-4111-8111-111111111111"),
        true,
      );
      assert.equal(guards.validUuid("id.or(user_id.gt.0)"), false);
    },
  ],
  [
    "accepts same origin and rejects cross origin requests",
    () => {
      assert.equal(
        guards.sameOrigin(
          new Request("https://app.example/api", {
            headers: { origin: "https://app.example" },
          }),
        ),
        true,
      );
      assert.equal(
        guards.sameOrigin(
          new Request("https://app.example/api", {
            headers: { origin: "https://evil.example" },
          }),
        ),
        false,
      );
    },
  ],
  [
    "reads bounded JSON",
    async () =>
      assert.deepEqual(
        await guards.readLimitedJson(
          new Request("https://example.com", {
            method: "POST",
            body: '{"ok":true}',
          }),
        ),
        { ok: true },
      ),
  ],
  [
    "rejects oversized declared request",
    async () =>
      assert.rejects(
        guards.readLimitedJson(
          new Request("https://example.com", {
            method: "POST",
            headers: { "content-length": "99999" },
            body: "{}",
          }),
        ),
      ),
  ],
  [
    "rejects oversized body without content-length",
    async () =>
      assert.rejects(
        guards.readLimitedJson(
          new Request("https://example.com", {
            method: "POST",
            body: "x".repeat(17000),
          }),
        ),
      ),
  ],
  [
    "rejects invalid JSON",
    async () =>
      assert.rejects(
        guards.readLimitedJson(
          new Request("https://example.com", {
            method: "POST",
            body: "{broken",
          }),
        ),
      ),
  ],
];
(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log("PASS " + name);
    } catch (e) {
      failed++;
      console.error("FAIL " + name + ": " + e.message);
    }
  }
  console.log(
    `RESULT ${tests.length - failed}/${tests.length} MVP checks passed`,
  );
  if (failed) process.exitCode = 1;
})();
