-- Security hardening (2026-10-12, after the code review). Run once in the Supabase SQL editor
-- (or by tools/supabase_migrate.py) after schema.sql, account.sql and khatma.sql. Safe to run again.

-- 1. A synced row cannot grow without limit. Real rows are far below this (tasks, notes, settings);
--    the cap stops one account from filling the project's storage. NOT VALID: rows already there
--    are left alone, the rule applies to every new write.
alter table public.user_state drop constraint if exists user_state_data_size;
alter table public.user_state add constraint user_state_data_size
  check (pg_column_size(data) <= 4 * 1024 * 1024) not valid;

-- 2. Khatma share codes: from a cryptographic random source and the full A–Z 0–9 alphabet
--    (36^8 ≈ 2.8 million million codes, against 16^8 ≈ 4.3 thousand million for the old md5/hex ones).
--    Codes already shared keep working.
create or replace function public.khatma_new_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  abc constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  b bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  c text := '';
  i int;
begin
  for i in 0..7 loop
    c := c || substr(abc, 1 + (get_byte(b, i) % 36), 1);
  end loop;
  return c;
end $$;
revoke all on function public.khatma_new_code() from public, anon, authenticated;

create or replace function public.khatma_create(p_title text, p_name text) returns table (id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare k uuid; c text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  loop
    c := public.khatma_new_code();
    exit when not exists (select 1 from public.khatma where khatma.code = c);
  end loop;
  insert into public.khatma (code, title, owner) values (c, left(trim(p_title), 80), auth.uid()) returning khatma.id into k;
  insert into public.khatma_member (khatma, user_id, name) values (k, auth.uid(), left(trim(p_name), 40));
  insert into public.khatma_part (khatma, juz) select k, g from generate_series(1, 30) g;
  return query select k, c;
end $$;

-- 3. Guessing codes: an account gets 20 wrong codes an hour, then khatma_join refuses until the
--    hour has passed ('too many tries'). The log is readable by no one but the database itself.
create table if not exists public.khatma_join_fail (
  user_id uuid not null references auth.users on delete cascade,
  at timestamptz not null default now()
);
create index if not exists khatma_join_fail_user_at on public.khatma_join_fail (user_id, at);
alter table public.khatma_join_fail enable row level security;
revoke all on public.khatma_join_fail from public, anon, authenticated;

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

revoke all on function public.khatma_create(text, text) from public, anon;
revoke all on function public.khatma_join(text, text) from public, anon;
grant execute on function public.khatma_create(text, text) to authenticated;
grant execute on function public.khatma_join(text, text) to authenticated;
