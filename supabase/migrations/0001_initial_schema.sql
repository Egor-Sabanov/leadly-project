-- LEADLY — Initial database schema
-- Stage 2: Database foundation
-- Target: Supabase PostgreSQL
--
-- Design principles:
-- 1. auth.users is the source of truth for identity.
-- 2. Every user-owned row is isolated by user_id + RLS.
-- 3. Global opportunity/source/catalog data is separated from user actions.
-- 4. AI scores and AI usage are versioned/traceable.
-- 5. Money records are immutable by default at the application layer.
-- 6. JSONB is used only for provider-specific metadata/evidence, not core relations.

create extension if not exists pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================

do $$ begin
  create type public.opportunity_type as enum ('freelance', 'job', 'project', 'client', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.opportunity_status as enum (
    'new',
    'saved',
    'applied',
    'replied',
    'negotiating',
    'won',
    'lost',
    'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.competition_level as enum ('low', 'medium', 'high', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.application_status as enum (
    'draft',
    'sent',
    'replied',
    'negotiating',
    'won',
    'lost',
    'withdrawn'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.client_status as enum ('lead', 'contacted', 'replied', 'meeting', 'proposal', 'won', 'lost', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.revenue_type as enum ('income', 'expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.goal_period as enum ('monthly', 'quarterly', 'yearly');
exception when duplicate_object then null; end $$;

-- ============================================================
-- COMMON FUNCTIONS
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_authenticated()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null;
$$;

-- ============================================================
-- USER / PROFILE DOMAIN
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  headline text,
  timezone text not null default 'Europe/Chisinau',
  locale text not null default 'ru',
  currency_code text not null default 'RUB' check (char_length(currency_code) = 3),
  target_monthly_income numeric(14,2) check (target_monthly_income is null or target_monthly_income >= 0),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  category text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profile_skills (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  level smallint check (level is null or level between 1 and 5),
  years_experience numeric(4,1) check (years_experience is null or years_experience >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, skill_id)
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  category text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profile_services (
  user_id uuid not null references auth.users(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  price_from numeric(14,2) check (price_from is null or price_from >= 0),
  price_to numeric(14,2) check (price_to is null or price_to >= 0),
  currency_code text not null default 'RUB' check (char_length(currency_code) = 3),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, service_id),
  check (price_to is null or price_from is null or price_to >= price_from)
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_opportunity_types public.opportunity_type[] not null default array['freelance', 'project', 'client']::public.opportunity_type[],
  preferred_competition public.competition_level[] not null default array['low', 'medium']::public.competition_level[],
  min_project_budget numeric(14,2) check (min_project_budget is null or min_project_budget >= 0),
  max_project_budget numeric(14,2) check (max_project_budget is null or max_project_budget >= 0),
  preferred_sources text[] not null default '{}',
  remote_only boolean not null default true,
  ai_recommendations_enabled boolean not null default true,
  telegram_notifications_enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  check (max_project_budget is null or min_project_budget is null or max_project_budget >= min_project_budget)
);

create table if not exists public.income_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period public.goal_period not null default 'monthly',
  target_amount numeric(14,2) not null check (target_amount >= 0),
  currency_code text not null default 'RUB' check (char_length(currency_code) = 3),
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_on >= starts_on)
);

-- ============================================================
-- OPPORTUNITY SOURCE / GLOBAL OPPORTUNITY DOMAIN
-- ============================================================

create table if not exists public.opportunity_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  base_url text,
  source_type text not null default 'public',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.opportunity_sources(id) on delete set null,
  external_id text,
  canonical_key text not null unique,
  type public.opportunity_type not null,
  title text not null,
  company_name text,
  description text,
  source_url text not null,
  category text,
  location text,
  remote boolean not null default true,
  budget_min numeric(14,2) check (budget_min is null or budget_min >= 0),
  budget_max numeric(14,2) check (budget_max is null or budget_max >= 0),
  currency_code text not null default 'RUB' check (char_length(currency_code) = 3),
  competition public.competition_level not null default 'unknown',
  published_at timestamptz,
  expires_at timestamptz,
  discovered_at timestamptz not null default timezone('utc', now()),
  raw_metadata jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (budget_max is null or budget_min is null or budget_max >= budget_min)
);

create table if not exists public.opportunity_scores (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  algorithm_version text not null,
  match_score smallint not null check (match_score between 0 and 100),
  money_score smallint not null check (money_score between 0 and 100),
  competition_score smallint not null check (competition_score between 0 and 100),
  fit_score smallint not null check (fit_score between 0 and 100),
  risk_score smallint not null check (risk_score between 0 and 100),
  explanation jsonb not null default '{}'::jsonb,
  scored_at timestamptz not null default timezone('utc', now()),
  unique (opportunity_id, user_id, algorithm_version)
);

-- User-specific opportunity state.
create table if not exists public.user_opportunities (
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status public.opportunity_status not null default 'new',
  is_saved boolean not null default false,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_viewed_at timestamptz,
  notes text,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, opportunity_id)
);

create table if not exists public.opportunity_status_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  from_status public.opportunity_status,
  to_status public.opportunity_status not null,
  changed_at timestamptz not null default timezone('utc', now()),
  note text
);

