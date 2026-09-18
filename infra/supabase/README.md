# Supabase Compose operations

This directory is based on Supabase's official self-hosted Docker topology at
commit [`8c7a4d9dbbaf8b552893822e89d7bf06f33f9220`](https://github.com/supabase/supabase/tree/8c7a4d9dbbaf8b552893822e89d7bf06f33f9220/docker)
(self-hosted release `2026-09-09 - 0.8.1`). It is not the Supabase CLI
development stack. Upgrade the topology, configuration files, and pinned
images together against a newer reviewed upstream commit.

## Intentional differences from upstream

- Gateway and Supavisor host ports are removed. The Caddy overlay is the only
  configuration that publishes host ports.
- Postgres and Storage bind mounts are replaced by the named volumes
  `postgres-data` and `storage-data`; `db-config` remains the named volume for
  Postgres configuration state.
- Every service has a health check. Storage waits for healthy REST and imgproxy
  prerequisites, and Caddy waits for the healthy API gateway.
- The tracked environment file contains local placeholders and generation
  instructions rather than Supabase's example credentials. The generator
  creates disposable secrets in the ignored `.env` file.
- The Caddy configuration uses `PROXY_DOMAIN`, adds persistent `caddy_data` and
  `caddy_config` volumes, and provides the production TLS boundary.
- The example Edge Functions were formatted to the repository's Prettier
  rules; their behavior is unchanged.

All other tracked upstream support files are copied from the selected commit.

## Local prerequisites

Use Linux or Ubuntu/WSL with:

- Docker Engine running and accessible to the current user;
- Docker Compose v2 (`docker compose`), not the legacy standalone command;
- at least 4 GB RAM, 2 CPU cores, and 40 GB free storage; and
- host ports 80 and 443 available.

Verify those prerequisites before starting:

```sh
docker version
docker compose version
docker run --rm hello-world
nproc
free -h
df -h .
ss -ltn '( sport = :80 or sport = :443 )'
```

Follow Docker's official installation instructions for
[Docker Desktop with WSL 2](https://docs.docker.com/desktop/features/wsl/) or
[Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/).
Supabase's resource guidance is in its
[self-hosting guide](https://supabase.com/docs/guides/self-hosting/docker).

## Local operation

From the repository root, generate non-production values, validate the merged
configuration, start it, and inspect every service and health check:

```sh
./scripts/create-supabase-env.sh
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.caddy.yml config
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.caddy.yml up -d --wait
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.caddy.yml ps --all
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.caddy.yml ps --all --format 'table {{.Name}}\t{{.Status}}\t{{.Health}}'
```

The `config` command must finish without missing variables or unresolved
services. The `up --wait` command fails if the services do not become running
or healthy. The final command displays the health state of every declared
health check. Diagnose a failure by appending `logs SERVICE` to the same
Compose file arguments. Stop the stack without deleting its named volumes:

```sh
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.caddy.yml down
```

The generated `.env` is ignored and is only for disposable local operation.
Delete it before generating a fresh environment; the generator deliberately
refuses to overwrite an existing file.

## Parent authentication providers

Email/password, Google, and Apple configuration, the local/staging/production
redirect matrix, provider-console checklists, secret-handling rules, and exact
verification commands are in [AUTH.md](./AUTH.md). The committed redacted
backend evidence and any credential-gated results are in
[auth-validation.md](./auth-validation.md).

Run the focused automated and disposable runtime checks from the repository
root:

```sh
npm test -- __tests__/supabase-auth.test.js
./scripts/test-supabase-auth.sh
```

## Application database migrations

`infra/supabase/migrations/` is the source of truth for application schema
changes. Migration files are plain SQL and use the unique, lexicographically
sortable format `YYYYMMDDHHMMSS_lowercase_words.sql` (UTC timestamp followed
by a lowercase snake-case description). Never edit an applied file. Add a new
migration with a later timestamp instead.

Never edit the database schema directly. Every application schema change must
be represented by a reviewed migration file and applied through this workflow.

The prerequisites are the local prerequisites above, a generated
`infra/supabase/.env`, and a healthy `db` service. From the repository root,
start only that service if the full stack is not already running, then apply
all pending migrations:

```sh
./scripts/create-supabase-env.sh # only when infra/supabase/.env does not exist
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml up -d --wait db
./scripts/apply-supabase-migrations.sh
```

The script uses `psql` inside the existing `db` container, so it requires no
host PostgreSQL client, Supabase CLI, or password argument. It prints every
filename it applies in filename order. Each migration and its history record
commit in one transaction; a failure rolls both back, stops later migrations,
and returns a non-zero status. A repeat run reports `No pending migrations.`

To create a migration, choose a new UTC timestamp and description, write its
SQL, review it, and apply it:

```sh
touch infra/supabase/migrations/20260918153000_describe_the_change.sql
# Edit and review the SQL file, then:
./scripts/apply-supabase-migrations.sh
```

Applied filenames and SHA-256 checksums are recorded in
`public.schema_migrations`. Inspect them without exposing a password:

```sh
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml exec -T db \
  psql -X --no-password --username postgres --command \
  'SELECT filename, checksum, applied_at FROM public.schema_migrations ORDER BY filename;'
```

The starter migration creates only the empty, non-product `app_private`
schema. Verify it exists with:

```sh
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml exec -T db \
  psql -X --no-password --username postgres --tuples-only --command \
  "SELECT to_regnamespace('app_private');"
```

The workflow checks every recorded checksum before applying anything pending.
If an applied file changed or disappeared, it exits with an immutability error
and does not run later migrations. Restore the applied file exactly; never
rewrite migration history.

## Household and membership foundation

`public.households` stores the generated household UUID, a validated named IANA
time zone, the Auth account that created the row, and managed creation/update
timestamps. `public.members` stores a generated member UUID, its required
household, an optional Auth account for an unactivated child, display name,
`parent`/`child` role, active state, and managed timestamps.

The database rejects unknown time zones, missing Auth references, parents
without accounts, duplicate non-null account membership within a household,
and more than two active parents. Active-parent checks lock the household row,
so competing inserts or activations cannot both pass. An inactive parent can
be replaced. Update triggers always move `updated_at` to a value greater than
or equal to `created_at`.

RLS derives access only from `auth.uid()` and active membership:

| Caller | Household rows | Member rows |
| --- | --- | --- |
| Active parent | Own household | Every member in own household |
| Active child | None | Own active child membership only |
| Inactive-only account | None | None |
| Anonymous | None | None |

Supplying another household or member ID does not grant access. `anon` and
`authenticated` have SELECT only; direct inserts, updates, and deletes are
intentionally denied until later server-side operations own those mutations.
The RLS helper is in `app_private`, reports only whether the current Auth
account is an active parent of the tested household, and is executable only by
`authenticated`.

Apply the migrations to a running database with:

```sh
./scripts/apply-supabase-migrations.sh
```

Run the focused verification from a fresh, explicitly named disposable local
Compose project. Stop the normal stack first because the upstream topology
uses fixed container names. The verifier deletes only the
`household-foundation-check` project's volumes, applies every migration, uses
Auth identities in two households, checks the schema constraints and complete
RLS matrix, races two parent inserts, checks migration idempotence, and removes
the disposable volumes when it exits:

```sh
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.caddy.yml down
COMPOSE_PROJECT_NAME=household-foundation-check ./scripts/test-household-database.sh
```

### Fresh disposable verification

Use an isolated Compose project to repeat the complete check without touching
the normal local database volumes. Because the upstream topology fixes
container names, first stop the normal local stack without deleting its
volumes. The cleanup command below permanently deletes only the explicitly
named `household-migrations-check` project's disposable data. These commands
must never be run against a deployed environment.

```sh
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.caddy.yml down
COMPOSE_PROJECT_NAME=household-migrations-check docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml up -d --wait db
COMPOSE_PROJECT_NAME=household-migrations-check ./scripts/apply-supabase-migrations.sh
COMPOSE_PROJECT_NAME=household-migrations-check ./scripts/apply-supabase-migrations.sh
COMPOSE_PROJECT_NAME=household-migrations-check docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml exec -T db \
  psql -X --no-password --username postgres --command \
  "SELECT filename, checksum FROM public.schema_migrations ORDER BY filename; SELECT to_regnamespace('app_private');"
# WARNING: destroys only the household-migrations-check project's disposable volumes.
COMPOSE_PROJECT_NAME=household-migrations-check docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml down --volumes
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.caddy.yml up -d --wait
```

To demonstrate atomic failure handling in that isolated project, add a
temporary migration containing one valid statement followed by invalid SQL
and another migration ordered after it. Run the migration command, then
inspect the attempted objects and history. The command must fail, all three
queries must return no row, and the later migration must not run:

```sh
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.caddy.yml down
COMPOSE_PROJECT_NAME=household-migrations-check docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml up -d --wait db
COMPOSE_PROJECT_NAME=household-migrations-check ./scripts/apply-supabase-migrations.sh
printf '%s\n' 'CREATE TABLE app_private.failure_probe (id integer);' 'INVALID SQL;' > infra/supabase/migrations/99990101000000_failure_probe.sql
printf '%s\n' 'CREATE TABLE app_private.later_probe (id integer);' > infra/supabase/migrations/99990101000001_later_probe.sql
COMPOSE_PROJECT_NAME=household-migrations-check ./scripts/apply-supabase-migrations.sh
COMPOSE_PROJECT_NAME=household-migrations-check docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml exec -T db \
  psql -X --no-password --username postgres --command \
  "SELECT to_regclass('app_private.failure_probe'); SELECT to_regclass('app_private.later_probe'); SELECT * FROM public.schema_migrations WHERE filename >= '99990101000000';"
rm infra/supabase/migrations/99990101000000_failure_probe.sql infra/supabase/migrations/99990101000001_later_probe.sql
# WARNING: destroys only the household-migrations-check project's disposable volumes.
COMPOSE_PROJECT_NAME=household-migrations-check docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml down --volumes
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.caddy.yml up -d --wait
```

## Production boundary

Only Caddy publishes host TCP ports 80 and 443 (and UDP 443 for HTTP/3). Caddy
terminates TLS for `PROXY_DOMAIN` and automatically redirects HTTP to HTTPS.
Supply the real hostname through the production environment outside Git; its
DNS must resolve to the host before Caddy requests a certificate. Postgres,
the gateway, pooler, Auth, REST, Realtime, Storage, Functions, metadata,
imgproxy, and Studio stay on the private Compose network with no direct host
ports. Disable Studio in the production override or permit it only through a
VPN/private administrative network; never expose it publicly.

At the host firewall, permit only the chosen SSH administration source and
public TCP 80/443 (plus UDP 443 only when HTTP/3 is wanted). Keep Postgres and
all Supabase internal ports closed. Supply database passwords, JWT material,
API keys, OAuth credentials, and the remaining production secrets from a
secret manager or protected environment file outside Git. Do not use the
local generator's values in production.

Deploy in this order:

1. Provision protected production secrets, persistent storage, DNS, firewall,
   and the private Studio access policy.
2. Resolve and review the merged Compose configuration.
3. Start Postgres and wait for its health check.
4. Apply the versioned database migrations delivered by issue #4.
5. Start the remaining services and wait for all declared health checks.
6. Verify public HTTPS through Caddy and confirm that internal ports are not
   reachable from the public network.

Postgres uses `postgres-data` and `db-config`, Storage uses `storage-data`, and
Caddy uses `caddy_data` and `caddy_config`; recreating containers therefore
does not discard that state. Production may map those named volumes to managed
persistent storage. Encrypted off-host backups, automation, and isolated
restore verification remain the responsibility of issue #36.
