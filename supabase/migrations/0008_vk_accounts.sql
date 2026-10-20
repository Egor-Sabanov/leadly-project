-- Additive VK login bindings. No existing auth user, identity or workspace row
-- is updated, deleted, confirmed or merged by this migration or its functions.
begin;
create table if not exists public.vk_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vk_user_id text not null unique check (vk_user_id ~ '^[1-9][0-9]{0,19}$'),
  display_name text not null check (length(display_name) between 1 and 80),
  linked_at timestamptz not null default now(),
  notice_version text not null default 'vk-2026-10-20.1'
);
create table if not exists public.vk_link_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  vk_user_id text not null check (vk_user_id ~ '^[1-9][0-9]{0,19}$'),
  display_name text not null check (length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes')
);
alter table public.vk_accounts enable row level security;
alter table public.vk_link_requests enable row level security;
revoke all on public.vk_accounts, public.vk_link_requests from public, anon, authenticated;
grant select, insert, update, delete on public.vk_accounts, public.vk_link_requests to service_role;

create or replace function public.leadly_confirm_vk_link(p_user_id uuid, p_token_hash text, p_acknowledged boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.vk_link_requests%rowtype;
begin
  if p_acknowledged is distinct from true or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  -- Serialize confirmation/disconnection for this owner. Uniqueness of vk_user_id
  -- separately prevents two owners confirming the same VK at the same time.
  perform 1 from auth.users where id=p_user_id and email_confirmed_at is not null
    and coalesce(email,'')<>'' and not coalesce(is_anonymous,false)
    and (banned_until is null or banned_until<=now()) for update;
  if not found then return jsonb_build_object('ok',false,'reason','unavailable'); end if;
  select * into r from public.vk_link_requests where user_id=p_user_id and token_hash=p_token_hash for update;
  if not found or r.expires_at<=now() then return jsonb_build_object('ok',false,'reason','expired'); end if;
  -- A stranded, never-signed-in empty-email record is preserved as-is. A real
  -- different VK account with a primary email or sign-in history is protected.
  if exists(select 1 from auth.identities i join auth.users u on u.id=i.user_id
      where i.provider='custom:vk' and i.provider_id=r.vk_user_id and i.user_id<>p_user_id
      and (coalesce(u.email,'')<>'' or u.email_confirmed_at is not null or u.last_sign_in_at is not null
        or (u.banned_until is not null and u.banned_until>now()))) then
    return jsonb_build_object('ok',false,'reason','identity_in_use');
  end if;
  if exists(select 1 from public.vk_accounts where user_id=p_user_id and vk_user_id<>r.vk_user_id) then
    return jsonb_build_object('ok',false,'reason','already_connected');
  end if;
  insert into public.vk_accounts(user_id,vk_user_id,display_name)
    values(p_user_id,r.vk_user_id,r.display_name)
    on conflict(user_id) do update set display_name=excluded.display_name;
  delete from public.vk_link_requests where user_id=p_user_id;
  return jsonb_build_object('ok',true);
exception when unique_violation then
  return jsonb_build_object('ok',false,'reason','unavailable');
end $$;

create or replace function public.leadly_disconnect_vk(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from auth.users where id=p_user_id for update;
  delete from public.vk_accounts where user_id=p_user_id;
  delete from public.vk_link_requests where user_id=p_user_id;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.leadly_confirm_vk_link(uuid,text,boolean) from public, anon, authenticated;
revoke all on function public.leadly_disconnect_vk(uuid) from public, anon, authenticated;
grant execute on function public.leadly_confirm_vk_link(uuid,text,boolean) to service_role;
grant execute on function public.leadly_disconnect_vk(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
