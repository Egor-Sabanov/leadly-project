const assert = require("node:assert/strict");
const path = require("node:path");
const sharp = require("sharp");
const load = require("./ts-loader.cjs").createTsLoader({
  Buffer,
  require: (id) => (id === "sharp" ? { default: sharp } : require(id)),
});
const { normalizeAvatar } = load(path.join(__dirname, "../lib/avatar.ts"));
const { avatarCropArea, defaultAvatarCrop } = load(
  path.join(__dirname, "../lib/avatar-crop.ts"),
);
const { validTaskDate } = load(path.join(__dirname, "../lib/tasks.ts"));
(async () => {
  let passed = 0;
  const test = async (name, fn) => {
    await fn();
    passed++;
    console.log("PASS " + name);
  };
  await test("normalizes and center-crops uploaded portraits, strips input metadata", async () => {
    const input = await sharp({
      create: { width: 800, height: 400, channels: 3, background: "#a88dc9" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await normalizeAvatar(input);
    const meta = await sharp(result).metadata();
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
    assert.equal(meta.format, "webp");
    assert.equal(meta.exif, undefined);
    assert.equal(meta.orientation, undefined);
    assert.ok(result.length <= 262144);
  });
  await test("rejects active SVG even if browser labels it as an image", async () =>
    assert.rejects(() =>
      normalizeAvatar(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><script>alert(1)</script></svg>',
        ),
      ),
    ));
  await test("rejects corrupt upload bytes", async () =>
    assert.rejects(() => normalizeAvatar(Buffer.from("invalid-image"))));
  await test("missing server configuration returns a private actionable status without requesting storage", async () => {
    const routeLoad = require("./ts-loader.cjs").createTsLoader({
      Buffer,
      require: (id) =>
        id === "@/lib/account-api"
          ? {
              accountApi: async () => ({
                account: { user: { id: "own-account" } },
                error: null,
              }),
            }
          : id.startsWith("@/")
            ? load(path.join(__dirname, "..", id.slice(2) + ".ts"))
            : require(id),
    });
    const route = routeLoad(
      path.join(__dirname, "../app/api/profile/avatar/route.ts"),
    );
    for (const method of ["GET", "POST", "DELETE"]) {
      const response = await route[method](
        new Request("https://app.example/api/profile/avatar", { method }),
      );
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal((await response.json()).code, "avatar_not_configured");
    }
  });
  await test("rejects excessive pixel dimensions despite a small compressed file", async () => {
    const huge = await sharp({
      create: { width: 4100, height: 4100, channels: 3, background: "#000" },
    })
      .png()
      .toBuffer();
    await assert.rejects(() => normalizeAvatar(huge));
  });
  await test("task dates enforce real calendar dates and leap years", () => {
    for (const date of ["2026-10-19", "2028-02-29", "2099-12-31"])
      assert.ok(validTaskDate(date));
    for (const date of [
      "2026-02-29",
      "2026-02-30",
      "2026-13-01",
      "2026-01-00",
      "2026-1-2",
      "1999-01-01",
      "2100-01-01",
      "2026-10-19T12:00:00Z",
    ])
      assert.equal(validTaskDate(date), false);
  });
  await test("crop matches a centered cover preview in portrait and landscape", () => {
    let r = avatarCropArea(800, 400, defaultAvatarCrop);
    assert.equal(r.left, 200);
    assert.equal(r.top, 0);
    assert.equal(r.size, 400);
    r = avatarCropArea(400, 800, defaultAvatarCrop);
    assert.equal(r.left, 0);
    assert.equal(r.top, 200);
  });
  await test("crop zoom and both edge positions stay inside source pixels", () => {
    for (const [w, h] of [
      [1000, 500],
      [500, 1000],
      [512, 512],
    ])
      for (const x of [0, 25, 50, 100])
        for (const y of [0, 50, 100])
          for (const zoom of [1, 1.5, 3]) {
            const r = avatarCropArea(w, h, { x, y, zoom });
            assert.ok(
              r.left >= 0 &&
                r.top >= 0 &&
                r.left + r.size <= w + 0.0001 &&
                r.top + r.size <= h + 0.0001,
            );
            assert.equal(r.size, Math.min(w, h) / zoom);
          }
  });
  await test("crop rejects invalid dimensions and clamps stale controls", () => {
    for (const [w, h] of [
      [0, 100],
      [100, 0],
      [-1, 20],
      [NaN, 10],
      [20, Infinity],
    ])
      assert.throws(() => avatarCropArea(w, h, defaultAvatarCrop));
    assert.throws(() => avatarCropArea(100, 100, { x: NaN, y: 50, zoom: 1 }));
    const r = avatarCropArea(200, 100, { x: 500, y: -20, zoom: 99 });
    assert.equal(r.top, 0);
    assert.ok(r.left + r.size <= 200);
  });
  console.log(passed + " account asset checks passed");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
