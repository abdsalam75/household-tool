# Supabase Compose operations

The tracked composition in `infra/supabase` is based on Supabase's official self-hosted Docker Compose topology ([upstream source](https://github.com/supabase/supabase/tree/master/docker), reviewed 2026-09-13), not the Supabase CLI local-development stack. Its pinned image versions form one compatible upstream set; review and upgrade them together.

## Local operation

Install Docker Engine and the Docker Compose v2 plugin on Linux/WSL, with ports 80 and 443 available. Create only disposable local values, then resolve, start, and inspect the configuration:

```sh
./scripts/create-supabase-env.sh
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml config
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.caddy.yml up -d
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.caddy.yml ps
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.caddy.yml ps --format 'table {{.Name}}\t{{.Status}}\t{{.Health}}'
```

`config` must complete without unresolved variables/services. The last command identifies every declared health check: wait until each applicable service says `healthy`; inspect a failure with `docker compose ... logs SERVICE`. The generated `.env` is ignored and must never be used for production.

## Production boundary

Only Caddy publishes host ports 80 and 443; it terminates TLS and redirects HTTP to HTTPS for a real `PROXY_DOMAIN`. The gateway, database, pooler, Auth, REST, Realtime, Storage, Functions, metadata, image proxy, and Studio communicate on private Compose networks behind Caddy. Postgres has no published host port. Studio is an administrative service: do not expose it publicly; restrict it to a VPN/private administrative network (or disable it through an approved production override).

Permit only SSH administration and TCP 80/443 at the host firewall. Supply production secrets from a host secret manager or protected environment file outside Git; never copy them into this repository. Deploy in order: provision protected secrets, named/managed storage and DNS/firewall; validate Compose; start and health-check Postgres; apply the versioned migrations from issue #4; start the remaining services; then verify health and public HTTPS through Caddy.

Postgres, Storage, and Caddy certificate/configuration data are named volumes (`db-config`/database storage, storage storage, `caddy_data`, and `caddy_config`); use managed persistent storage when Docker volumes are unsuitable. Encrypted off-host Postgres and Storage backup/restore responsibility, backup automation, and isolated restore verification must be completed in issue #36.
