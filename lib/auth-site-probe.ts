import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validUuid } from "./request-guards";

/** An explicit isolated Auth check, not part of read-only readiness/builds.
 * It never sends email or consumes a token and deletes only its marked user. */
export async function probeSupabaseSiteURL(db: SupabaseClient, expectedOrigin: string) {
  const marker = randomUUID();
  const email = `leadly-site-${marker}@example.com`;
  let ownId: string | null = null;
  const report = { readOnly: false, completed: false, cleaned: false, mailSent: false, expectedOrigin, defaultOrigin: null as string | null, siteURLMatches: false, errorCode: null as string | null };
  try {
    const created = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { leadly_validation_run: marker } });
    if (created.error || !validUuid(created.data.user?.id)) throw new Error("fixture_failed");
    ownId = created.data.user.id;
    // No redirectTo option: this deliberately checks Supabase's Site URL,
    // rather than whether one explicit application callback is allowlisted.
    const link = await db.auth.admin.generateLink({ type: "recovery", email });
    if (link.error || link.data.user?.id !== ownId) throw new Error("link_probe_failed");
    const properties = link.data.properties;
    const destination = properties.redirect_to || new URL(properties.action_link).searchParams.get("redirect_to");
    if (!destination) throw new Error("missing_default");
    const url = new URL(destination);
    report.defaultOrigin = url.origin;
    report.siteURLMatches = url.origin === expectedOrigin && url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash;
    report.completed = true;
    if (!report.siteURLMatches) report.errorCode = "site_url_mismatch";
  } catch {
    report.errorCode = "site_url_probe_failed";
  } finally {
    if (ownId) {
      try {
        const own = await db.auth.admin.getUserById(ownId);
        if (own.error || own.data.user?.id !== ownId || own.data.user.user_metadata.leadly_validation_run !== marker) throw new Error();
        const deleted = await db.auth.admin.deleteUser(ownId);
        if (deleted.error) throw new Error();
        report.cleaned = true;
      } catch { report.errorCode = "fixture_cleanup_failed"; }
    } else report.cleaned = true;
  }
  return report;
}
