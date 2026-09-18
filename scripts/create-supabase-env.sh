#!/usr/bin/env bash
# Create an ignored, disposable local environment. Refuses to overwrite it.
set -euo pipefail
target="${1:-infra/supabase/.env}"
if [ -e "$target" ]; then echo "Refusing to overwrite $target" >&2; exit 1; fi
node - "$target" <<'NODE'
const crypto=require('crypto'), fs=require('fs');
const s=crypto.randomBytes(48).toString('base64url'), now=Math.floor(Date.now()/1000);
const token=role=>{const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const p=Buffer.from(JSON.stringify({role,iss:'household-local',iat:now,exp:now+315360000})).toString('base64url');return h+'.'+p+'.'+crypto.createHmac('sha256',s).update(h+'.'+p).digest('base64url')};
let env=fs.readFileSync('infra/supabase/.env.example','utf8');
const values={POSTGRES_PASSWORD:crypto.randomBytes(32).toString('base64url'),JWT_SECRET:s,ANON_KEY:token('anon'),SERVICE_ROLE_KEY:token('service_role'),DASHBOARD_PASSWORD:crypto.randomBytes(24).toString('base64url'),SECRET_KEY_BASE:crypto.randomBytes(48).toString('base64url'),REALTIME_DB_ENC_KEY:crypto.randomBytes(8).toString('hex'),VAULT_ENC_KEY:crypto.randomBytes(16).toString('hex'),PG_META_CRYPTO_KEY:crypto.randomBytes(32).toString('base64url'),LOGFLARE_PUBLIC_ACCESS_TOKEN:crypto.randomBytes(32).toString('base64url'),LOGFLARE_PRIVATE_ACCESS_TOKEN:crypto.randomBytes(32).toString('base64url'),S3_PROTOCOL_ACCESS_KEY_ID:crypto.randomBytes(16).toString('hex'),S3_PROTOCOL_ACCESS_KEY_SECRET:crypto.randomBytes(32).toString('hex'),MINIO_ROOT_PASSWORD:crypto.randomBytes(32).toString('hex'),POOLER_TENANT_ID:crypto.randomUUID(),SMTP_PASS:crypto.randomBytes(24).toString('base64url')};
for(const [key,value] of Object.entries(values)) env=env.replace(new RegExp('^'+key+'=.*$','m'),key+'='+value);
env=env.replace(/^PROXY_DOMAIN=.*$/m,'PROXY_DOMAIN=localhost').replace(/^OPENAI_API_KEY=.*$/m,'OPENAI_API_KEY=').replace(/^CADDY_HTTP_PORT=.*$/m,'CADDY_HTTP_PORT=80').replace(/^CADDY_HTTPS_PORT=.*$/m,'CADDY_HTTPS_PORT=443');
env=env.replace(/^SMTP_ADMIN_EMAIL=.*$/m,'SMTP_ADMIN_EMAIL=auth-check@localhost.invalid').replace(/^SMTP_HOST=.*$/m,'SMTP_HOST=mail.localhost.invalid').replace(/^SMTP_USER=.*$/m,'SMTP_USER=auth-check');
fs.writeFileSync(process.argv[2],env);
NODE
echo "Created disposable local environment at $target"
