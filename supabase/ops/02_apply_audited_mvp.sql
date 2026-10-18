-- LEADLY update after the owner-supplied schema audit, 19 October 2026.
-- Run the whole file once in Supabase SQL Editor as the project owner.
-- Adds missing workflows/catalog/finance policy; keeps existing user rows and
-- the on_auth_user_created / handle_new_user registration trigger.
-- All changes share one transaction: any error rolls back the entire update.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_advisory_xact_lock(hashtextextended('leadly-mvp-schema-update',0));

do $preflight$
declare target text;
begin
  foreach target in array array['profiles','user_preferences','user_opportunities','opportunity_status_history','transactions','skills','services'] loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=target and c.relkind='r' and c.relrowsecurity) then
      raise exception 'Expected public.% table with RLS. Stop and inspect the schema.',target;
    end if;
  end loop;
  if not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid
    where n.nspname='auth' and c.relname='users' and t.tgname='on_auth_user_created'
      and p.proname='handle_new_user' and t.tgenabled='O' and not t.tgisinternal) then
    raise exception 'Expected the audited registration trigger. Stop and inspect; do not reset the database.';
  end if;
end $preflight$;

create temporary table leadly_registration_before on commit drop as
select t.tgname,pg_get_triggerdef(t.oid) as trigger_definition,
       pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t where t.tgrelid='auth.users'::regclass
  and t.tgname='on_auth_user_created' and not t.tgisinternal;

-- 0004_mvp_workflows.sql
-- Additive migration. Back up the database first; never reset an existing project.
alter table public.profiles add column if not exists skills_summary text;
alter table public.profiles add column if not exists requested_plan text default 'free';

-- Preserve existing auth triggers. This idempotent trigger only inserts a missing profile.
create or replace function public.leadly_ensure_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values(new.id, left(coalesce(new.raw_user_meta_data->>'display_name', ''),80))
  on conflict(id) do nothing;
  return new;
end; $$;
drop trigger if exists leadly_auth_profile on auth.users;
do $$ begin
 if not exists (
  select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
  where t.tgrelid='auth.users'::regclass and not t.tgisinternal and p.prosrc ilike '%profiles%'
 ) then
  create trigger leadly_auth_profile after insert on auth.users for each row execute function public.leadly_ensure_profile();
 end if;
end $$;
revoke all on function public.leadly_ensure_profile() from public, anon, authenticated;

-- Profile and preferences commit together: onboarding cannot become half-complete.
create or replace function public.leadly_save_profile(
  p_name text, p_headline text, p_skills text, p_income numeric, p_currency text,
  p_types public.opportunity_type[], p_remote boolean, p_ai boolean, p_telegram boolean,
  p_timezone text default 'Europe/Moscow'
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Требуется вход'; end if;
  if length(coalesce(trim(p_name),'')) not between 1 and 80 or length(coalesce(p_headline,''))>140 or length(coalesce(p_skills,''))>1000 then raise exception 'Проверь имя и описание профиля'; end if;
  if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Неверный часовой пояс'; end if;
  if p_income is null or p_income<0 or p_income>1000000000 or p_currency not in ('RUB','USD','EUR') or coalesce(cardinality(p_types),0)=0 then raise exception 'Проверь цель и типы возможностей'; end if;
  insert into public.profiles(id,display_name,headline,skills_summary,target_monthly_income,currency_code,onboarding_completed,locale,timezone)
  values(auth.uid(),trim(p_name),nullif(trim(p_headline),''),nullif(trim(p_skills),''),p_income,p_currency,true,'ru',left(coalesce(nullif(p_timezone,''),'Europe/Moscow'),80))
  on conflict(id) do update set display_name=excluded.display_name,headline=excluded.headline,skills_summary=excluded.skills_summary,target_monthly_income=excluded.target_monthly_income,currency_code=excluded.currency_code,onboarding_completed=true,timezone=excluded.timezone;
  insert into public.user_preferences(user_id,preferred_opportunity_types,preferred_competition,remote_only,ai_recommendations_enabled,telegram_notifications_enabled)
  values(auth.uid(),p_types,array['low','medium']::public.competition_level[],p_remote,p_ai,p_telegram)
  on conflict(user_id) do update set preferred_opportunity_types=excluded.preferred_opportunity_types,remote_only=excluded.remote_only,ai_recommendations_enabled=excluded.ai_recommendations_enabled,telegram_notifications_enabled=excluded.telegram_notifications_enabled;
end; $$;
revoke all on function public.leadly_save_profile(text,text,text,numeric,text,public.opportunity_type[],boolean,boolean,boolean,text) from public,anon;
grant execute on function public.leadly_save_profile(text,text,text,numeric,text,public.opportunity_type[],boolean,boolean,boolean,text) to authenticated;

-- Serialize concurrent changes and atomically record actual status transitions.
create or replace function public.leadly_update_opportunity(
 p_opportunity_id uuid, p_status public.opportunity_status default null, p_saved boolean default null, p_notes text default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare previous public.opportunity_status;
begin
 if auth.uid() is null then raise exception 'Требуется вход'; end if;
 if length(coalesce(p_notes,''))>5000 then raise exception 'Заметка слишком длинная'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_opportunity_id::text,0));
 select status into previous from public.user_opportunities where user_id=auth.uid() and opportunity_id=p_opportunity_id for update;
 insert into public.user_opportunities(user_id,opportunity_id,status,is_saved,notes)
 values(auth.uid(),p_opportunity_id,coalesce(p_status,'new'),coalesce(p_saved,false),p_notes)
 on conflict(user_id,opportunity_id) do update set status=coalesce(p_status,public.user_opportunities.status),is_saved=coalesce(p_saved,public.user_opportunities.is_saved),notes=coalesce(p_notes,public.user_opportunities.notes);
 if p_status is not null and coalesce(previous,'new')<>p_status then
  insert into public.opportunity_status_history(user_id,opportunity_id,from_status,to_status) values(auth.uid(),p_opportunity_id,coalesce(previous,'new'),p_status);
 end if;
