-- Group challenges (2.6.0): family or friends set a shared goal — a number of tasbihat, of salawat on
-- the Prophet ﷺ, of istighfar, or of Quran pages — and each adds what they did; everyone sees the
-- total and each member's share. Run once after khatma.sql and hardening.sql (by
-- tools/supabase_migrate.py or the SQL editor). Safe to run again.
--
-- Who sees what: only the members of a challenge read it and its members. You become a member by
-- creating it or by joining with its share code (challenge_create / challenge_join, which run with
-- the owner's rights so the code itself is never readable). Each member changes only their own row,
-- and only its name and count. The creator may delete the challenge; any member may leave.

create table if not exists public.challenge (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  title text not null check (char_length(title) between 1 and 80),
  kind text not null check (kind in ('tasbih', 'salawat', 'istighfar', 'pages')),
  goal int not null check (goal between 1 and 10000000),
  ends_on date,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_member (
  challenge uuid not null references public.challenge on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  progress int not null default 0 check (progress between 0 and 10000000),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (challenge, user_id)
);

alter table public.challenge enable row level security;
alter table public.challenge_member enable row level security;

create or replace function public.challenge_is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.challenge_member m where m.challenge = c and m.user_id = auth.uid());
$$;

drop policy if exists "members read challenge" on public.challenge;
create policy "members read challenge" on public.challenge for select using (public.challenge_is_member(id));
drop policy if exists "owner deletes challenge" on public.challenge;
create policy "owner deletes challenge" on public.challenge for delete using (owner = auth.uid());

drop policy if exists "members read challengers" on public.challenge_member;
create policy "members read challengers" on public.challenge_member for select using (public.challenge_is_member(challenge));
drop policy if exists "update own count" on public.challenge_member;
create policy "update own count" on public.challenge_member for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "leave challenge" on public.challenge_member;
create policy "leave challenge" on public.challenge_member for delete using (user_id = auth.uid());

-- Start a challenge: its share code and you as the first member. At most 30 of your own at a time.
create or replace function public.challenge_create(p_title text, p_kind text, p_goal int, p_days int, p_name text)
returns table (id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare c uuid; k text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if (select count(*) from public.challenge x where x.owner = auth.uid()) >= 30 then raise exception 'too many challenges'; end if;
  loop
    k := public.khatma_new_code();
    exit when not exists (select 1 from public.challenge x where x.code = k)
          and not exists (select 1 from public.khatma x where x.code = k);
  end loop;
  insert into public.challenge (code, title, kind, goal, ends_on, owner)
    values (k, left(trim(p_title), 80), p_kind, p_goal,
            case when p_days between 1 and 365 then current_date + p_days end, auth.uid())
    returning challenge.id into c;
  insert into public.challenge_member (challenge, user_id, name) values (c, auth.uid(), left(trim(p_name), 40));
  return query select c, k;
end $$;

-- Join with a share code; nothing for a wrong one. Wrong codes count toward the same hourly limit
-- as the khatma (supabase/hardening.sql): 20 an hour, then 'too many tries'.
create or replace function public.challenge_join(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if (select count(*) from public.khatma_join_fail f where f.user_id = auth.uid() and f.at > now() - interval '1 hour') >= 20 then
    raise exception 'too many tries';
  end if;
  select x.id into c from public.challenge x where x.code = upper(replace(trim(p_code), ' ', ''));
  if c is null then
    insert into public.khatma_join_fail (user_id) values (auth.uid());
    delete from public.khatma_join_fail f where f.at < now() - interval '1 day';
    return null;
  end if;
  insert into public.challenge_member (challenge, user_id, name) values (c, auth.uid(), left(trim(p_name), 40))
    on conflict (challenge, user_id) do update set name = excluded.name;
  return c;
end $$;

revoke all on public.challenge, public.challenge_member from anon, authenticated;
revoke all on function public.challenge_create(text, text, int, int, text) from public, anon;
revoke all on function public.challenge_join(text, text) from public, anon;
revoke all on function public.challenge_is_member(uuid) from public, anon;
grant execute on function public.challenge_create(text, text, int, int, text) to authenticated;
grant execute on function public.challenge_join(text, text) to authenticated;
grant execute on function public.challenge_is_member(uuid) to authenticated;
grant select, delete on public.challenge to authenticated;
grant select, delete on public.challenge_member to authenticated;
-- Only these columns can change, and only on your own row (policy above).
grant update (name, progress, updated_at) on public.challenge_member to authenticated;
