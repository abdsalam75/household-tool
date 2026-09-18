#!/usr/bin/env bash
# Verify the pinned Auth service with disposable identities and provider values.
# The script prints only named assertions; it never prints credentials or tokens.
set -euo pipefail

project_name="household-auth-check"
auth_port="${AUTH_TEST_PORT:-54329}"
temporary_directory="$(mktemp -d /tmp/household-auth-check.XXXXXX)"
environment_file="$temporary_directory/.env"
compose=(docker compose --env-file "$environment_file" -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.auth-test.yml)

cleanup() {
  COMPOSE_PROJECT_NAME="$project_name" "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf -- "$temporary_directory"
}
trap cleanup EXIT INT TERM

set_environment_values() {
  node - "$environment_file" "$@" <<'NODE'
const fs = require("fs");
const [path, ...assignments] = process.argv.slice(2);
let contents = fs.readFileSync(path, "utf8");
for (const assignment of assignments) {
  const separator = assignment.indexOf("=");
  const key = assignment.slice(0, separator);
  const value = assignment.slice(separator + 1);
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (!pattern.test(contents)) throw new Error(`Unknown environment key: ${key}`);
  contents = contents.replace(pattern, `${key}=${value}`);
}
fs.writeFileSync(path, contents);
NODE
}

assert_settings() {
  local expected_google="$1"
  local expected_apple="$2"
  local expected_autoconfirm="$3"
  node - "$auth_port" "$expected_google" "$expected_apple" "$expected_autoconfirm" <<'NODE'
const [port, expectedGoogle, expectedApple, expectedAutoconfirm] = process.argv.slice(2);
const expected = value => value === "true";
(async () => {
  const response = await fetch(`http://127.0.0.1:${port}/settings`);
  if (!response.ok) throw new Error(`settings returned HTTP ${response.status}`);
  const settings = await response.json();
  const checks = {
    email: settings.external.email === true,
    phone: settings.external.phone === false,
    anonymous: settings.external.anonymous_users === false,
    google: settings.external.google === expected(expectedGoogle),
    apple: settings.external.apple === expected(expectedApple),
    autoconfirm: settings.mailer_autoconfirm === expected(expectedAutoconfirm),
  };
  for (const [name, passed] of Object.entries(checks)) {
    if (!passed) throw new Error(`unexpected public setting: ${name}`);
  }
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
NODE
}

./scripts/create-supabase-env.sh "$environment_file" >/dev/null
set_environment_values \
  "API_EXTERNAL_URL=http://127.0.0.1:${auth_port}/auth/v1" \
  "GOOGLE_REDIRECT_URI=http://127.0.0.1:${auth_port}/auth/v1/callback" \
  "APPLE_REDIRECT_URI=http://127.0.0.1:${auth_port}/auth/v1/callback" \
  "SITE_URL=household-tool-local://auth/callback" \
  "ADDITIONAL_REDIRECT_URLS=household-tool-local://auth/callback,household-tool-local://invite/*"

COMPOSE_PROJECT_NAME="$project_name" "${compose[@]}" config --quiet
COMPOSE_PROJECT_NAME="$project_name" "${compose[@]}" up -d --wait db auth >/dev/null
assert_settings false false false
echo "PASS normal settings: email enabled; phone, anonymous, Google, and Apple disabled; auto-confirm disabled"

# Auto-confirm is deliberately enabled only in this disposable verification
# environment so the backend test does not depend on a real SMTP account.
set_environment_values \
  "ENABLE_EMAIL_AUTOCONFIRM=true" \
  "GOOGLE_ENABLED=true" \
  "GOOGLE_CLIENT_ID=disposable-google-client.apps.invalid" \
  "GOOGLE_SECRET=disposable-google-secret" \
  "APPLE_ENABLED=true" \
  "APPLE_CLIENT_ID=com.invalid.household.web,com.invalid.household" \
  "APPLE_SECRET=disposable-apple-secret" \
  "APPLE_BUNDLE_ID=com.invalid.household"

COMPOSE_PROJECT_NAME="$project_name" "${compose[@]}" config --quiet
COMPOSE_PROJECT_NAME="$project_name" "${compose[@]}" up -d --wait --force-recreate auth >/dev/null
assert_settings true true true
echo "PASS disposable settings: Google and Apple enabled only with runtime flags and placeholder credentials"

node - "$auth_port" <<'NODE'
const crypto = require("crypto");
const port = process.argv[2];
const base = `http://127.0.0.1:${port}`;
const email = `parent-${crypto.randomUUID()}@example.invalid`;
const password = crypto.randomBytes(24).toString("base64url");

async function jsonRequest(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

(async () => {
  const signup = await jsonRequest("/signup", { email, password });
  if (!signup.response.ok || !signup.payload.user?.email_confirmed_at) {
    throw new Error("disposable email signup was not confirmed");
  }

  const correct = await jsonRequest("/token?grant_type=password", { email, password });
  if (!correct.response.ok || !correct.payload.access_token || !correct.payload.refresh_token) {
    throw new Error("correct password did not obtain a session");
  }

  const wrong = await jsonRequest("/token?grant_type=password", {
    email,
    password: crypto.randomBytes(24).toString("base64url"),
  });
  if (wrong.response.ok || wrong.payload.access_token || wrong.payload.refresh_token) {
    throw new Error("incorrect password was not rejected");
  }
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
NODE
echo "PASS email: disposable parent confirmed, correct password obtained a session, incorrect password rejected (credentials and tokens redacted)"

node - "$auth_port" <<'NODE'
const port = process.argv[2];
const base = `http://127.0.0.1:${port}`;
const callback = `${base}/auth/v1/callback`;
const providers = [
  ["google", "accounts.google.com"],
  ["apple", "appleid.apple.com"],
];

(async () => {
  for (const [provider, expectedHost] of providers) {
    const destinations = [
      `https://outside-${provider}.invalid/steal`,
      "household-tool-local://invite/test-parent",
    ];
    for (const destination of destinations) {
      const request = new URL(`${base}/authorize`);
      request.searchParams.set("provider", provider);
      request.searchParams.set("redirect_to", destination);
      const response = await fetch(request, { redirect: "manual" });
      const location = response.headers.get("location");
      if (response.status !== 302 || !location) throw new Error(`${provider} did not redirect`);
      const authorization = new URL(location);
      if (authorization.hostname !== expectedHost) throw new Error(`${provider} used an unexpected authorization host`);
      if (authorization.searchParams.get("redirect_uri") !== callback) throw new Error(`${provider} used an unexpected provider callback`);
    }
  }
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
NODE

referrers="$({ COMPOSE_PROJECT_NAME="$project_name" "${compose[@]}" exec -T db \
  psql -X --no-password --username postgres --tuples-only --no-align --command \
  "SELECT provider_type || '|' || referrer FROM auth.flow_state WHERE provider_type IN ('google', 'apple') ORDER BY provider_type;"; } 2>/dev/null)"
if [ "$referrers" != $'apple|household-tool-local://auth/callback\napple|household-tool-local://invite/test-parent\ngoogle|household-tool-local://auth/callback\ngoogle|household-tool-local://invite/test-parent' ]; then
  echo "OAuth flow state did not preserve allowed or replace denied post-auth destinations" >&2
  exit 1
fi
echo "PASS Google: expected authorization host and API_EXTERNAL_URL callback; allowed destination preserved and denied destination replaced by SITE_URL"
echo "PASS Apple: expected authorization host and API_EXTERNAL_URL callback; allowed destination preserved and denied destination replaced by SITE_URL"
echo "PASS disposable Auth verification complete"
