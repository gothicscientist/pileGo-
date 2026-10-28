#!/usr/bin/env bash
# Apply every migration to a throwaway Postgres and run the database tests.
# Needs the Postgres server binaries (initdb, pg_ctl) on PATH or in
# /usr/lib/postgresql/<version>/bin.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
bin="$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")"
tmp="$(mktemp -d)"
port="${PGTEST_PORT:-54329}"
trap '"$bin/pg_ctl" -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT

# initdb refuses to run as root; use the postgres account when we are root.
run() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$tmp"

run "'$bin/initdb' -D '$tmp/data' -U postgres -A trust >/dev/null"
run "'$bin/pg_ctl' -D '$tmp/data' -o '-p $port -k $tmp' -l '$tmp/log' -w start >/dev/null"

psql_() { psql -h "$tmp" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_ -f "$here/stub_supabase.sql"
for f in "$root"/supabase/migrations/*.sql; do
  echo "migrate $(basename "$f")"
  psql_ -f "$f"
done
psql_ -c "grant all on all tables in schema public to authenticated, service_role;"
for t in "$here"/*.test.sql; do
  echo "test $(basename "$t")"
  psql_ -o /dev/null -f "$t"
done
echo "database tests passed"
