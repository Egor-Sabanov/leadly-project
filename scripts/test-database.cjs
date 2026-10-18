const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const { pgcrypto } = require("@electric-sql/pglite/contrib/pgcrypto");
let passed = 0;
async function main() {
  const db = new PGlite({ extensions: { pgcrypto } });
  const run = async (name, fn) => {
    await fn();
    passed++;
    console.log("PASS " + name);
  };
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222",
    o = "33333333-3333-4333-8333-333333333333";
  const admin = () => db.exec("reset role");
  const asUser = async (id) => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  };
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`,
    );
    for (const file of [
      "0001_initial_schema.sql",
      "0002_seed_skill_service_catalog.sql",
      "0003_expand_webdev_skill_service_catalog.sql",
    ])
      await db.exec(
        fs.readFileSync(
          path.join(__dirname, "../supabase/migrations", file),
          "utf8",
        ),
      );
    const sql = fs.readFileSync(
      path.join(__dirname, "../supabase/migrations/0004_mvp_workflows.sql"),
      "utf8",
    );
    await run(
      "existing profile trigger is preserved without installing a duplicate",
      async () => {
        await db.exec(
          `create function public.legacy_profile() returns trigger language plpgsql security definer as $$begin insert into public.profiles(id) values(new.id);return new;end$$;create trigger legacy_profile after insert on auth.users for each row execute function public.legacy_profile();`,
        );
        await db.exec(sql);
        const r = await db.query(
          "select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal",
        );
        assert.deepEqual(
          r.rows.map((r) => r.tgname),
          ["legacy_profile"],
        );
        await db.exec("drop trigger legacy_profile on auth.users");
      },
    );
    await run(
      "all four migrations apply; MVP migration is repeatable",
      async () => {
        await db.exec(sql);
        await db.exec(sql);
      },
    );
    await run(
      "digital catalog migration is additive and repeatable",
      async () => {
        const catalog = fs.readFileSync(
          path.join(
            __dirname,
            "../supabase/migrations/0005_expand_digital_catalog.sql",
          ),
          "utf8",
        );
        const before = (
          await db.query("select id,name,slug from public.skills order by slug")
        ).rows;
        await db.exec(catalog);
        const first = (
          await db.query("select id,name,slug from public.skills order by slug")
        ).rows;
        await db.exec(catalog);
        const second = (
          await db.query("select id,name,slug from public.skills order by slug")
        ).rows;
        assert.deepEqual(first, second);
        for (const old of before)
          assert.deepEqual(
            second.find((r) => r.slug === old.slug),
            old,
          );
        for (const slug of [
          "davinci-resolve",
          "voiceover",
          "written-translation",
          "ozon",
          "power-bi",
          "course-development",
        ])
          assert.ok(second.some((r) => r.slug === slug));
        assert.ok(
          (
            await db.query(
              "select count(distinct category)::int as n from public.skills",
            )
          ).rows[0].n >= 12,
        );
      },
    );
    await db.exec(
      "grant usage on schema public to authenticated,anon,service_role;grant select,insert,update,delete on all tables in schema public to authenticated,service_role;grant usage,select on all sequences in schema public to authenticated,service_role;",
    );
    await run("new auth users receive one profile each", async () => {
      await db.query(
        "insert into auth.users(id,raw_user_meta_data) values($1,$2),($3,$4)",
        [a, { display_name: "Анна" }, b, { display_name: "Борис" }],
      );
      assert.equal(
        (await db.query("select count(*)::int as n from public.profiles"))
          .rows[0].n,
        2,
      );
    });
    await db.query(
      "insert into public.opportunities(id,canonical_key,type,title,source_url) values($1,'test-opportunity','project','Test Figma project','https://example.com/task')",
      [o],
    );
    await asUser(a);
    const saveProfile = () =>
      db.query(
        "select public.leadly_save_profile('Анна Дизайнер','UI/UX','Figma',100000,'RUB',array['project']::public.opportunity_type[],true,true,false,'Europe/Moscow')",
      );
    await run("profile and preferences save together", async () => {
      await saveProfile();
      assert.equal(
        (
          await db.query(
            "select onboarding_completed from public.profiles where id=$1",
            [a],
          )
        ).rows[0].onboarding_completed,
        true,
      );
      assert.equal(
        (
          await db.query(
            "select remote_only from public.user_preferences where user_id=$1",
            [a],
          )
        ).rows[0].remote_only,
        true,
      );
    });
    await run("blank name and empty preferences are rejected", async () => {
      await assert.rejects(
        db.query(
          "select public.leadly_save_profile('', '', '', 1,'RUB',array['project']::public.opportunity_type[],true,true,false,'Europe/Moscow')",
        ),
      );
      await assert.rejects(
        db.query(
          "select public.leadly_save_profile('А', '', '', 1,'RUB',array[]::public.opportunity_type[],true,true,false,'Europe/Moscow')",
        ),
      );
    });
    await run(
      "failed preferences write rolls back profile change",
      async () => {
        await admin();
        await db.exec(
          "create policy test_deny_preferences on public.user_preferences as restrictive for all to authenticated using(false) with check(false)",
        );
        await asUser(a);
        await assert.rejects(
          db.query(
            "select public.leadly_save_profile('Changed', '', '', 1,'RUB',array['project']::public.opportunity_type[],true,true,false,'Europe/Moscow')",
          ),
        );
        assert.equal(
          (
            await db.query(
              "select display_name from public.profiles where id=$1",
              [a],
            )
          ).rows[0].display_name,
          "Анна Дизайнер",
        );
        await admin();
        await db.exec(
          "drop policy test_deny_preferences on public.user_preferences",
        );
        await asUser(a);
      },
    );
    await run("status, saved flag, and notes persist atomically", async () => {
      await db.query(
        "select public.leadly_update_opportunity($1,'applied',true,'Написать в понедельник')",
        [o],
      );
      assert.equal(
        (await db.query("select status from public.user_opportunities")).rows[0]
          .status,
        "applied",
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from public.opportunity_status_history",
          )
        ).rows[0].n,
        1,
      );
    });
    await run(
      "saving notes or the same status does not add fake history",
      async () => {
        await db.query(
          "select public.leadly_update_opportunity($1,'applied',null,'Новая заметка')",
          [o],
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int as n from public.opportunity_status_history",
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await run("failed history write rolls back status update", async () => {
      await admin();
      await db.exec(
        "create policy test_deny_history on public.opportunity_status_history as restrictive for insert to authenticated with check(false)",
      );
      await asUser(a);
      await assert.rejects(
        db.query("select public.leadly_update_opportunity($1,'won')", [o]),
      );
      assert.equal(
        (await db.query("select status from public.user_opportunities")).rows[0]
          .status,
        "applied",
      );
      await admin();
      await db.exec(
        "drop policy test_deny_history on public.opportunity_status_history",
      );
      await asUser(a);
    });
    await run("second user cannot read or update first user data", async () => {
      await asUser(b);
      assert.equal(
        (await db.query("select * from public.user_opportunities")).rows.length,
        0,
      );
      assert.equal(
        (await db.query("select * from public.opportunity_status_history")).rows
          .length,
        0,
      );
      assert.equal(
        (await db.query("select * from public.profiles")).rows.length,
        1,
      );
      await db.query(
        "update public.user_opportunities set notes='attack' where user_id=$1",
        [a],
      );
      await asUser(a);
      assert.equal(
        (await db.query("select notes from public.user_opportunities")).rows[0]
          .notes,
        "Новая заметка",
      );
    });
    await run("forged ownership in direct insert is rejected", async () => {
      await asUser(b);
      await assert.rejects(
        db.query(
          "insert into public.user_opportunities(user_id,opportunity_id) values($1,$2)",
          [a, o],
        ),
      );
    });
    await run(
      "same opportunity has independent state for both users",
      async () => {
        await db.query(
          "select public.leadly_update_opportunity($1,'saved',true,'Личное Б')",
          [o],
        );
        await asUser(a);
        assert.equal(
          (await db.query("select notes from public.user_opportunities"))
            .rows[0].notes,
          "Новая заметка",
        );
        await asUser(b);
        assert.equal(
          (await db.query("select notes from public.user_opportunities"))
            .rows[0].notes,
          "Личное Б",
        );
      },
    );
    await run(
      "authenticated user cannot reserve or reset server AI quota",
      async () => {
        await assert.rejects(
          db.query("select public.leadly_reserve_ai($1)", [b]),
        );
        assert.equal(
          (await db.query("select * from public.leadly_ai_requests")).rows
            .length,
          0,
        );
      },
    );
    await run(
      "server AI quota enforces 20 requests per user per rolling day",
      async () => {
        await admin();
        await db.exec("set role service_role");
        for (let i = 0; i < 20; i++)
          assert.equal(
            (await db.query("select public.leadly_reserve_ai($1) as ok", [a]))
              .rows[0].ok,
            true,
          );
        assert.equal(
          (await db.query("select public.leadly_reserve_ai($1) as ok", [a]))
            .rows[0].ok,
          false,
        );
        assert.equal(
          (await db.query("select public.leadly_reserve_ai($1) as ok", [b]))
            .rows[0].ok,
          true,
        );
      },
    );
    await run("anonymous role cannot call private workflow RPCs", async () => {
      await admin();
      await db.exec("set role anon");
      await assert.rejects(
        db.query("select public.leadly_update_opportunity($1,'won')", [o]),
      );
    });
    console.log(
      `RESULT ${passed}/${passed} database checks passed (local PostgreSQL/WASM; Supabase Auth is simulated)`,
    );
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
