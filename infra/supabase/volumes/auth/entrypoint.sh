#!/bin/sh
# Derive effective provider flags without printing any credential value.
set -eu

provider_enabled() {
  requested="$1"
  client_id="$2"
  secret="$3"
  if [ "$requested" = "true" ] && [ -n "$client_id" ] && [ -n "$secret" ]; then
    printf true
  else
    printf false
  fi
}

export GOTRUE_EXTERNAL_GOOGLE_ENABLED="$(provider_enabled \
  "${HOUSEHOLD_GOOGLE_ENABLED:-false}" \
  "${GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID:-}" \
  "${GOTRUE_EXTERNAL_GOOGLE_SECRET:-}")"

export GOTRUE_EXTERNAL_APPLE_ENABLED="$(provider_enabled \
  "${HOUSEHOLD_APPLE_ENABLED:-false}" \
  "${GOTRUE_EXTERNAL_APPLE_CLIENT_ID:-}" \
  "${GOTRUE_EXTERNAL_APPLE_SECRET:-}")"

exec "$@"
