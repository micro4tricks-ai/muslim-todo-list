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

-- Start a khatma: its share code, you as the first member, and its 30 free parts.
create or replace function public.khatma_create(p_title text, p_name text) returns table (id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare k uuid; c text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.khatma where khatma.code = c);
  end loop;
  insert into public.khatma (code, title, owner) values (c, left(trim(p_title), 80), auth.uid()) returning khatma.id into k;
  insert into public.khatma_member (khatma, user_id, name) values (k, auth.uid(), left(trim(p_name), 40));
  insert into public.khatma_part (khatma, juz) select k, g from generate_series(1, 30) g;
  return query select k, c;
end $$;

-- Join with a share code (case and spaces ignored); returns the khatma, or nothing for a wrong code.
create or replace function public.khatma_join(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare k uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select khatma.id into k from public.khatma where khatma.code = upper(replace(trim(p_code), ' ', ''));
  if k is null then return null; end if;
  insert into public.khatma_member (khatma, user_id, name) values (k, auth.uid(), left(trim(p_name), 40))
    on conflict (khatma, user_id) do update set name = excluded.name;
  return k;
end $$;

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
