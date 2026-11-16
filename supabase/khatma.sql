-- Group khatma: a reading of the whole Quran shared out by juz among family or friends.
-- Run once in the Supabase SQL editor (or by tools/supabase_migrate.py). Safe to run again.
--
-- Who sees what: only the members of a khatma read it and its 30 parts. You become a member by
-- creating it or by joining with its share code (khatma_create / khatma_join, which run with the
-- owner's rights so the code itself is never readable). A member takes a free juz, marks their own
-- as done, or gives it back; nobody can touch another member's juz. The creator may delete it.

create table if not exists public.khatma (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  title text not null check (char_length(title) between 1 and 80),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.khatma_member (
  khatma uuid not null references public.khatma on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (khatma, user_id)
);

create table if not exists public.khatma_part (
  khatma uuid not null references public.khatma on delete cascade,
  juz int not null check (juz between 1 and 30),
  user_id uuid references auth.users on delete set null,
  name text check (name is null or char_length(name) <= 40),
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (khatma, juz)
);

alter table public.khatma enable row level security;
alter table public.khatma_member enable row level security;
alter table public.khatma_part enable row level security;

-- Membership test, with the owner's rights so the policies below don't loop on each other.
create or replace function public.khatma_is_member(k uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.khatma_member m where m.khatma = k and m.user_id = auth.uid());
$$;

drop policy if exists "members read khatma" on public.khatma;
create policy "members read khatma" on public.khatma for select using (public.khatma_is_member(id));
drop policy if exists "owner deletes khatma" on public.khatma;
create policy "owner deletes khatma" on public.khatma for delete using (owner = auth.uid());

drop policy if exists "members read members" on public.khatma_member;
create policy "members read members" on public.khatma_member for select using (public.khatma_is_member(khatma));
drop policy if exists "leave khatma" on public.khatma_member;
create policy "leave khatma" on public.khatma_member for delete using (user_id = auth.uid());

drop policy if exists "members read parts" on public.khatma_part;
create policy "members read parts" on public.khatma_part for select using (public.khatma_is_member(khatma));
-- Take a free juz, or change only your own (mark done, give back). A juz left free must be left
-- blank: nobody marks a free juz read or writes a name on it without taking it.
drop policy if exists "members take parts" on public.khatma_part;
create policy "members take parts" on public.khatma_part for update
  using (public.khatma_is_member(khatma) and (user_id is null or user_id = auth.uid()))
  with check (public.khatma_is_member(khatma) and (user_id = auth.uid() or (user_id is null and name is null and done = false)));

-- Share codes: from a cryptographic random source (pgcrypto) and the full A–Z 0–9 alphabet,
-- 36^8 ≈ 2.8 million million codes. Bytes of 252 and above are skipped so every character is
-- equally likely. Codes already shared keep working. Also used by challenge_create.
create extension if not exists pgcrypto with schema extensions;
create or replace function public.khatma_new_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  abc constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  b bytea;
  c text := '';
  i int;
begin
  loop
    b := extensions.gen_random_bytes(16);
    for i in 0..15 loop
      if get_byte(b, i) < 252 then
        c := c || substr(abc, 1 + (get_byte(b, i) % 36), 1);
        exit when length(c) = 8;
      end if;
    end loop;
    exit when length(c) = 8;
  end loop;
  return c;
end $$;
revoke all on function public.khatma_new_code() from public, anon, authenticated;

-- Start a khatma: its share code, you as the first member, and its 30 free parts.
-- At most 30 of your own at a time.
create or replace function public.khatma_create(p_title text, p_name text) returns table (id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare k uuid; c text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if (select count(*) from public.khatma x where x.owner = auth.uid()) >= 30 then raise exception 'too many khatmas'; end if;
  loop
    c := public.khatma_new_code();
    exit when not exists (select 1 from public.khatma where khatma.code = c);
  end loop;
  insert into public.khatma (code, title, owner) values (c, left(trim(p_title), 80), auth.uid()) returning khatma.id into k;
  insert into public.khatma_member (khatma, user_id, name) values (k, auth.uid(), left(trim(p_name), 40));
  insert into public.khatma_part (khatma, juz) select k, g from generate_series(1, 30) g;
  return query select k, c;
end $$;

-- Guessing codes: an account gets 20 wrong codes an hour (khatma and challenge codes together),
-- then joining refuses until the hour has passed ('too many tries'). The log is readable by no one
-- but the database itself, keeps a day, and goes with the account.
create table if not exists public.khatma_join_fail (
  user_id uuid not null references auth.users on delete cascade,
  at timestamptz not null default now()
);
create index if not exists khatma_join_fail_user_at on public.khatma_join_fail (user_id, at);
alter table public.khatma_join_fail enable row level security;
revoke all on public.khatma_join_fail from public, anon, authenticated;

-- Join with a share code (case and spaces ignored); returns the khatma, or nothing for a wrong code.
create or replace function public.khatma_join(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare k uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if (select count(*) from public.khatma_join_fail f where f.user_id = auth.uid() and f.at > now() - interval '1 hour') >= 20 then
    raise exception 'too many tries';
  end if;
  select khatma.id into k from public.khatma where khatma.code = upper(replace(trim(p_code), ' ', ''));
  if k is null then
    insert into public.khatma_join_fail (user_id) values (auth.uid());
    delete from public.khatma_join_fail f where f.at < now() - interval '1 day'; -- keep the log small
    return null;
  end if;
  insert into public.khatma_member (khatma, user_id, name) values (k, auth.uid(), left(trim(p_name), 40))
    on conflict (khatma, user_id) do update set name = excluded.name;
  return k;
end $$;

-- Leaving gives your juz back: free, unnamed and unread, so the others can take them (the update
-- policy lets nobody touch a juz still held by someone who is no longer a member). Not when the
-- whole khatma is being deleted, and not when the account is being deleted: account.sql keeps a
-- read juz's mark for the group then.
create or replace function public.khatma_member_left() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.khatma where id = old.khatma)
     and exists (select 1 from auth.users where id = old.user_id) then
    update public.khatma_part set user_id = null, name = null, done = false, updated_at = now()
      where khatma = old.khatma and user_id = old.user_id;
  end if;
  return null;
end $$;
revoke all on function public.khatma_member_left() from public, anon, authenticated;
drop trigger if exists khatma_member_left on public.khatma_member;
create trigger khatma_member_left after delete on public.khatma_member
  for each row execute function public.khatma_member_left();

revoke all on function public.khatma_create(text, text) from public, anon;
revoke all on function public.khatma_join(text, text) from public, anon;
revoke all on function public.khatma_is_member(uuid) from public, anon;
grant execute on function public.khatma_create(text, text) to authenticated;
grant execute on function public.khatma_join(text, text) to authenticated;
grant execute on function public.khatma_is_member(uuid) to authenticated;
grant select, delete on public.khatma to authenticated;
grant select, delete on public.khatma_member to authenticated;
grant select on public.khatma_part to authenticated;
-- Only these columns can change: who has the juz, their name, and whether it is read.
grant update (user_id, name, done, updated_at) on public.khatma_part to authenticated;
