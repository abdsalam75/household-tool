# Supabase Compose operations

The tracked composition in `infra/supabase` is based on Supabase's official self-hosted Docker Compose topology ([upstream source](https://github.com/supabase/supabase/tree/master/docker), reviewed 2026-09-13), not the Supabase CLI local-development stack. Its pinned image versions form one compatible upstream set; review and upgrade them together.

## Required preflight for the Compose issue

This Compose setup is required for issue #3. It is not a prerequisite for
unrelated current or future app issues. Run the safe checks below before
starting the issue and record their output in the issue preflight. Do not run
the project Compose commands until Docker and Docker Compose have passed.

On Windows, first run this in PowerShell (not Ubuntu) and confirm the selected
Ubuntu distribution is version 2:

```powershell
wsl -l -v
```

In Ubuntu WSL, run:

```sh
docker version
docker compose version
nproc
free -h
df -h .
ss -ltn '( sport = :80 or sport = :443 )'
```

These are availability/resource checks. No listener in the `ss` output means
ports 80 and 443 are free. Once `docker version` and `docker compose version`
succeed, run this user verification command (it can download Docker's test
image):

```sh
docker run --rm hello-world
```

All three Docker commands must succeed. Ports 80 and 443 must be free before
starting this composition.
The official Supabase self-hosting guide gives a minimum of 4 GB RAM, 2 CPU
cores, and 40 GB SSD storage; use at least 8 GB RAM, 4 CPU cores, and 80 GB
SSD where possible for a more reliable local environment. See Supabase's
[self-hosting with Docker guide](https://supabase.com/docs/guides/self-hosting/docker).

## Choose one Docker setup path

Use exactly one of the following supported paths. Do not install native Docker
Engine in Ubuntu WSL and also enable Docker Desktop's WSL integration for the
same distribution: mixing the two daemons and CLIs makes the active Docker
context, images, volumes, ports, and permissions ambiguous.

### Path A (recommended): Docker Desktop on Windows with WSL 2 integration

This is the recommended path for Windows + WSL2. Install Docker Desktop using
Docker's official [Windows installation guide](https://docs.docker.com/desktop/setup/install/windows-install/).
Download and run Docker Desktop for Windows, selecting the WSL 2 backend when
the installer offers the choice. Start Docker Desktop; in its settings, enable
the WSL 2 engine and enable integration for this Ubuntu distribution following
Docker's official [WSL integration guide](https://docs.docker.com/desktop/features/wsl/).
Apply/restart Docker Desktop if requested, then close and reopen Ubuntu and run
the verification commands in the preflight section above. Docker Desktop must
be running whenever the Compose stack is used.

### Path B: native Docker Engine and Compose plugin in Ubuntu WSL

Use this only when you deliberately manage Docker inside Ubuntu WSL instead of
using Docker Desktop integration. Follow Docker's official
[Ubuntu Engine installation guide](https://docs.docker.com/engine/install/ubuntu/).
For Ubuntu 26.04, Docker's repository instructions are the authoritative
source; the following commands follow that documented apt-repository method:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Then follow Docker's official [Linux post-install steps](https://docs.docker.com/engine/install/linux-postinstall/)
to run Docker without `sudo`:

```sh
sudo groupadd docker
sudo usermod -aG docker "$USER"
```

`sudo groupadd docker` may report that the group already exists; that is
expected and does not require recreating it. Log out and back in, or activate
the new group membership in the current terminal with:

```sh
newgrp docker
```

The `docker` group grants root-level privileges, so treat membership as
privileged access. Only after activation, verify non-root access with:

```sh
docker run --rm hello-world
```

Then run every preflight verification command above without `sudo`. Do not
enable Docker Desktop WSL integration for this Ubuntu distribution when using
this path.

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
