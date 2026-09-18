#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migrations_dir="${SUPABASE_MIGRATIONS_DIR:-${repo_root}/infra/supabase/migrations}"
env_file="${SUPABASE_ENV_FILE:-${repo_root}/infra/supabase/.env}"
compose_file="${repo_root}/infra/supabase/docker-compose.yml"

if [[ ! -f "$env_file" ]]; then
  echo "error: Supabase environment file not found: $env_file" >&2
  echo "Run ./scripts/create-supabase-env.sh first." >&2
  exit 1
fi

if [[ ! -d "$migrations_dir" ]]; then
  echo "error: migration directory not found: $migrations_dir" >&2
  exit 1
fi

compose=(docker compose --env-file "$env_file" -f "$compose_file")
container_id="$("${compose[@]}" ps -q db)"

if [[ -z "$container_id" ]]; then
  echo "error: the Supabase db service is not running" >&2
  exit 1
fi

health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
if [[ "$health" != "healthy" ]]; then
  echo "error: the Supabase db service is not healthy (status: $health)" >&2
  exit 1
fi

psql=("${compose[@]}" exec -T db psql -X --no-password --username postgres --set ON_ERROR_STOP=1)

mapfile -t migration_paths < <(
  find "$migrations_dir" -maxdepth 1 -type f -name '*.sql' -print | LC_ALL=C sort
)

if (( ${#migration_paths[@]} == 0 )); then
  echo "error: no migration files found in $migrations_dir" >&2
  exit 1
fi

declare -A local_checksums=()
declare -A migration_by_name=()

for migration_path in "${migration_paths[@]}"; do
  filename="$(basename "$migration_path")"
  if [[ ! "$filename" =~ ^[0-9]{14}_[a-z0-9]+(_[a-z0-9]+)*\.sql$ ]]; then
    echo "error: invalid migration filename '$filename'" >&2
    echo "Expected YYYYMMDDHHMMSS_lowercase_words.sql." >&2
    exit 1
  fi
  if [[ -n "${migration_by_name[$filename]+present}" ]]; then
    echo "error: duplicate migration filename '$filename'" >&2
    exit 1
  fi
  migration_by_name["$filename"]="$migration_path"
  local_checksums["$filename"]="$(sha256sum "$migration_path" | awk '{print $1}')"
done

"${psql[@]}" --quiet <<'SQL'
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename text PRIMARY KEY,
  checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
SQL

declare -A applied_checksums=()
while IFS='|' read -r filename checksum; do
  [[ -z "$filename" ]] && continue
  applied_checksums["$filename"]="$checksum"
done < <("${psql[@]}" --tuples-only --no-align --field-separator='|' --command \
  'SELECT filename, checksum FROM public.schema_migrations ORDER BY filename;')

# Validate the complete applied history before executing any pending migration.
# This makes changed or deleted migrations fail before later files can run.
for filename in "${!applied_checksums[@]}"; do
  if [[ -z "${local_checksums[$filename]+present}" ]]; then
    echo "error: applied migration '$filename' is missing from the repository; applied migrations are immutable" >&2
    exit 1
  fi
  if [[ "${applied_checksums[$filename]}" != "${local_checksums[$filename]}" ]]; then
    echo "error: applied migration '$filename' has changed; applied migrations are immutable" >&2
    exit 1
  fi
done

applied_count=0
for migration_path in "${migration_paths[@]}"; do
  filename="$(basename "$migration_path")"
  if [[ -n "${applied_checksums[$filename]+present}" ]]; then
    continue
  fi

  checksum="${local_checksums[$filename]}"
  echo "Applying $filename"
  if ! {
    printf '%s\n' 'BEGIN;'
    printf '%s\n' "SELECT pg_advisory_xact_lock(hashtext('household-tool-schema-migrations'));"
    printf '\\echo Running %s\n' "$filename"
    sed -e '$a\' "$migration_path"
    printf '%s\n' "INSERT INTO public.schema_migrations (filename, checksum) VALUES ('$filename', '$checksum');"
    printf '%s\n' 'COMMIT;'
  } | "${psql[@]}"; then
    echo "error: migration '$filename' failed; its transaction was rolled back and later migrations were not run" >&2
    exit 1
  fi
  echo "Applied $filename"
  ((applied_count += 1))
done

if (( applied_count == 0 )); then
  echo "No pending migrations."
else
  echo "Applied $applied_count migration(s)."
fi
