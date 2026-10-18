# LEADLY RSS/Atom ingestion v2

This endpoint imports public RSS/Atom feed entries into `opportunity_sources` and `opportunities`.
It is intentionally opt-in: no feeds are hardcoded, and the endpoint will not crawl arbitrary websites.

## Server environment

Set these variables in `.env.local` for local testing and in the deployment provider's server-side environment for production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only secret; never expose it to browser code or commit it.
- `CRON_SECRET` — long random secret.
- `LEADLY_RSS_FEEDS` — comma-separated or newline-separated HTTPS RSS/Atom URLs from sources whose terms permit this use.

## Run manually

Start the app, then send an authenticated GET request:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/ingest
```

Expected responses: `401` if the secret is missing/wrong; `400` if no feeds are configured; `503` if server-side Supabase configuration is missing; otherwise a JSON report per feed.

## Production scheduling

Schedule a GET to `/api/cron/ingest` with `Authorization: Bearer $CRON_SECRET` from a trusted scheduler. Do not expose the secret in client-side code or public URLs. Start with a low frequency (e.g. every 6 hours) and review the import report before increasing it.

## Limitations

- This first connector supports RSS/Atom only, not authenticated marketplaces or general website scraping.
- Imported records are heuristically categorized; imported does not mean verified, available, or a good earning opportunity.
- Budget extraction now attempts a conservative heuristic in v2; company and remote-work fields are still not reliably inferred. Missing or inferred values must not be treated as verified.
- Duplicate URLs are normalized and keyed by SHA-256. Feed source name is based on hostname.
- The service-role key bypasses RLS, so the endpoint is protected with a bearer secret and must only be invoked by a trusted caller.

## v2 safeguards and quality improvements

- Budget extraction is heuristic and stores `budget_min`, `budget_max`, and a detected `currency_code` when amounts are found in the title/description.
- `raw_metadata.budget_extraction` records whether a budget was estimated or not found.
- Feed URLs must be HTTPS, without credentials or non-standard ports; DNS results and redirect targets are checked against private/reserved IP ranges. Redirects are manual and limited to three hops. DNS validation is a defense-in-depth check, not a substitute for an egress firewall or IP-pinned HTTP client against DNS rebinding.
- Treat extracted budgets as hints, not verified prices. The extractor requires budget context or an explicit currency marker and records `budget_confidence` and `currency_evidence` in `raw_metadata`. Currency can still be ambiguous; confirm values from the original source before outreach. Unknown currency currently falls back to RUB because the database column is non-null; `currency_evidence: defaulted_rub` identifies that fallback.
- Feed response bodies are streamed with a 2 MB maximum, with a 12-second timeout and at most three redirects.


## Local regression checks

After installing project dependencies, run `npm run test:rss`. The script exercises the URL/IP filter, RSS parsing, URL deduplication, and budget extraction helpers without contacting RSS sources or Supabase. Passing these tests does not verify the full Next.js build or live ingestion.