-- ============================================================
-- APPLICATION / SALES EXECUTION DOMAIN
-- ============================================================

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status public.application_status not null default 'draft',
  submitted_at timestamptz,
  expected_value numeric(14,2) check (expected_value is null or expected_value >= 0),
  currency_code text not null default 'RUB' check (char_length(currency_code) = 3),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, opportunity_id)
);

create table if not exists public.generated_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  model text not null,
  prompt_version text not null,
  content text not null,
  portfolio_match jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  client_id uuid,
  scheduled_for timestamptz not null,
  completed_at timestamptz,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

-- ============================================================
-- CLIENT / COMPANY / WEBSITE DOMAIN
-- ============================================================

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  industry text,
  description text,
  country text,
  city text,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (normalized_name, country, city)
);

create table if not exists public.websites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  url text not null,
  normalized_url text not null unique,
  title text,
  last_checked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text,
  role text,
  email text,
  phone text,
  telegram text,
  linkedin_url text,
  source_url text,
  is_public boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  status public.client_status not null default 'lead',
  source text,
  contact_id uuid references public.contacts(id) on delete set null,
  notes text,
  estimated_value numeric(14,2) check (estimated_value is null or estimated_value >= 0),
  currency_code text not null default 'RUB' check (char_length(currency_code) = 3),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);


alter table public.follow_ups
  drop constraint if exists follow_ups_client_id_fkey;

alter table public.follow_ups
  add constraint follow_ups_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete cascade;

create table if not exists public.client_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  website_id uuid references public.websites(id) on delete set null,
  title text not null,
  reason text,
  estimated_value numeric(14,2) check (estimated_value is null or estimated_value >= 0),
  currency_code text not null default 'RUB' check (char_length(currency_code) = 3),
  fit_score smallint check (fit_score is null or fit_score between 0 and 100),
  evidence jsonb not null default '[]'::jsonb,
  status public.client_status not null default 'lead',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.website_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  website_id uuid not null references public.websites(id) on delete cascade,
  audit_version text not null,
  score smallint not null check (score between 0 and 100),
  findings jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default timezone('utc', now())
);

-- ============================================================
-- MONEY DOMAIN
-- ============================================================

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.revenue_type not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency_code text not null default 'RUB' check (char_length(currency_code) = 3),
  occurred_on date not null,
  description text,
  client_id uuid references public.clients(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ============================================================
-- AI / RECOMMENDATION / COST DOMAIN
-- ============================================================

create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_type text not null,
  title text not null,
  content text not null,
  action_url text,
  priority smallint not null default 50 check (priority between 0 and 100),
  evidence jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz
);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost numeric(14,6) not null default 0 check (estimated_cost >= 0),
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_profile_skills_skill on public.profile_skills(skill_id);
create index if not exists idx_profile_services_service on public.profile_services(service_id);
create index if not exists idx_income_goals_user_active on public.income_goals(user_id, is_active);

create index if not exists idx_opportunities_source on public.opportunities(source_id);
create index if not exists idx_opportunities_type_active on public.opportunities(type, is_active);
create index if not exists idx_opportunities_published_at on public.opportunities(published_at desc);
create index if not exists idx_opportunities_category on public.opportunities(category);
create index if not exists idx_opportunities_remote on public.opportunities(remote);
create index if not exists idx_opportunities_budget on public.opportunities(budget_min, budget_max);
create index if not exists idx_opportunities_external on public.opportunities(source_id, external_id);

create index if not exists idx_scores_user_match on public.opportunity_scores(user_id, match_score desc);
create index if not exists idx_scores_opportunity on public.opportunity_scores(opportunity_id, scored_at desc);
create index if not exists idx_user_opportunities_status on public.user_opportunities(user_id, status, updated_at desc);
create index if not exists idx_user_opportunities_saved on public.user_opportunities(user_id, is_saved) where is_saved = true;
create index if not exists idx_status_history_user_time on public.opportunity_status_history(user_id, changed_at desc);

create index if not exists idx_applications_user_status on public.applications(user_id, status, updated_at desc);
create index if not exists idx_generated_applications_user on public.generated_applications(user_id, created_at desc);
create index if not exists idx_follow_ups_user_scheduled on public.follow_ups(user_id, scheduled_for) where completed_at is null;

