const fs = require("node:fs");
const path = require("node:path");
const production = "leezcyaqhozguvcehcpd";

async function inspectRecovery({ ref, token, fetcher = fetch }) {
  // Validate the target before any credential use or network activity.
  if (!/^[a-z0-9]{20}$/.test(ref || "") || ref === production) throw new Error("separate_recovery_project_required");
  if (!token) throw new Error("recovery_management_credential_missing");
  const query = fs.readFileSync(path.join(__dirname, "../../supabase/ops/inspect-recovery-target.sql"), "utf8");
  let response;
  try {
    response = await fetcher("https://api.supabase.com/v1/projects/" + ref + "/database/query", {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(30000),
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ query, read_only: true }),
    });
  } catch { throw new Error("recovery_inventory_transport_failed"); }
  if ([401, 403].includes(response.status)) throw new Error("recovery_management_access_denied");
  if (!response.ok) throw new Error("recovery_inventory_query_failed");
  let rows;
  try { rows = await response.json(); } catch { throw new Error("invalid_recovery_inventory"); }
  const inventory = Array.isArray(rows) && rows.length === 1 && rows[0]?.recovery_target_inventory;
  if (!inventory || inventory.readOnly !== true || !Number.isSafeInteger(inventory.authUsers) || inventory.authUsers < 0 || !Number.isSafeInteger(inventory.storageObjects) || inventory.storageObjects < 0 || !Array.isArray(inventory.publicObjects) || !Array.isArray(inventory.managedColumns) || !Array.isArray(inventory.extensions)) throw new Error("invalid_recovery_inventory");
  return { targetRef: ref, readOnly: true, productionWritten: false, inventory };
}
module.exports = { inspectRecovery };
if (require.main === module) inspectRecovery({ ref: process.env.LEADLY_RECOVERY_PROJECT_REF, token: process.env.LEADLY_SUPABASE_MANAGEMENT_TOKEN })
  .then(report => {
    const file = process.env.LEADLY_RECOVERY_INVENTORY_FILE;
    if (!file || !path.isAbsolute(file)) throw new Error("private_inventory_report_path_required");
    fs.writeFileSync(file, JSON.stringify(report, null, 2), { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ readOnly: true, productionWritten: false, targetRef: report.targetRef, authUsers: report.inventory.authUsers, storageObjects: report.inventory.storageObjects, publicObjects: report.inventory.publicObjects.length, reportSaved: true }));
  })
  .catch(error => { console.error(JSON.stringify({ completed: false, error: /^[a-z_]+$/.test(error.message) ? error.message : "recovery_inventory_failed" })); process.exitCode = 1; });
