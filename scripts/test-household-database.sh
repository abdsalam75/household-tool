#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${repo_root}/infra/supabase/.env"
compose_file="${repo_root}/infra/supabase/docker-compose.yml"
project_name="${COMPOSE_PROJECT_NAME:-}"
required_project_name="household-foundation-check"

if [[ "$project_name" != "$required_project_name" ]]; then
  echo "error: set COMPOSE_PROJECT_NAME=$required_project_name to acknowledge disposable database destruction" >&2
  exit 1
fi

if [[ ! -f "$env_file" ]]; then
  echo "error: Supabase environment file not found: $env_file" >&2
  echo "Run ./scripts/create-supabase-env.sh first." >&2
  exit 1
fi

compose=(docker compose --project-name "$project_name" --env-file "$env_file" -f "$compose_file")
psql=("${compose[@]}" exec -T db psql -X --no-password --username postgres --set ON_ERROR_STOP=1)
temporary_directory="$(mktemp -d)"

cleanup() {
  "${compose[@]}" down --volumes >/dev/null 2>&1 || true
  rm -rf "$temporary_directory"
}
trap cleanup EXIT

# Only the explicitly named project's volumes are removed.
"${compose[@]}" down --volumes
"${compose[@]}" up -d --wait db
COMPOSE_PROJECT_NAME="$project_name" "${repo_root}/scripts/apply-supabase-migrations.sh"
"${psql[@]}" <"${repo_root}/infra/supabase/tests/households_members.sql"

first_output="${temporary_directory}/first-parent-attempt.log"
second_output="${temporary_directory}/second-parent-attempt.log"

set +e
"${psql[@]}" --command "BEGIN; INSERT INTO public.members (household_id, account_id, display_name, role) VALUES ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'Concurrent parent B2', 'parent'); SELECT pg_sleep(2); COMMIT;" >"$first_output" 2>&1 &
first_pid=$!
"${psql[@]}" --command "INSERT INTO public.members (household_id, account_id, display_name, role) VALUES ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'Concurrent parent B3', 'parent');" >"$second_output" 2>&1 &
second_pid=$!
wait "$first_pid"
first_status=$?
wait "$second_pid"
second_status=$?
set -e

if ! { [[ "$first_status" -eq 0 && "$second_status" -ne 0 ]] || [[ "$first_status" -ne 0 && "$second_status" -eq 0 ]]; }; then
  echo "error: expected exactly one competing parent insert to succeed" >&2
  sed -n '1,120p' "$first_output" >&2
  sed -n '1,120p' "$second_output" >&2
  exit 1
fi

if ! grep -q "cannot have more than two active parents" "$first_output" "$second_output"; then
  echo "error: losing competing parent insert did not fail at the active-parent limit" >&2
  sed -n '1,120p' "$first_output" >&2
  sed -n '1,120p' "$second_output" >&2
  exit 1
fi

active_parent_count="$("${psql[@]}" --tuples-only --no-align --command "SELECT count(*) FROM public.members WHERE household_id = 'b0000000-0000-0000-0000-000000000001' AND role = 'parent' AND active;")"
if [[ "$active_parent_count" != "2" ]]; then
  echo "error: expected two active parents after competing inserts, got $active_parent_count" >&2
  exit 1
fi

COMPOSE_PROJECT_NAME="$project_name" "${repo_root}/scripts/apply-supabase-migrations.sh"
echo "Concurrent active-parent limit passed."
echo "Household/member disposable database verification passed."