create index if not exists idx_companies_name on public.companies(normalized_name);
create index if not exists idx_websites_company on public.websites(company_id);
create index if not exists idx_contacts_company on public.contacts(company_id);
create index if not exists idx_clients_user_status on public.clients(user_id, status, updated_at desc);
create index if not exists idx_client_opportunities_user_status on public.client_opportunities(user_id, status, updated_at desc);
create index if not exists idx_client_opportunities_company on public.client_opportunities(company_id);
create index if not exists idx_website_audits_user_site on public.website_audits(user_id, website_id, checked_at desc);

create index if not exists idx_transactions_user_date on public.transactions(user_id, occurred_on desc);
create index if not exists idx_transactions_user_type on public.transactions(user_id, type, occurred_on desc);

create index if not exists idx_ai_recommendations_user_time on public.ai_recommendations(user_id, generated_at desc);
create index if not exists idx_ai_usage_user_time on public.ai_usage(user_id, created_at desc);
create index if not exists idx_ai_usage_operation on public.ai_usage(operation, created_at desc);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

create or replace trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace trigger preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

create or replace trigger income_goals_set_updated_at
before update on public.income_goals
for each row execute function public.set_updated_at();

create or replace trigger sources_set_updated_at
before update on public.opportunity_sources
for each row execute function public.set_updated_at();

create or replace trigger opportunities_set_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

create or replace trigger user_opportunities_set_updated_at
before update on public.user_opportunities
for each row execute function public.set_updated_at();

create or replace trigger applications_set_updated_at
before update on public.applications
for each row execute function public.set_updated_at();

create or replace trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

create or replace trigger websites_set_updated_at
before update on public.websites
for each row execute function public.set_updated_at();

create or replace trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

create or replace trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create or replace trigger client_opportunities_set_updated_at
before update on public.client_opportunities
for each row execute function public.set_updated_at();

create or replace trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.profile_skills enable row level security;
alter table public.services enable row level security;
alter table public.profile_services enable row level security;
alter table public.user_preferences enable row level security;
alter table public.income_goals enable row level security;
alter table public.opportunity_sources enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_scores enable row level security;
alter table public.user_opportunities enable row level security;
alter table public.opportunity_status_history enable row level security;
alter table public.applications enable row level security;
alter table public.generated_applications enable row level security;
alter table public.follow_ups enable row level security;
alter table public.companies enable row level security;
alter table public.websites enable row level security;
alter table public.contacts enable row level security;
alter table public.clients enable row level security;
alter table public.client_opportunities enable row level security;
alter table public.website_audits enable row level security;
alter table public.transactions enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.ai_usage enable row level security;

-- Profiles
create policy profiles_select_own on public.profiles
for select using (auth.uid() = id);
create policy profiles_insert_own on public.profiles
for insert with check (auth.uid() = id);
create policy profiles_update_own on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

-- Catalogs: readable by authenticated users. Writes will later be restricted to service/admin roles.
create policy skills_select_authenticated on public.skills
for select using (public.is_authenticated());
create policy services_select_authenticated on public.services
for select using (public.is_authenticated());
create policy sources_select_authenticated on public.opportunity_sources
for select using (public.is_authenticated());

-- User-owned profile configuration
create policy profile_skills_select_own on public.profile_skills
for select using (auth.uid() = user_id);
create policy profile_skills_insert_own on public.profile_skills
for insert with check (auth.uid() = user_id);
create policy profile_skills_update_own on public.profile_skills
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy profile_skills_delete_own on public.profile_skills
for delete using (auth.uid() = user_id);

create policy profile_services_select_own on public.profile_services
for select using (auth.uid() = user_id);
create policy profile_services_insert_own on public.profile_services
for insert with check (auth.uid() = user_id);
create policy profile_services_update_own on public.profile_services
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy profile_services_delete_own on public.profile_services
for delete using (auth.uid() = user_id);

create policy preferences_select_own on public.user_preferences
for select using (auth.uid() = user_id);
create policy preferences_insert_own on public.user_preferences
for insert with check (auth.uid() = user_id);
create policy preferences_update_own on public.user_preferences
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy preferences_delete_own on public.user_preferences
for delete using (auth.uid() = user_id);

create policy income_goals_select_own on public.income_goals
for select using (auth.uid() = user_id);
create policy income_goals_insert_own on public.income_goals
for insert with check (auth.uid() = user_id);
create policy income_goals_update_own on public.income_goals
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy income_goals_delete_own on public.income_goals
for delete using (auth.uid() = user_id);

-- Global opportunity data: authenticated users can read, but client writes are blocked.
create policy opportunities_select_authenticated on public.opportunities
for select using (public.is_authenticated());

