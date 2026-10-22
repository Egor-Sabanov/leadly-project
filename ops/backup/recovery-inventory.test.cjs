const assert = require("node:assert/strict");
const { inspectRecovery } = require("./recovery-inventory.cjs");
const ref = "a".repeat(20), token = "fixture-management-token";
const inventory = { readOnly: true, authUsers: 0, storageObjects: 0, publicObjects: [], managedColumns: [], extensions: [] };
(async () => {
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++; assert.equal(url, "https://api.supabase.com/v1/projects/" + ref + "/database/query");
    assert.equal(options.redirect, "manual"); assert.equal(options.headers.Authorization, "Bearer " + token);
    const body = JSON.parse(options.body); assert.equal(body.read_only, true); assert(body.query.includes("as recovery_target_inventory"));
    return Response.json([{ recovery_target_inventory: inventory }], { status: 201 });
  };
  for (const target of ["leezcyaqhozguvcehcpd", "", ref + "/../production", "https://example.com"]) await assert.rejects(() => inspectRecovery({ ref: target, token, fetcher }), /separate_recovery_project_required/);
  assert.equal(calls, 0);
  await assert.rejects(() => inspectRecovery({ ref, fetcher }), /recovery_management_credential_missing/); assert.equal(calls, 0);
  assert.deepEqual(await inspectRecovery({ ref, token, fetcher }), { readOnly: true, targetRef: ref, productionWritten: false, inventory });
  for (const code of [401, 403]) await assert.rejects(() => inspectRecovery({ ref, token, fetcher: async () => new Response("secret upstream details", { status: code }) }), /^Error: recovery_management_access_denied$/);
  await assert.rejects(() => inspectRecovery({ ref, token, fetcher: async () => new Response("private details", { status: 302, headers: { Location: "https://elsewhere.invalid" } }) }), /^Error: recovery_inventory_query_failed$/);
  await assert.rejects(() => inspectRecovery({ ref, token, fetcher: async () => { throw new Error(token); } }), /^Error: recovery_inventory_transport_failed$/);
  for (const body of [{ private: token }, [{ recovery_target_inventory: { ...inventory, readOnly: false } }], [{ recovery_target_inventory: { ...inventory, authUsers: -1 } }]]) await assert.rejects(() => inspectRecovery({ ref, token, fetcher: async () => Response.json(body) }), /^Error: invalid_recovery_inventory$/);
  // Occupied targets are reported honestly; an inventory never authorizes writes.
  const occupied = await inspectRecovery({ ref, token, fetcher: async () => Response.json([{ recovery_target_inventory: { ...inventory, authUsers: 3 } }]) });
  assert.equal(occupied.inventory.authUsers, 3); assert.equal(occupied.productionWritten, false);
  console.log("RESULT 8 recovery inventory safety checks; real outbound requests 0");
})().catch(error => { console.error(error); process.exitCode = 1; });
