"""Runs a SQL file against the project's Supabase database.

Usage: python tools/supabase_migrate.py supabase/khatma.sql
Needs the pg8000 driver on PYTHONPATH, the database password in a local file outside the
repository (SUPABASE_DB_PASSWORD_FILE, default ~/supabase-db-password.txt), and Supabase's root
certificate (SUPABASE_CA, from the dashboard's "SSL certificate" or
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt), so the
connection is verified. The password is never printed. Connects through the session pooler.
"""
import os
import ssl
import sys

import pg8000.native

REF = 'jvvvqkmmpfuvbihsvjan'
HOSTS = ['aws-0-eu-central-1.pooler.supabase.com', 'aws-1-eu-central-1.pooler.supabase.com']


def main():
    sql_path = sys.argv[1]
    pw_file = os.environ.get('SUPABASE_DB_PASSWORD_FILE', os.path.expanduser('~/supabase-db-password.txt'))
    with open(pw_file, encoding='utf-8') as f:
        password = f.read().strip().splitlines()[-1].strip()
    with open(sql_path, encoding='utf-8') as f:
        sql = f.read()
    ctx = ssl.create_default_context(cafile=os.environ['SUPABASE_CA'])
    # Supabase's root lacks the key-usage field that Python 3.13+ demands by default; the chain
    # and the host name are still checked.
    ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    last = None
    for host in HOSTS:
        try:
            con = pg8000.native.Connection(user='postgres.' + REF, password=password, host=host, port=5432,
                                           database='postgres', ssl_context=ctx, timeout=30)
        except Exception as e:  # wrong pooler region or the like: try the next
            last = e
            print('could not connect through', host, '-', type(e).__name__, str(e)[:120])
            continue
        print('connected through', host)
        con.run(sql)
        print('ran', sql_path)
        con.close()
        return
    raise SystemExit('no connection: %s' % last)


if __name__ == '__main__':
    main()