create policy opportunity_scores_select_own on public.opportunity_scores
for select using (auth.uid() = user_id);
create policy opportunity_scores_insert_own on public.opportunity_scores
for insert with check (auth.uid() = user_id);
create policy opportunity_scores_update_own on public.opportunity_scores
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy opportunity_scores_delete_own on public.opportunity_scores
for delete using (auth.uid() = user_id);

create policy user_opportunities_select_own on public.user_opportunities
for select using (auth.uid() = user_id);
create policy user_opportunities_insert_own on public.user_opportunities
for insert with check (auth.uid() = user_id);
create policy user_opportunities_update_own on public.user_opportunities
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_opportunities_delete_own on public.user_opportunities
for delete using (auth.uid() = user_id);

create policy status_history_select_own on public.opportunity_status_history
for select using (auth.uid() = user_id);
create policy status_history_insert_own on public.opportunity_status_history
for insert with check (auth.uid() = user_id);

create policy applications_select_own on public.applications
for select using (auth.uid() = user_id);
create policy applications_insert_own on public.applications
for insert with check (auth.uid() = user_id);
create policy applications_update_own on public.applications
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy applications_delete_own on public.applications
for delete using (auth.uid() = user_id);

create policy generated_applications_select_own on public.generated_applications
for select using (auth.uid() = user_id);
create policy generated_applications_insert_own on public.generated_applications
for insert with check (auth.uid() = user_id);

create policy follow_ups_select_own on public.follow_ups
for select using (auth.uid() = user_id);
create policy follow_ups_insert_own on public.follow_ups
for insert with check (auth.uid() = user_id);
create policy follow_ups_update_own on public.follow_ups
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy follow_ups_delete_own on public.follow_ups
for delete using (auth.uid() = user_id);

-- Global company research data is readable to authenticated users.
create policy companies_select_authenticated on public.companies
for select using (public.is_authenticated());
create policy websites_select_authenticated on public.websites
for select using (public.is_authenticated());
create policy contacts_select_authenticated on public.contacts
for select using (public.is_authenticated());

-- User-owned CRM/research records.
create policy clients_select_own on public.clients
for select using (auth.uid() = user_id);
create policy clients_insert_own on public.clients
for insert with check (auth.uid() = user_id);
create policy clients_update_own on public.clients
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy clients_delete_own on public.clients
for delete using (auth.uid() = user_id);

create policy client_opportunities_select_own on public.client_opportunities
for select using (auth.uid() = user_id);
create policy client_opportunities_insert_own on public.client_opportunities
for insert with check (auth.uid() = user_id);
create policy client_opportunities_update_own on public.client_opportunities
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy client_opportunities_delete_own on public.client_opportunities
for delete using (auth.uid() = user_id);

create policy website_audits_select_own on public.website_audits
for select using (auth.uid() = user_id);
create policy website_audits_insert_own on public.website_audits
for insert with check (auth.uid() = user_id);

create policy transactions_select_own on public.transactions
for select using (auth.uid() = user_id);
create policy transactions_insert_own on public.transactions
for insert with check (auth.uid() = user_id);
create policy transactions_update_own on public.transactions
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy transactions_delete_own on public.transactions
for delete using (auth.uid() = user_id);

create policy ai_recommendations_select_own on public.ai_recommendations
for select using (auth.uid() = user_id);
create policy ai_recommendations_insert_own on public.ai_recommendations
for insert with check (auth.uid() = user_id);
create policy ai_recommendations_update_own on public.ai_recommendations
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ai_recommendations_delete_own on public.ai_recommendations
for delete using (auth.uid() = user_id);

create policy ai_usage_select_own on public.ai_usage
for select using (auth.uid() = user_id);
create policy ai_usage_insert_own on public.ai_usage
for insert with check (auth.uid() = user_id);

-- ============================================================
-- COMMENTS / DOCUMENTATION IN DB
-- ============================================================

comment on table public.opportunities is 'Global normalized opportunity records. Ingestion should use service role; users only read.';
comment on column public.opportunities.canonical_key is 'Stable dedupe key generated by ingestion from source + normalized external identity/content.';
comment on column public.opportunities.evidence is 'Traceable source evidence used by AI/recommendations; avoid storing unnecessary copyrighted content.';
comment on table public.opportunity_scores is 'Per-user, versioned scoring snapshots so scoring logic can evolve without rewriting history.';
comment on table public.user_opportunities is 'User-specific state for a global opportunity: saved, status, notes and viewing state.';
comment on table public.transactions is 'User financial ledger. Application layer should prefer append-only corrections over destructive edits.';
comment on table public.ai_usage is 'Token/cost accounting for AI operations used for unit economics and abuse control.';
