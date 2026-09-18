#!/usr/bin/env bash
# Check a configured provider's authorization host and callback without
# accepting or printing provider credentials.
set -euo pipefail

provider="${1:-}"
case "$provider" in
  google) expected_host="accounts.google.com" ;;
  apple) expected_host="appleid.apple.com" ;;
  *) echo "Usage: AUTH_PUBLIC_URL=... API_EXTERNAL_URL=... $0 google|apple" >&2; exit 2 ;;
esac

: "${AUTH_PUBLIC_URL:?Set the deployed public Auth URL ending in /auth/v1}"
: "${API_EXTERNAL_URL:?Set the deployed API_EXTERNAL_URL ending in /auth/v1}"

node - "$provider" "$expected_host" "$AUTH_PUBLIC_URL" "$API_EXTERNAL_URL" <<'NODE'
const [provider, expectedHost, publicUrl, externalUrl] = process.argv.slice(2);
const publicBase = publicUrl.replace(/\/$/, "");
const externalBase = externalUrl.replace(/\/$/, "");

(async () => {
  const settingsResponse = await fetch(`${publicBase}/settings`);
  if (!settingsResponse.ok) throw new Error(`settings returned HTTP ${settingsResponse.status}`);
  const settings = await settingsResponse.json();
  if (settings.external?.[provider] !== true) throw new Error(`${provider} is not enabled in public settings`);

  const authorize = new URL(`${publicBase}/authorize`);
  authorize.searchParams.set("provider", provider);
  const response = await fetch(authorize, { redirect: "manual" });
  const location = response.headers.get("location");
  if (response.status !== 302 || !location) throw new Error(`${provider} did not redirect`);
  const destination = new URL(location);
  if (destination.hostname !== expectedHost) throw new Error(`${provider} used an unexpected authorization host`);
  if (destination.searchParams.get("redirect_uri") !== `${externalBase}/callback`) {
    throw new Error(`${provider} used an unexpected callback`);
  }
  console.log(`PASS ${provider}: enabled, expected authorization host, expected callback (credentials redacted)`);
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
NODE
