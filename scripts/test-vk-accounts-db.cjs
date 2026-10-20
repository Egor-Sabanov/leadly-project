const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const sql = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/0008_vk_accounts.sql"),
  "utf8",
);
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  orphan = "33333333-3333-4333-8333-333333333333",
  other = "44444444-4444-4444-8444-444444444444",
  unconfirmed = "55555555-5555-4555-8555-555555555555";
const h1 = "a".repeat(64),
  h2 = "b".repeat(64);
(async () => {
  const db = new PGlite();
  let passed = 0;
  const role = async (name) => db.exec("reset role;set role " + name);
  const rpc = async (name, args) =>
    (
      await db.query(
        "select public." +
          name +
          "(" +
          args.map((_, i) => "$" + (i + 1)).join(",") +
          ") as value",
        args,
      )
    ).rows[0].value;
  async function test(name, run) {
    await run();
    passed++;
    console.log("PASS " + name);
  }
  async function pending(user, vk, hash = h1, expired = false) {
    await role("postgres");
    await db.query(
      "insert into public.vk_link_requests(user_id,token_hash,vk_user_id,display_name,created_at,expires_at) values($1,$2,$3,'Профиль',now()-interval '6 minutes',now()+($4::integer*interval '1 minute')) on conflict(user_id) do update set token_hash=excluded.token_hash,vk_user_id=excluded.vk_user_id,created_at=excluded.created_at,expires_at=excluded.expires_at",
      [user, hash, vk, expired ? -1 : 3],
    );
    await role("service_role");
  }
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
 create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),provider text,provider_id text);
 create table public.existing_work(id integer primary key,data text);insert into public.existing_work values(1,'keep all data');
 insert into auth.users(id,email,email_confirmed_at) values('${a}','a@example.com',now()),('${b}','b@example.com',now()),('${other}','other@example.com',now()),('${orphan}','',null),('${unconfirmed}','pending@example.com',null);
 insert into auth.identities(user_id,provider,provider_id) values('${a}','google','google-a'),('${orphan}','custom:vk','101'),('${other}','custom:vk','303');`);
    const baseline = (
      await db.query(
        "select row_to_json(u) as value from auth.users u order by id",
      )
    ).rows;
    const identityBaseline = (
      await db.query(
        "select row_to_json(i) as value from auth.identities i order by id",
      )
    ).rows;
    await test("additive repeatable migration enables RLS and preserves Auth identities and existing work", async () => {
      await db.exec(sql);
      await db.exec(sql);
      const r = (
        await db.query(
          "select relrowsecurity from pg_class where relname in ('vk_accounts','vk_link_requests')",
        )
      ).rows;
      assert.equal(r.length, 2);
      assert(r.every((v) => v.relrowsecurity));
      assert.equal(
        (await db.query("select data from public.existing_work")).rows[0].data,
        "keep all data",
      );
      assert.deepEqual(
        (
          await db.query(
            "select row_to_json(u) as value from auth.users u order by id",
          )
        ).rows,
        baseline,
      );
      assert.deepEqual(
        (
          await db.query(
            "select row_to_json(i) as value from auth.identities i order by id",
          )
        ).rows,
        identityBaseline,
      );
    });
    await test("anonymous and authenticated callers have no table or RPC privileges", async () => {
      for (const r of ["anon", "authenticated"]) {
        await role(r);
        for (const t of ["vk_accounts", "vk_link_requests"])
          await assert.rejects(() => db.query("select * from public." + t));
        await assert.rejects(() =>
          rpc("leadly_confirm_vk_link", [a, h1, true]),
        );
        await assert.rejects(() => rpc("leadly_disconnect_vk", [a]));
      }
    });
    await test("security definer functions pin an empty search path", async () => {
      await role("postgres");
      const rows = (
        await db.query(
          "select proconfig from pg_proc where proname in ('leadly_confirm_vk_link','leadly_disconnect_vk')",
        )
      ).rows;
      assert.equal(rows.length, 2);
      assert(rows.every((r) => r.proconfig.includes('search_path=""')));
    });
    await test("pending proof alone never creates a login binding", async () => {
      await pending(a, "101");
      assert.equal(
        (await db.query("select * from public.vk_accounts")).rows.length,
        0,
      );
    });
    await test("confirmation requires an explicit acknowledgement", async () => {
      for (const yes of [false, null])
        assert.equal(
          (await rpc("leadly_confirm_vk_link", [a, h1, yes])).ok,
          false,
        );
    });
    await test("wrong receipt or another owner cannot confirm the candidate", async () => {
      assert.equal(
        (await rpc("leadly_confirm_vk_link", [a, h2, true])).ok,
        false,
      );
      assert.equal(
        (await rpc("leadly_confirm_vk_link", [b, h1, true])).ok,
        false,
      );
      assert.equal(
        (await db.query("select * from public.vk_accounts")).rows.length,
        0,
      );
    });
    await test("an expired receipt cannot confirm", async () => {
      await pending(a, "101", h1, true);
      assert.equal(
        (await rpc("leadly_confirm_vk_link", [a, h1, true])).reason,
        "expired",
      );
    });
    await test("confirmed owner binds VK while preserving the stranded empty-email Auth record", async () => {
      await pending(a, "101");
      assert.equal(
        (await rpc("leadly_confirm_vk_link", [a, h1, true])).ok,
        true,
      );
      const row = (await db.query("select * from public.vk_accounts")).rows[0];
      assert.equal(row.user_id, a);
      assert.equal(row.vk_user_id, "101");
      assert.equal(row.notice_version, "vk-2026-10-20.1");
      await role("postgres");
      assert.deepEqual(
        (
          await db.query(
            "select row_to_json(u) as value from auth.users u order by id",
          )
        ).rows,
        baseline,
      );
      assert.deepEqual(
        (
          await db.query(
            "select row_to_json(i) as value from auth.identities i order by id",
          )
        ).rows,
        identityBaseline,
      );
      await role("service_role");
    });
    await test("successful confirmation consumes the receipt and rejects replay", async () => {
      assert.equal(
        (await db.query("select * from public.vk_link_requests")).rows.length,
        0,
      );
      assert.equal(
        (await rpc("leadly_confirm_vk_link", [a, h1, true])).reason,
        "expired",
      );
    });
    await test("one VK cannot be connected to two different owners", async () => {
      await pending(b, "101", h2);
      assert.equal(
        (await rpc("leadly_confirm_vk_link", [b, h2, true])).ok,
        false,
      );
      assert.equal(
        (await db.query("select user_id from public.vk_accounts")).rows[0]
          .user_id,
        a,
      );
    });
    await test("a second VK cannot silently replace the owner connection", async () => {
      await pending(a, "202");
      assert.equal(
        (await rpc("leadly_confirm_vk_link", [a, h1, true])).reason,
        "already_connected",
      );
      assert.equal(
        (await db.query("select vk_user_id from public.vk_accounts")).rows[0]
          .vk_user_id,
        "101",
      );
    });
    await test("a real confirmed VK Auth account belonging to another user is protected", async () => {
      await pending(b, "303", h2);
      assert.equal(
        (await rpc("leadly_confirm_vk_link", [b, h2, true])).reason,
        "identity_in_use",
      );
    });
    await test("a different unconfirmed Auth account with a primary email is also protected", async () => {
      await role("postgres");
      await db.query(
        "insert into auth.identities(user_id,provider,provider_id) values($1,'custom:vk','404')",
        [unconfirmed],
      );
      await pending(b, "404", h2);
      assert.equal(
        (await rpc("leadly_confirm_vk_link", [b, h2, true])).reason,
        "identity_in_use",
      );
    });
    await test("a never-confirmed target cannot acquire another login method", async () => {
      const h3 = "c".repeat(64);
      await pending(unconfirmed, "505", h3);
      assert.equal(
        (await rpc("leadly_confirm_vk_link", [unconfirmed, h3, true])).reason,
        "unavailable",
      );
    });
    await test("banned and anonymous targets cannot confirm", async () => {
      await role("postgres");
      await db.query(
        "update auth.users set banned_until=now()+interval '1 day' where id=$1",
        [b],
      );
      await pending(b, "606", h2);
      assert.equal(
        (await rpc("leadly_confirm_vk_link", [b, h2, true])).ok,
        false,
      );
      await role("postgres");
      await db.query(
        "update auth.users set banned_until=null,is_anonymous=true where id=$1",
        [b],
      );
      await role("service_role");
      assert.equal(
        (await rpc("leadly_confirm_vk_link", [b, h2, true])).ok,
        false,
      );
      await role("postgres");
      await db.query("update auth.users set is_anonymous=false where id=$1", [
        b,
      ]);
      await role("service_role");
    });
    await test("disconnecting another account does not affect the owner binding", async () => {
      assert.equal((await rpc("leadly_disconnect_vk", [b])).ok, true);
      assert.equal(
        (await db.query("select user_id from public.vk_accounts")).rows[0]
          .user_id,
        a,
      );
    });
    await test("cancelling pending proof leaves the established connection intact", async () => {
      await db.query("delete from public.vk_link_requests where user_id=$1", [
        a,
      ]);
      assert.equal(
        (await db.query("select vk_user_id from public.vk_accounts")).rows[0]
          .vk_user_id,
        "101",
      );
    });
    await test("disconnect removes only owned VK binding and receipt, not Auth or workspace", async () => {
      await pending(a, "101");
      await rpc("leadly_disconnect_vk", [a]);
      assert.equal(
        (await db.query("select * from public.vk_accounts")).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select * from public.vk_link_requests where user_id=$1",
            [a],
          )
        ).rows.length,
        0,
      );
      await role("postgres");
      assert.equal(
        (await db.query("select count(*)::int as n from auth.users")).rows[0].n,
        5,
      );
      assert.equal(
        (await db.query("select data from public.existing_work")).rows[0].data,
        "keep all data",
      );
      assert.equal(
        (
          await db.query(
            "select * from auth.identities where user_id=$1 and provider='custom:vk'",
            [orphan],
          )
        ).rows.length,
        1,
      );
      await role("service_role");
    });
    await test("the VK can be reconnected after an explicit disconnect", async () => {
      await pending(a, "101");
      assert.equal(
        (await rpc("leadly_confirm_vk_link", [a, h1, true])).ok,
        true,
      );
    });
    await test("the same owner can reconfirm the same VK without duplicating a connection", async () => {
      await pending(a, "101");
      assert.equal(
        (await rpc("leadly_confirm_vk_link", [a, h1, true])).ok,
        true,
      );
      assert.equal(
        (await db.query("select * from public.vk_accounts")).rows.length,
        1,
      );
    });
    await test("storage bounds reject invalid VK IDs, receipt hashes and excessive proof lifetime", async () => {
      await role("postgres");
      for (const id of ["0", "-1", "../x", "9".repeat(21)])
        await assert.rejects(() =>
          db.query(
            "update public.vk_accounts set vk_user_id=$1 where user_id=$2",
            [id, a],
          ),
        );
      await pending(b, "707", h2);
      await role("postgres");
      await assert.rejects(() =>
        db.query(
          "update public.vk_link_requests set token_hash='short' where user_id=$1",
          [b],
        ),
      );
      await assert.rejects(() =>
        db.query(
          "update public.vk_link_requests set expires_at=created_at+interval '11 minutes' where user_id=$1",
          [b],
        ),
      );
    });
    console.log(
      `RESULT ${passed}/${passed} VK account PostgreSQL checks passed`,
    );
  } finally {
    await db.close();
  }
})().catch((e) => {
  console.error("VK PostgreSQL checks failed: " + e.message);
  process.exitCode = 1;
});
