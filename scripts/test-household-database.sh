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
"${psql[@]}" <"${repo_root}/infra/supabase/tests/household_setup_settings.sql"
"${psql[@]}" <"${repo_root}/infra/supabase/tests/parent_invitations.sql"
"${psql[@]}" <"${repo_root}/infra/supabase/tests/parent_invitation_acceptance.sql"

"${psql[@]}" --command "INSERT INTO auth.users (id, email) VALUES ('40000000-0000-0000-0000-000000000009', 'concurrent-inviter@example.test'), ('40000000-0000-0000-0000-000000000010', 'concurrent-recipient@example.test'); INSERT INTO public.households (id, timezone, creator_account_id) VALUES ('d0000000-0000-0000-0000-000000000004', 'Africa/Lagos', '40000000-0000-0000-0000-000000000009'); INSERT INTO public.members (household_id, account_id, display_name, role) VALUES ('d0000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000009', 'Concurrent inviter', 'parent'); INSERT INTO public.parent_invitations (household_id, token_digest, created_by, created_at, expires_at) VALUES ('d0000000-0000-0000-0000-000000000004', extensions.digest(repeat('i', 43), 'sha256'), '40000000-0000-0000-0000-000000000009', statement_timestamp(), statement_timestamp() + interval '24 hours');"

acceptance_first_output="${temporary_directory}/first-acceptance-attempt.log"
acceptance_second_output="${temporary_directory}/second-acceptance-attempt.log"
acceptance_command="BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '40000000-0000-0000-0000-000000000010'; SET LOCAL request.jwt.claims = '{\"sub\":\"40000000-0000-0000-0000-000000000010\",\"email\":\"concurrent-recipient@example.test\",\"role\":\"authenticated\"}'; SELECT invitation_status FROM public.accept_parent_invitation(repeat('i', 43)); SELECT pg_sleep(1); COMMIT;"

set +e
"${psql[@]}" --command "$acceptance_command" >"$acceptance_first_output" 2>&1 &
acceptance_first_pid=$!
"${psql[@]}" --command "$acceptance_command" >"$acceptance_second_output" 2>&1 &
acceptance_second_pid=$!
wait "$acceptance_first_pid"
acceptance_first_status=$?
wait "$acceptance_second_pid"
acceptance_second_status=$?
set -e

if [[ "$acceptance_first_status" -ne 0 || "$acceptance_second_status" -ne 0 ]]; then
  echo "error: concurrent invitation acceptance requests did not both return safely" >&2
  sed -n '1,120p' "$acceptance_first_output" >&2
  sed -n '1,120p' "$acceptance_second_output" >&2
  exit 1
fi

acceptance_results="$(grep -h -E '^[[:space:]]*(accepted|consumed)[[:space:]]*$' "$acceptance_first_output" "$acceptance_second_output" | sed 's/[[:space:]]//g' | sort | paste -sd ':' -)"
if [[ "$acceptance_results" != "accepted:consumed" ]]; then
  echo "error: concurrent invitation acceptance did not produce one accepted and one consumed result" >&2
  sed -n '1,120p' "$acceptance_first_output" >&2
  sed -n '1,120p' "$acceptance_second_output" >&2
  exit 1
fi

acceptance_counts="$("${psql[@]}" --tuples-only --no-align --command "SELECT (SELECT count(*) FROM public.members WHERE account_id = '40000000-0000-0000-0000-000000000010') || ':' || (SELECT count(*) FROM public.parent_invitations WHERE token_digest = extensions.digest(repeat('i', 43), 'sha256') AND used_at IS NOT NULL);")"
if [[ "$acceptance_counts" != "1:1" ]]; then
  echo "error: concurrent invitation acceptance created unexpected member/invitation counts: $acceptance_counts" >&2
  exit 1
fi

setup_first_output="${temporary_directory}/first-setup-attempt.log"
setup_second_output="${temporary_directory}/second-setup-attempt.log"
setup_command="BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '30000000-0000-0000-0000-000000000005'; SET LOCAL request.jwt.claims = '{\"sub\":\"30000000-0000-0000-0000-000000000005\",\"email\":\"concurrent@example.test\",\"role\":\"authenticated\"}'; SELECT * FROM public.setup_household('Africa/Lagos'); SELECT pg_sleep(1); COMMIT;"

set +e
"${psql[@]}" --command "$setup_command" >"$setup_first_output" 2>&1 &
setup_first_pid=$!
"${psql[@]}" --command "$setup_command" >"$setup_second_output" 2>&1 &
setup_second_pid=$!
wait "$setup_first_pid"
setup_first_status=$?
wait "$setup_second_pid"
setup_second_status=$?
set -e

if [[ "$setup_first_status" -ne 0 || "$setup_second_status" -ne 0 ]]; then
  echo "error: concurrent setup retries did not both return successfully" >&2
  sed -n '1,120p' "$setup_first_output" >&2
  sed -n '1,120p' "$setup_second_output" >&2
  exit 1
fi

setup_counts="$("${psql[@]}" --tuples-only --no-align --command "SELECT (SELECT count(*) FROM public.households WHERE creator_account_id = '30000000-0000-0000-0000-000000000005') || ':' || (SELECT count(*) FROM public.members WHERE account_id = '30000000-0000-0000-0000-000000000005');")"
if [[ "$setup_counts" != "1:1" ]]; then
  echo "error: concurrent setup created unexpected household/member counts: $setup_counts" >&2
  exit 1
fi

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
echo "Concurrent household setup retry passed."
echo "Concurrent parent invitation acceptance passed."
echo "Household/member disposable database verification passed."
