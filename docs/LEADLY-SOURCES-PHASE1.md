# LEADLY source inventory and connector rollout

## Current source map

| Source | Transport | LEADLY type | State | Notes |
|---|---|---|---|---|
| We Work Remotely | RSS | `job` | Existing | Employment listings; not necessarily direct freelance client orders. |
| Hacker News — Who is Hiring / Freelancer | RSS | `client`, `freelance`, or `other` | Existing | Read the comment body marker; `SEEKING FREELANCER` is a client lead, `SEEKING WORK` is a freelancer advertising their services, ambiguous items stay `other`. |
| Codeur Projects | RSS | `project` | Existing | French-language client project feed. |
| Jobicy contract jobs | RSS | `job` | Phase 1 | Filtered recent remote engineering contract roles. Public feed, no key. Keep polling at no more than once per hour. |
| Remotive Software Development | RSS | `job` | Phase 1 | Public RSS; preserve the Remotive listing URL and name the source in the UI. |
| Freelancehunt Projects | Official API | `project` | Phase 1, requires user token | Read-only open project import; API token is server-side only. |

## Planned sources — not yet connected

| Source | Preferred connection | Why it is not in phase 1 |
|---|---|---|
| Telegram channels | Bot API for channels where the bot is added with appropriate rights; forwarding-to-bot fallback for other public channels | Requires selecting the access mode, creating a bot/webhook secret and identifying the allowed channels. A normal bot cannot simply read every public channel it has not been added to. |
| Freelancer.com | Official Developer API | Requires API account/credentials and compliance with the provider's application/access conditions. |
| Upwork | Official API only | Access depends on developer authorization and API policy. No website scraping or credential automation. |
| Kwork | Official/authorized integration only | The terms prohibit unauthorized automated collection; do not implement a scraper without written permission or a supported API. |
| Arbeitnow | Public JSON API | Job-board connector; separate adapter needed because current ingestion route parses RSS/Atom. |
| More project exchanges and job boards | Official API, RSS, partner feed, or explicit permission | Connector is added only after verifying access terms, fields, source URL, pagination/rate limits, and source classification. |

## Connector contract

Every connector should:

1. Produce normalized opportunity records with stable external IDs and canonical deduplication keys.
2. Retain the source's canonical listing URL and source attribution.
3. Classify intent separately: client project, employment vacancy, freelancer advertising services, or ambiguous.
4. Preserve publication/expiry timestamps and avoid treating missing dates as newly published.
5. Store budget currency/provenance and never turn heuristic values into verified budget data.
6. Use bounded requests/timeouts, host allowlists for pagination, rate limits and a per-source import report.
7. Fail independently: an unavailable source must not block the other connectors.
8. Include fixture tests for classification, parsing, deduplication, budget fields, expired/closed records and error responses.

## Rollout order

1. Confirm Phase 1: Freelancehunt API + Jobicy/Remotive RSS, preserving current WWR/HN/Codeur.
2. Add Telegram intake with a documented permitted access method, then test client-intent classification on forwarded/channel posts.
3. Add one approved marketplace API connector at a time (Freelancer.com/Upwork as access permits).
4. Add Arbeitnow's JSON adapter and more public/partner sources.
5. Handle Kwork only through explicit authorization or a supported official interface.
