-- Deleting your own account (Settings › Account › "Delete my account"; Google Play asks every app
-- with sign-in to offer it, in the app and on the web). It removes the sign-in and, through the
-- foreign keys, everything stored with it: the synced tasks and settings, the khatmas you started
-- and your memberships. A juz you took in someone else's khatma keeps its "read" mark for the
-- group, without your name; an unread one becomes free again.
-- Run after schema.sql and khatma.sql: python tools/supabase_migrate.py supabase/account.sql
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  update public.khatma_part set name = null where user_id = me;
  delete from auth.users where id = me;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
