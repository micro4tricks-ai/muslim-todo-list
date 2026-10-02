"""Checks the group khatma's rules (supabase/khatma.sql) on the real database, as two users,
inside one transaction that is rolled back, so nothing stays behind.

Usage: same environment as tools/supabase_migrate.py (pg8000, password file, SUPABASE_CA).
"""
import os
import ssl
import uuid

import pg8000.native

REF = 'jvvvqkmmpfuvbihsvjan'


def connect():
    pw_file = os.environ.get('SUPABASE_DB_PASSWORD_FILE', os.path.expanduser('~/supabase-db-password.txt'))
    with open(pw_file, encoding='utf-8') as f:
        password = f.read().strip().splitlines()[-1].strip()
    ctx = ssl.create_default_context(cafile=os.environ['SUPABASE_CA'])
    ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return pg8000.native.Connection(user='postgres.' + REF, password=password, host='aws-0-eu-central-1.pooler.supabase.com',
                                    port=5432, database='postgres', ssl_context=ctx, timeout=30)


def main():
    con = connect()
    a, b, c = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
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
        for uid in (a, b, c):
            con.run("insert into auth.users (id, instance_id, aud, role, email) values (:i, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', :e)",
                    i=uid, e='khatma-test-%s@example.invalid' % uid[:8])
        # A starts a khatma.
        as_user(a)
        row = con.run("select * from public.khatma_create('ختمة تجربة', 'أحمد')")[0]
        kid, code = str(row[0]), row[1]
        check('A starts a khatma with an 8-letter code', len(code) == 8)
        check('it has 30 free parts', con.run('select count(*) from public.khatma_part where khatma = :k and user_id is null', k=kid)[0][0] == 30)
        con.run('update public.khatma_part set user_id = :u, name = :n where khatma = :k and juz = 1', u=a, n='أحمد', k=kid)
        as_admin()
        # B can't see it before joining, then joins with the code.
        as_user(b)
        check('B sees nothing before joining', con.run('select count(*) from public.khatma where id = :k', k=kid)[0][0] == 0)
        check('a wrong code joins nothing', con.run("select public.khatma_join('ZZZZZZZZ', 'سارة')")[0][0] is None)
        check('B joins with the code', str(con.run('select public.khatma_join(:c, :n)', c=code.lower(), n='سارة')[0][0]) == kid)
        check('B now sees the 30 parts', con.run('select count(*) from public.khatma_part where khatma = :k', k=kid)[0][0] == 30)
        # B can't touch A's juz, but can take a free one.
        con.run('update public.khatma_part set user_id = :u, done = true where khatma = :k and juz = 1', u=b, k=kid)
        as_admin()
        check("B can't take or change A's juz", str(con.run('select user_id from public.khatma_part where khatma = :k and juz = 1', k=kid)[0][0]) == a)
        as_user(b)
        con.run('update public.khatma_part set user_id = :u, name = :n where khatma = :k and juz = 2 and user_id is null', u=b, n='سارة', k=kid)
        con.run('update public.khatma_part set done = true where khatma = :k and juz = 2', k=kid)
        as_admin()
        r = con.run('select user_id, done from public.khatma_part where khatma = :k and juz = 2', k=kid)[0]
        check('B takes a free juz and marks it read', str(r[0]) == b and r[1] is True)
        # B can't give a free juz to someone else: the rules refuse the change.
        as_user(b)
        con.run('savepoint t')
        try:
            con.run('update public.khatma_part set user_id = :u where khatma = :k and juz = 3', u=a, k=kid)
            con.run('release savepoint t')
            refused = False
        except Exception:
            con.run('rollback to savepoint t')
            refused = True
        as_admin()
        check("B can't hand a juz to someone else", refused or con.run('select user_id from public.khatma_part where khatma = :k and juz = 3', k=kid)[0][0] is None)
        # C, not a member, sees and changes nothing; can't delete it.
        as_user(c)
        check('C (not a member) sees no parts', con.run('select count(*) from public.khatma_part where khatma = :k', k=kid)[0][0] == 0)
        con.run('update public.khatma_part set user_id = :u where khatma = :k', u=c, k=kid)
        con.run('delete from public.khatma where id = :k', k=kid)
        as_admin()
        check('C changed nothing', con.run('select count(*) from public.khatma_part where khatma = :k and user_id = :u', k=kid, u=c)[0][0] == 0)
        check('C could not delete it', con.run('select count(*) from public.khatma where id = :k', k=kid)[0][0] == 1)
        # B can't delete it either (not the owner); A can.
        as_user(b)
        con.run('delete from public.khatma where id = :k', k=kid)
        as_admin()
        check("B (a member, not the owner) can't delete it", con.run('select count(*) from public.khatma where id = :k', k=kid)[0][0] == 1)
        as_user(a)
        con.run('delete from public.khatma where id = :k', k=kid)
        as_admin()
        check('A (the owner) deletes it, with its parts', con.run('select count(*) from public.khatma_part where khatma = :k', k=kid)[0][0] == 0)
    finally:
        con.run('rollback')
        con.close()
    failed = [n for n, ok in results if not ok]
    print('\n%d checks, %d failed; everything rolled back' % (len(results), len(failed)))
    raise SystemExit(1 if failed else 0)


if __name__ == '__main__':
    main()
