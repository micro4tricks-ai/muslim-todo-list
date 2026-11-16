-- Security hardening (2026-10-12, after the code review). Run once in the Supabase SQL editor
-- (or by tools/supabase_migrate.py) after schema.sql, account.sql and khatma.sql. Safe to run again.

-- 1. A synced row cannot grow without limit. Real rows are far below this (tasks, notes, settings);
--    the cap stops one account from filling the project's storage. NOT VALID: rows already there
--    are left alone, the rule applies to every new write.
alter table public.user_state drop constraint if exists user_state_data_size;
alter table public.user_state add constraint user_state_data_size
  check (pg_column_size(data) <= 4 * 1024 * 1024) not valid;

-- 2. and 3. (cryptographic share codes and the hourly limit on wrong codes) now live in khatma.sql
--    itself, so running khatma.sql again can no longer bring back the old md5 codes or drop the limit.
