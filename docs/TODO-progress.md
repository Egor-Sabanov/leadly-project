# LEADLY TODO progress

## Completed / implemented in source
- [x] Product concept and architecture baseline
- [x] Initial database schema, indexes and RLS policies
- [x] Supabase Auth → Profile trigger (validated in the database during audit)
- [x] Auth page and onboarding/profile route implementation (local browser smoke checks performed by user)
- [x] Opportunities feed reads existing active rows from Supabase
- [x] Save/unsave opportunity state through `user_opportunities`
- [x] Initial deterministic Match Score / Money Score algorithm v1
- [x] Persist score snapshots in `opportunity_scores` when the opportunities page loads
- [x] Pure scoring function type-checks and basic score behavior tests pass

## In progress / not yet verified end-to-end
- [ ] Full project build/lint with installed dependencies
- [ ] Confirm score upsert against the user's actual Supabase project
- [x] Skills/services CRUD UI backed by profile_skills/profile_services (catalog migration included; apply in Supabase before use)
- [ ] Use structured skills/services in Match Score (next scoring iteration)
- [ ] Real source ingestion / scheduled sync (source/API selection and terms review required)
- [ ] Opportunity detail and status history
- [ ] AI application generation
- [ ] Client Finder / CRM
- [ ] Money Engine
- [ ] Telegram bot and Mini App
- [ ] Analytics, monetization, E2E and production deploy

## Scoring v1 notes
- Match Score combines keyword fit, preferred opportunity type, remote preference, competition preference and freshness.
- Money Score estimates budget fit relative to the monthly income target.
- Risk Score rises for high competition, missing budget and stale opportunities.
- These are transparent heuristics, not AI predictions or guarantees of income. They will improve once skills/services and reliable source metadata are populated.


## Skills/services step
- Added `/profile/skills` to manage a user's skills (level/experience) and services (price range).
- Added migration `0002_seed_skill_service_catalog.sql` to seed shared catalog values idempotently. Apply it in Supabase SQL Editor before using the page.
- Full app build was not verified in this environment because dependency installation timed out.


## 2026-10-08 — Scoring personalization v2
- Match Score now includes profile skill and service catalog names fetched through Supabase relations.
- Matched skills and services contribute to fit score and are listed in the score explanation.
- Scores are written with algorithm_version `v2`, preserving historical `v1` rows.
- Build verification attempted; the current environment has no runnable `next` binary (`next: not found`), so full application build remains unverified.


## Реализовано в текущем шаге (2026-10-09)
- Добавлено управление статусом возможности из ленты: новая, сохранена, откликнулся, получен ответ, переговоры, успех, не подошла, в архиве.
- Изменение статуса сохраняется в `user_opportunities`; попытка записать историю выполняется в `opportunity_status_history`.
- Добавлены сообщения об успешном сохранении и ошибках, адаптивное оформление селектора статуса.
- Не проверено: полная Next.js-сборка и запись в реальный Supabase пользователя.

## 2026-10-09 — RSS ingestion v2 hardening
- Added heuristic extraction of budget range/currency into structured opportunity fields.
- Added basic validation to reject non-HTTPS, credential-bearing, localhost and common private IPv4 feed URLs.
- Marks budget extraction provenance in raw metadata; extracted budgets are explicitly heuristic and require verification.
- Not yet verified against live RSS sources or a live Supabase project; full build still needs to be run in the user's environment.


## 2026-10-09 — RSS ingestion hardening pass
- [x] Added DNS-result checks for private/reserved IPs and validation of each redirect target.
- [x] Switched redirects to manual handling (maximum 3) and streamed response bodies with a 2 MB cap.
- [x] Made budget extraction more conservative and recorded confidence/currency provenance.
- [ ] Run lint/build and unit tests in an environment with dependencies installed.
- [ ] Validate against a small, approved live feed and the actual Supabase project.
- Note: DNS lookup checks reduce SSRF risk but do not fully prevent DNS rebinding because the HTTP client performs its own resolution; production should also use network egress restrictions or an IP-pinned client.


## 2026-10-09 — RSS ingestion v2 follow-up hardening
- [x] Expanded private/reserved/documentation IP rejection for IPv4 and special IPv6 ranges.
- [x] Revalidate redirect destinations and cancel redirect response bodies; enforce response byte limit while streaming.
- [x] Tightened budget candidate selection, decimal-comma parsing, range extraction and currency provenance.
- [x] Hardened invalid XML numeric-entity handling.
- [x] Fixed canonical URL normalization to preserve case-sensitive paths/query values while removing tracking parameters.
- [x] Added reproducible `npm run test:rss` helper and endpoint regression checks (33 cases).
- [x] TypeScript strict check passed for the RSS route with temporary ambient stubs for unavailable package typings.
- [ ] Full `npm ci`, ESLint and production build in the real project environment.
- [ ] Live feed import and Supabase upsert test.
- [ ] Production egress/DNS-rebinding protection (application DNS validation alone is not sufficient).