end; $$;
revoke all on function public.leadly_update_opportunity(uuid,public.opportunity_status,boolean,text) from public,anon;
grant execute on function public.leadly_update_opportunity(uuid,public.opportunity_status,boolean,text) to authenticated;

-- AI quota reservations are server-only; a browser cannot reset or forge the counter.
create table if not exists public.leadly_ai_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now()
);
alter table public.leadly_ai_requests enable row level security;
create index if not exists leadly_ai_requests_user_time on public.leadly_ai_requests(user_id,created_at);
create or replace function public.leadly_reserve_ai(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare requests integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,1));
 select count(*) into requests from public.leadly_ai_requests where user_id=p_user_id and created_at>now()-interval '24 hours';
 if requests>=20 then return false; end if;
 insert into public.leadly_ai_requests(user_id) values(p_user_id);
 return true;
end; $$;
revoke all on function public.leadly_reserve_ai(uuid) from public,anon,authenticated;
grant execute on function public.leadly_reserve_ai(uuid) to service_role;

-- 0005_expand_digital_catalog.sql
-- Add non-development disciplines without editing existing catalog/profile rows.
insert into public.skills(name,slug,category)
select seed.name,seed.slug,seed.category from (values
 ('Видеомонтаж','video-editing','Видео'),
 ('DaVinci Resolve','davinci-resolve','Видео'),
 ('Adobe Premiere Pro','adobe-premiere-pro','Видео'),
 ('After Effects','after-effects','Видео'),
 ('Графический дизайн','graphic-design','Дизайн'),
 ('Adobe Photoshop','adobe-photoshop','Дизайн'),
 ('Иллюстрация','illustration','Дизайн'),
 ('Редактура','text-editing','Контент'),
 ('Сценарии для видео','video-scriptwriting','Контент'),
 ('Яндекс Директ','yandex-direct','Маркетинг'),
 ('SMM','smm','Соцсети'),
 ('Контент-план','content-planning','Соцсети'),
 ('Ведение Telegram','telegram-content','Соцсети'),
 ('Обработка звука','audio-processing','Звук'),
 ('Озвучка','voiceover','Звук'),
 ('Сведение','audio-mixing','Звук'),
 ('Письменный перевод','written-translation','Переводы'),
 ('Локализация','localization','Переводы'),
 ('Карточки товаров','product-cards','Маркетплейсы'),
 ('Ozon','ozon','Маркетплейсы'),
 ('Wildberries','wildberries','Маркетплейсы'),
 ('Excel','excel','Аналитика'),
 ('SQL','sql','Аналитика'),
 ('Power BI','power-bi','Аналитика'),
 ('Работа с документами','document-management','Ассистирование'),
 ('Поиск информации','information-research','Ассистирование'),
 ('Организация задач','task-organization','Ассистирование'),
 ('Разработка курсов','course-development','Обучение'),
 ('Учебные материалы','learning-materials','Обучение')
) as seed(name,slug,category)
where not exists (select 1 from public.skills existing where existing.name=seed.name)
on conflict(slug) do nothing;
insert into public.services(name,slug,category)
select seed.name,seed.slug,seed.category from (values
 ('Монтаж видеороликов','video-editing-service','Видео'),
 ('Моушн-дизайн','motion-design-service','Видео'),
 ('Дизайн фирменного стиля','brand-design-service','Дизайн'),
 ('Иллюстрация и графика','illustration-service','Дизайн'),
 ('Редактура и корректура','text-editing-service','Контент'),
 ('Сценарии для видео','video-scriptwriting-service','Контент'),
 ('Настройка рекламы','ads-setup-service','Маркетинг'),
 ('Ведение социальных сетей','social-media-service','Соцсети'),
 ('Озвучка и обработка аудио','voiceover-service','Звук'),
 ('Перевод и локализация текстов','translation-service','Переводы'),
 ('Оформление карточек товаров','product-cards-service','Маркетплейсы'),
 ('Анализ данных и дашборды','data-analysis-service','Аналитика'),
 ('Удалённое административное сопровождение','remote-assistant-service','Ассистирование'),
 ('Подготовка образовательных материалов','learning-materials-service','Обучение')
) as seed(name,slug,category)
where not exists (select 1 from public.services existing where existing.name=seed.name)
on conflict(slug) do nothing;

