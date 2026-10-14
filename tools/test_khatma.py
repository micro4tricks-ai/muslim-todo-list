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
        # B can't mark a free juz read or put a name on it without taking it.
        as_user(b)
        con.run('savepoint t')
        try:
            con.run('update public.khatma_part set done = true, name = :n where khatma = :k and juz = 4', n='x', k=kid)
            con.run('release savepoint t')
            refused = False
        except Exception:
            con.run('rollback to savepoint t')
            refused = True
        as_admin()
        check("B can't mark a free juz read without taking it", refused or con.run('select done from public.khatma_part where khatma = :k and juz = 4', k=kid)[0][0] is False)
        # B gives his juz back: it is left blank.
        as_user(b)
        con.run('update public.khatma_part set user_id = null, name = null, done = false where khatma = :k and juz = 2', k=kid)
        as_admin()
        check('B gives his juz back', con.run('select user_id from public.khatma_part where khatma = :k and juz = 2', k=kid)[0][0] is None)
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
        # supabase/hardening.sql: codes over A–Z 0–9, at most 20 wrong codes an hour, a size cap on synced data.
        check('new codes use letters and digits, not just hex', all(len(x) == 8 and x.isalnum() and x.upper() == x
              for x in (con.run('select public.khatma_new_code()')[0][0] for _ in range(20)))
              and any(ch in 'GHIJKLMNOPQRSTUVWXYZ' for _ in range(5) for ch in con.run('select public.khatma_new_code()')[0][0]))
        as_user(c)
        for _ in range(20):
            con.run("select public.khatma_join('WRONG000', 'x')")
        con.run('savepoint t')
        try:
            con.run("select public.khatma_join('WRONG000', 'x')")
            con.run('release savepoint t')
            stopped = False
        except Exception as e:
            con.run('rollback to savepoint t')
            stopped = 'too many tries' in str(e)
        as_admin()
        check('the 21st wrong code in an hour is refused', stopped)
        as_user(a)
        con.run('savepoint t')
        try:
            con.run("insert into public.user_state (user_id, data) values (:u, jsonb_build_object('x', repeat(md5(random()::text), 160000)))", u=a)
            con.run('release savepoint t')
            capped = False
        except Exception:
            con.run('rollback to savepoint t')
            capped = True
        con.run("insert into public.user_state (user_id, data) values (:u, '{\"tasks\": []}'::jsonb)", u=a)
        as_admin()
        check('synced data over 4 MB is refused, normal data is kept', capped and con.run('select count(*) from public.user_state where user_id = :u', u=a)[0][0] == 1)
        # supabase/challenge.sql: group challenges, members only, each changes only their own count.
        as_user(a)
        row = con.run("select * from public.challenge_create('تحدي التسبيح', 'tasbih', 1000, 7, 'أحمد')")[0]
        cid, ccode = str(row[0]), row[1]
        check('A starts a challenge with an 8-letter code and a 7-day end',
              len(ccode) == 8 and con.run('select ends_on - current_date from public.challenge where id = :c', c=cid)[0][0] == 7)
        as_admin()
        as_user(b)
        check('B sees no challenge before joining', con.run('select count(*) from public.challenge where id = :c', c=cid)[0][0] == 0)
        check('B joins the challenge with its code', str(con.run('select public.challenge_join(:k, :n)', k=ccode.lower(), n='خالد')[0][0]) == cid)
        con.run('update public.challenge_member set progress = 100, updated_at = now() where challenge = :c and user_id = :u', c=cid, u=b)
        con.run('update public.challenge_member set progress = 999999 where challenge = :c and user_id = :u', c=cid, u=a)
        as_admin()
        counts = dict((str(u), p) for u, p in con.run('select user_id, progress from public.challenge_member where challenge = :c', c=cid))
        check("B adds to their own count but not to A's", counts.get(b) == 100 and counts.get(a) == 0)
        as_user(b)
        con.run('savepoint t')
        try:
            con.run('update public.challenge_member set user_id = :u where challenge = :c and user_id = :me', u=a, c=cid, me=b)
            con.run('release savepoint t')
            moved = True
        except Exception:
            con.run('rollback to savepoint t')
            moved = False
        as_admin()
        check("B can't move their row onto someone else", not moved)
        as_user(b)
        con.run('savepoint t')
        try:
            con.run('update public.challenge set goal = 1 where id = :c', c=cid)
            con.run('release savepoint t')
            changed = True
        except Exception:
            con.run('rollback to savepoint t')
            changed = False
        as_admin()
        check("a member can't change the challenge's goal", not changed and con.run('select goal from public.challenge where id = :c', c=cid)[0][0] == 1000)
        as_user(c)
        check('C (not a member) sees no challengers', con.run('select count(*) from public.challenge_member where challenge = :c', c=cid)[0][0] == 0)
        con.run('delete from public.challenge where id = :c', c=cid)
        as_admin()
        check("C can't delete it", con.run('select count(*) from public.challenge where id = :c', c=cid)[0][0] == 1)
        as_user(b)
        con.run('delete from public.challenge_member where challenge = :c and user_id = :u', c=cid, u=b)
        as_admin()
        check('B leaves the challenge', con.run('select count(*) from public.challenge_member where challenge = :c and user_id = :u', c=cid, u=b)[0][0] == 0)
        as_user(a)
        con.run('delete from public.challenge where id = :c', c=cid)
        as_admin()
        check('A (the owner) deletes it, with its members', con.run('select count(*) from public.challenge_member where challenge = :c', c=cid)[0][0] == 0)
        as_user(a)
        con.run('savepoint t')
        try:
            con.run("select * from public.challenge_create('x', 'nonsense', 10, 0, 'أحمد')")
            con.run('release savepoint t')
            bad = False
        except Exception:
            con.run('rollback to savepoint t')
            bad = True
        as_admin()
        check('an unknown kind of challenge is refused', bad)
        # supabase/grants.sql: visitors use nothing; signed-in people can never empty a table.
        def refused(role, sql):
            con.run('savepoint t')
            try:
                con.run('set local role %s' % role)
                con.run(sql)
                con.run('release savepoint t')
                return False
            except Exception:
                con.run('rollback to savepoint t')
                return True
            finally:
                as_admin()
        check('a visitor (not signed in) cannot read synced data', refused('anon', 'select count(*) from public.user_state'))
        as_user(a)
        check('a signed-in person cannot empty a table', refused('authenticated', 'truncate public.user_state'))
        check('a visitor cannot read challenges', refused('anon', 'select count(*) from public.challenge_member'))
    finally:
        con.run('rollback')
        con.close()
    failed = [n for n, ok in results if not ok]
    print('\n%d checks, %d failed; everything rolled back' % (len(results), len(failed)))
    raise SystemExit(1 if failed else 0)


if __name__ == '__main__':
    main()
