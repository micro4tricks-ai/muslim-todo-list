-- Least privilege on the tables (2026-10-13, after the deep review). Safe to run again.
-- Supabase gives the API roles every privilege on new tables by default, TRUNCATE among them,
-- which row level security does not cover. Row security already decides which rows each person
-- sees; this also narrows what each role may do at all, to what the app actually uses.

-- Visitors who are not signed in use nothing here.
revoke all on public.user_state, public.khatma, public.khatma_member, public.khatma_part from anon;

-- Signed-in people: only the operations the app performs, and never TRUNCATE, TRIGGER or REFERENCES.
revoke all on public.user_state, public.khatma, public.khatma_member, public.khatma_part from authenticated;
grant select, insert, update, delete on public.user_state to authenticated;       -- their own row (RLS)
grant select, delete on public.khatma to authenticated;                            -- members read, the owner deletes
grant select, delete on public.khatma_member to authenticated;                     -- members read, each leaves
grant select on public.khatma_part to authenticated;
grant update (user_id, name, done, updated_at) on public.khatma_part to authenticated; -- not juz or khatma
-- (Creating and joining go through khatma_create / khatma_join, which run with the owner's rights.)
