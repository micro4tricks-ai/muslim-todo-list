"""Upload the converted Mushaf pages to a Cloudflare R2 bucket (S3 API, boto3).

    python tools/flipbook-convert/upload_r2.py <converted folder> [--keys ~/r2-mushafs.json] [--workers 32] [--dry-run]

The keys file stays outside the repository and is never printed:
    {"account_id": "...", "access_key_id": "...", "secret_access_key": "...", "bucket": "mushafs"}
(R2 > Manage API tokens > Create API token, "Object Read & Write" on the bucket.)

Objects are laid out as the app expects: <book id>/p0001.webp ...
It resumes: objects already in the bucket with the same size are skipped.
It also sets the bucket's CORS rule (GET from any origin) so "save for offline" works;
if the token may not change bucket settings, set it once in the dashboard instead.
"""
import argparse
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import boto3
from botocore.config import Config

CACHE = 'public, max-age=31536000, immutable'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('--keys', default=str(Path.home() / 'r2-mushafs.json'))
    ap.add_argument('--workers', type=int, default=32)
    ap.add_argument('--only', help='upload only this book id')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    k = json.loads(Path(a.keys).expanduser().read_text(encoding='utf-8'))
    bucket = k.get('bucket', 'mushafs')
    s3 = boto3.client(
        's3', endpoint_url=f'https://{k["account_id"]}.r2.cloudflarestorage.com',
        aws_access_key_id=k['access_key_id'], aws_secret_access_key=k['secret_access_key'],
        region_name='auto', config=Config(max_pool_connections=a.workers * 2, retries={'max_attempts': 8, 'mode': 'adaptive'}))

    try:
        s3.put_bucket_cors(Bucket=bucket, CORSConfiguration={'CORSRules': [{
            'AllowedOrigins': ['*'], 'AllowedMethods': ['GET', 'HEAD'], 'AllowedHeaders': ['*'], 'MaxAgeSeconds': 86400}]})
        print('CORS: GET from any origin')
    except Exception as e:  # token without bucket-admin rights
        print(f'CORS not set by this token ({type(e).__name__}); set it in the dashboard')

    src = Path(a.src)
    books = json.loads((src / 'index.json').read_text(encoding='utf-8'))['books']
    if a.only:
        books = [b for b in books if b['id'] == a.only]
    have = {}
    for page in s3.get_paginator('list_objects_v2').paginate(Bucket=bucket):
        for o in page.get('Contents', []):
            have[o['Key']] = o['Size']
    todo = []
    for b in books:
        for p in range(1, b['pages'] + 1):
            f = src / b['id'] / f'p{p:04d}.webp'
            key = f'{b["id"]}/{f.name}'
            if not f.exists():
                sys.exit(f'missing {f}')
            if have.get(key) != f.stat().st_size:
                todo.append((f, key))
    total = sum(f.stat().st_size for f, _ in todo)
    print(f'{len(books)} books; {len(have)} objects already there; {len(todo)} to upload, {total / 2**30:.2f} GB')
    if a.dry_run or not todo:
        return

    lock, done, sent, t0 = threading.Lock(), [0], [0], time.time()

    def put(f, key):
        s3.upload_file(str(f), bucket, key, ExtraArgs={'ContentType': 'image/webp', 'CacheControl': CACHE})
        return f.stat().st_size

    with ThreadPoolExecutor(a.workers) as pool:
        futs = [pool.submit(put, f, key) for f, key in todo]
        for fu in as_completed(futs):
            n = fu.result()
            with lock:
                done[0] += 1
                sent[0] += n
                if done[0] % 200 == 0 or done[0] == len(todo):
                    dt = time.time() - t0
                    print(f'  {done[0]}/{len(todo)} files, {sent[0] / 2**30:.2f} GB, {sent[0] / 2**20 / dt:.1f} MB/s', flush=True)
    print('done')


if __name__ == '__main__':
    main()
