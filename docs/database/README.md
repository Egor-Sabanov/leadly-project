# LEADLY — Database Foundation

## Migration

`supabase/migrations/0001_initial_schema.sql` contains the initial Supabase/PostgreSQL schema for Stage 2.

## Core separation

### Global data
- `skills`
- `services`
- `opportunity_sources`
- `opportunities`
- `companies`
- `websites`
- `contacts`

These represent reusable platform data. Client-side writes are intentionally restricted for the global ingestion/research entities.

### User-owned data
- `profiles`
- `profile_skills`
- `profile_services`
- `user_preferences`
- `income_goals`
- `opportunity_scores`
- `user_opportunities`
- `opportunity_status_history`
- `applications`
- `generated_applications`
- `follow_ups`
- `clients`
- `client_opportunities`
- `website_audits`
- `transactions`
- `ai_recommendations`
- `ai_usage`

All user-owned tables use `auth.uid()` in RLS policies.

## Important design decisions

1. **Supabase Auth owns identity.** `profiles.id = auth.users.id`.
2. **Opportunities are global; user state is separate.** This prevents duplicating the same opportunity for every user.
3. **`canonical_key` prevents duplicate opportunities.** The ingestion pipeline is responsible for generating it deterministically.
4. **Scores are versioned.** `algorithm_version` lets LEADLY change scoring without destroying old results.
5. **Evidence is stored with AI-derived records.** Recommendations and audits should be traceable to a source.
6. **Money is numeric, not floating-point.** Amounts use `numeric(14,2)`.
7. **AI cost is tracked.** `ai_usage` is required for unit economics and later plan limits.
8. **RLS is enabled from day one.** No user-owned table should depend on UI filtering for security.
9. **JSONB is intentionally limited.** It is for provider metadata/evidence where the structure can vary; core entities remain relational.
10. **Agency support is not overbuilt yet.** The schema can later add workspaces/memberships without changing the fundamental user-owned model.

## Next database steps

After this migration is applied and checked in Supabase:

1. Verify tables and foreign keys.
2. Verify RLS with two test users.
3. Add minimal seed data for skills/services/sources.
4. Build Supabase server/browser clients.
5. Move authentication/onboarding to real data.
