"""Checks "delete my account" (supabase/account.sql) on the real database, inside one transaction
that is rolled back, so nothing stays behind.

Usage: same environment as tools/supabase_migrate.py (pg8000, password file, SUPABASE_CA).
"""
import uuid

from test_khatma import connect


def main():
    con = connect()
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    results = []

    def check(name, ok):
        results.append((name, ok))
        print('OK  ' if ok else 'FAIL', name)

    def as_user(uid):
        con.run("select set_config('request.jwt.claims', :c, true)", c='{"sub":"%s","role":"authenticated"}' % uid)
        con.run('set local role authenticated')

    def as_admin():
        con.run('reset role')

    con.run('begin')
    try:
        for uid in (a, b):
            con.run("insert into auth.users (id, instance_id, aud, role, email) values (:i, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', :e)",
                    i=uid, e='account-test-%s@example.invalid' % uid[:8])
        # A syncs some data and starts a khatma; B starts one, A joins it and reads a juz.
        as_user(a)
        con.run("insert into public.user_state (user_id, data) values (:u, '{\"tasks\":[1]}')", u=a)
        ka = str(con.run("select id from public.khatma_create('ختمة أ', 'أحمد')")[0][0])
        as_admin()
        as_user(b)
        kb_row = con.run("select * from public.khatma_create('ختمة ب', 'سارة')")[0]
        kb, code = str(kb_row[0]), kb_row[1]
        as_admin()
        as_user(a)
        con.run('select public.khatma_join(:c, :n)', c=code, n='أحمد')
        con.run('update public.khatma_part set user_id = :u, name = :n, done = true where khatma = :k and juz = 5', u=a, n='أحمد', k=kb)
        con.run('update public.khatma_part set user_id = :u, name = :n where khatma = :k and juz = 6', u=a, n='أحمد', k=kb)
        as_admin()

        # Signed out, nobody can call it.
        con.run('savepoint t')
        try:
            con.run('set local role anon')
            con.run('select public.delete_my_account()')
            anon_ok = True
        except Exception:
            anon_ok = False
        con.run('rollback to savepoint t')
        as_admin()
        check('a signed-out visitor cannot call it', not anon_ok)

        # A deletes their account.
        as_user(a)
        con.run('select public.delete_my_account()')
        as_admin()
        check('the sign-in is gone', con.run('select count(*) from auth.users where id = :u', u=a)[0][0] == 0)
        check('the synced data is gone', con.run('select count(*) from public.user_state where user_id = :u', u=a)[0][0] == 0)
        check("A's own khatma is gone", con.run('select count(*) from public.khatma where id = :k', k=ka)[0][0] == 0)
        check("A left B's khatma", con.run('select count(*) from public.khatma_member where user_id = :u', u=a)[0][0] == 0)
        r5 = con.run('select user_id, name, done from public.khatma_part where khatma = :k and juz = 5', k=kb)[0]
        check('the juz A read stays read, without a name', r5[0] is None and r5[1] is None and r5[2] is True)
        r6 = con.run('select user_id, name, done from public.khatma_part where khatma = :k and juz = 6', k=kb)[0]
        check('the juz A had not read is free again', r6[0] is None and r6[1] is None and r6[2] is False)
        check("B's account and khatma are untouched",
              con.run('select count(*) from auth.users where id = :u', u=b)[0][0] == 1
              and con.run('select count(*) from public.khatma where id = :k', k=kb)[0][0] == 1)
    finally:
        con.run('rollback')
        con.close()
    failed = [n for n, ok in results if not ok]
    print('%d/%d passed' % (len(results) - len(failed), len(results)))
    raise SystemExit(1 if failed else 0)


if __name__ == '__main__':
    main()
