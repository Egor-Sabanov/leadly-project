-- Additive Telegram connection storage. Existing tables and auth triggers stay intact.
begin;

create table if not exists public.telegram_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  telegram_user_id bigint not null unique check (telegram_user_id between 1 and 9007199254740991),
  telegram_username text check (telegram_username is null or telegram_username ~ '^[A-Za-z0-9_]{5,32}$'),
  chat_id bigint not null unique check (chat_id = telegram_user_id),
  linked_at timestamptz not null default now(),
  notice_version text not null default 'telegram-2026-10-20.1'
);
create table if not exists public.telegram_link_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  telegram_user_id bigint check (telegram_user_id between 1 and 9007199254740991),
  telegram_username text check (telegram_username is null or telegram_username ~ '^[A-Za-z0-9_]{5,32}$'),
  chat_id bigint,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  check ((telegram_user_id is null and chat_id is null) or (telegram_user_id is not null and chat_id is not null and chat_id = telegram_user_id))
);

alter table public.telegram_accounts enable row level security;
alter table public.telegram_link_requests enable row level security;
revoke all on public.telegram_accounts, public.telegram_link_requests from public, anon, authenticated;
grant select, insert, update, delete on public.telegram_accounts, public.telegram_link_requests to service_role;

-- Claiming a short-lived token records the Telegram candidate. It never logs
-- that candidate in or links the account until the logged-in owner confirms.
create or replace function public.leadly_claim_telegram_link(
  p_token_hash text, p_telegram_user_id bigint, p_username text, p_chat_id bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.telegram_link_requests%rowtype;
begin
  if p_telegram_user_id is null or p_telegram_user_id < 1 or p_chat_id is distinct from p_telegram_user_id
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  select * into r from public.telegram_link_requests where token_hash=p_token_hash for update;
  if not found or r.expires_at <= now() then
    return jsonb_build_object('ok',false,'reason','expired');
  end if;
  if r.telegram_user_id is not null and r.telegram_user_id <> p_telegram_user_id then
    return jsonb_build_object('ok',false,'reason','claimed');
  end if;
  update public.telegram_link_requests set telegram_user_id=p_telegram_user_id,
    telegram_username=p_username,chat_id=p_chat_id where id=r.id;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.leadly_confirm_telegram_link(p_user_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.telegram_link_requests%rowtype;
begin
  select * into r from public.telegram_link_requests
    where id=p_request_id and user_id=p_user_id for update;
  if not found or r.expires_at <= now() or r.telegram_user_id is null then
    return jsonb_build_object('ok',false,'reason','expired');
  end if;
  if exists(select 1 from public.telegram_accounts where user_id=p_user_id and telegram_user_id<>r.telegram_user_id) then
    return jsonb_build_object('ok',false,'reason','already_connected');
  end if;
  insert into public.telegram_accounts(user_id,telegram_user_id,telegram_username,chat_id)
    values(p_user_id,r.telegram_user_id,r.telegram_username,r.chat_id)
    on conflict(user_id) do update set telegram_username=excluded.telegram_username;
  delete from public.telegram_link_requests where id=r.id;
  return jsonb_build_object('ok',true);
exception when unique_violation then
  return jsonb_build_object('ok',false,'reason','unavailable');
end $$;

-- Only explicit disconnect and account deletion remove these new connection
-- rows; this migration does not execute either function against existing users.
create or replace function public.leadly_disconnect_telegram(p_user_id uuid default null, p_telegram_user_id bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  if (p_user_id is null) = (p_telegram_user_id is null) then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  if p_user_id is not null then owner_id:=p_user_id;
  else select user_id into owner_id from public.telegram_accounts where telegram_user_id=p_telegram_user_id;
  end if;
  if owner_id is not null then
    delete from public.telegram_accounts where user_id=owner_id;
    delete from public.telegram_link_requests where user_id=owner_id;
  end if;
  return jsonb_build_object('ok',true);
end $$;

revoke all on function public.leadly_claim_telegram_link(text,bigint,text,bigint) from public, anon, authenticated;
revoke all on function public.leadly_confirm_telegram_link(uuid,uuid) from public, anon, authenticated;
revoke all on function public.leadly_disconnect_telegram(uuid,bigint) from public, anon, authenticated;
grant execute on function public.leadly_claim_telegram_link(text,bigint,text,bigint) to service_role;
grant execute on function public.leadly_confirm_telegram_link(uuid,uuid) to service_role;
grant execute on function public.leadly_disconnect_telegram(uuid,bigint) to service_role;
notify pgrst, 'reload schema';
commit;