-- 0006_finance_delete_own.sql
-- The finance UI deletes entries only after confirmation. Live schema audit found
-- SELECT/INSERT policies but no DELETE policy. Preserve existing policies.
alter table public.transactions enable row level security;
grant delete on table public.transactions to authenticated;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='transactions'
      and policyname='transactions_delete_own'
  ) then
    create policy transactions_delete_own on public.transactions
      for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;

-- Verify that the existing registration trigger and its function were preserved.
do $verify$
begin
  if not exists(select 1 from pg_temp.leadly_registration_before b
    join pg_trigger t on t.tgrelid='auth.users'::regclass and t.tgname=b.tgname
    where pg_get_triggerdef(t.oid)=b.trigger_definition
      and pg_get_functiondef(t.tgfoid)=b.function_definition) then
    raise exception 'Registration trigger changed unexpectedly; update rolled back.';
  end if;
end $verify$;
notify pgrst, 'reload schema';
commit;

select jsonb_pretty(jsonb_build_object(
  'requested_plan_ready', exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='requested_plan'),
  'profile_save_ready', to_regprocedure('public.leadly_save_profile(text,text,text,numeric,text,public.opportunity_type[],boolean,boolean,boolean,text)') is not null,
  'opportunity_update_ready', to_regprocedure('public.leadly_update_opportunity(uuid,public.opportunity_status,boolean,text)') is not null,
  'profile_save_authenticated', has_function_privilege('authenticated','public.leadly_save_profile(text,text,text,numeric,text,public.opportunity_type[],boolean,boolean,boolean,text)','EXECUTE'),
  'profile_save_anon_blocked', not has_function_privilege('anon','public.leadly_save_profile(text,text,text,numeric,text,public.opportunity_type[],boolean,boolean,boolean,text)','EXECUTE'),
  'ai_quota_ready', to_regclass('public.leadly_ai_requests') is not null,
  'ai_quota_server_only', has_function_privilege('service_role','public.leadly_reserve_ai(uuid)','EXECUTE') and not has_function_privilege('authenticated','public.leadly_reserve_ai(uuid)','EXECUTE') and not has_function_privilege('anon','public.leadly_reserve_ai(uuid)','EXECUTE'),
  'finance_delete_policy_ready', exists(select 1 from pg_policies where schemaname='public' and tablename='transactions' and policyname='transactions_delete_own'),
  'skills_count', (select count(*) from public.skills),
  'services_count', (select count(*) from public.services)
)) as leadly_update_result;
