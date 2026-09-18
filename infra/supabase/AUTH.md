# Parent Auth operator guide

This guide configures the pinned `supabase/gotrue:v2.196.0` service for parent
email/password, Google, and Apple authentication. It does not implement the
mobile sign-in/session flow. Keep each environment's ignored `.env` or managed
runtime configuration separate; never reuse OAuth applications, mobile
identifiers, SMTP credentials, or Auth domains between local, staging, and
production.

## Runtime contract

| Capability | Runtime variables | Normal default |
| --- | --- | --- |
| Email/password | `ENABLE_EMAIL_SIGNUP`, `ENABLE_EMAIL_AUTOCONFIRM` | enabled; auto-confirm disabled |
| External SMTP | `SMTP_ADMIN_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER_NAME` | values supplied outside Git |
| Google | `GOOGLE_ENABLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_SECRET`, `GOOGLE_REDIRECT_URI` | disabled; ID/secret/callback override empty |
| Apple | `APPLE_ENABLED`, `APPLE_CLIENT_ID`, `APPLE_SECRET`, `APPLE_BUNDLE_ID`, `APPLE_REDIRECT_URI` | disabled; IDs/secret/callback override empty |
| Post-auth routing | `SITE_URL`, `ADDITIONAL_REDIRECT_URLS` | environment-specific allow-list |
| Unsupported product methods | `ENABLE_ANONYMOUS_USERS`, `ENABLE_PHONE_SIGNUP`, `ENABLE_PHONE_AUTOCONFIRM` | disabled |

When the provider-specific callback override is empty, Compose constructs both
provider callbacks as `${API_EXTERNAL_URL}/callback`. If an environment must
set `GOOGLE_REDIRECT_URI` or `APPLE_REDIRECT_URI` explicitly, it must set the
same exact value; the focused verifier checks this invariant.
For Apple, `APPLE_BUNDLE_ID` is passed to the pinned Auth image as
`GOTRUE_EXTERNAL_IOS_BUNDLE_ID`. Set a social provider's enable flag to `true`
only in the same runtime configuration that supplies its client ID and secret.

The tracked template contains no usable credential. Generate an ignored local
file with `./scripts/create-supabase-env.sh`; inject staging/production values
from their respective secret manager. A real SMTP service must be external to
this Compose stack. Do not commit or print SMTP credentials, OAuth secrets,
test-account passwords, Apple `.p8` material, client-secret JWTs, or Auth
access/refresh tokens.

## Redirect matrix

Values in angle brackets are deployment-time public names intentionally kept
outside Git. Resolve them to the named environment's value before entering a
provider console; do not copy the literal brackets.

| Environment | Public `API_EXTERNAL_URL` | Provider-console callback (exactly `${API_EXTERNAL_URL}/callback`) | `SITE_URL` | Every value in `ADDITIONAL_REDIRECT_URLS` | Transport | Credentials |
| --- | --- | --- | --- | --- | --- | --- |
| Local | `http://localhost:8000/auth/v1` | `http://localhost:8000/auth/v1/callback` | `household-tool-local://auth/callback` | `household-tool-local://auth/callback,household-tool-local://invite/*` | HTTP is permitted only on loopback; Apple console validation uses staging instead | local disposable Google application only; no reusable Apple secret |
| Staging | `https://<staging-auth-domain>/auth/v1` | `https://<staging-auth-domain>/auth/v1/callback` | `household-tool-staging://auth/callback` | `household-tool-staging://auth/callback,household-tool-staging://invite/*` | public HTTPS through Caddy; no downgrade | dedicated non-production Google client and Apple Services ID/key/secret |
| Production | `https://<production-auth-domain>/auth/v1` | `https://<production-auth-domain>/auth/v1/callback` | `household-tool://auth/callback` | `household-tool://auth/callback,household-tool://invite/*` | public HTTPS through Caddy; no downgrade | dedicated production Google client and Apple Services ID/key/secret |

The provider-console callback is the provider-to-Supabase return URL. It is
not the mobile destination. After Auth exchanges the provider code, Auth sends
the caller to `SITE_URL` or to a matching `ADDITIONAL_REDIRECT_URLS` entry.
Auth replaces a caller-supplied destination outside that allow-list with
`SITE_URL`. The `invite/*` patterns only reserve the Auth return destination;
association files and browser fallback are delivered by issue #11.

Apple requires a registered public HTTPS website domain and return URL. Do not
register the insecure local callback with Apple. Use the dedicated staging
HTTPS domain and staging credential set for non-production Apple validation.

## Email/password and SMTP

Normal environments use `ENABLE_EMAIL_SIGNUP=true` and
`ENABLE_EMAIL_AUTOCONFIRM=false`; confirmation therefore depends on the
external SMTP values. Use a provider/account isolated per environment and set
all six `SMTP_*` values outside Git. Confirm sender-domain requirements with
that provider before inviting testers.

The focused verifier temporarily sets auto-confirm to `true` only in its
throwaway Compose project. It creates a random test parent, verifies the user
is confirmed, obtains a session with the correct random password, and verifies
an independently random incorrect password is rejected. It reports assertions
only and never prints the identity, passwords, or tokens:

```sh
./scripts/test-supabase-auth.sh
```

This disposable mode proves the backend password path; it does not waive SMTP
confirmation testing in staging.

## Google Cloud setup

Repeat these steps in a separate Google Cloud project/credential set for each
environment that enables Google:

1. Select or create the environment's Google Cloud project. Configure the
   OAuth consent screen/Google Auth Platform branding, contact information,
   requested `openid`, email, and profile scopes, and the intended Internal or
   External audience.
2. While the app has Testing publishing status, add every non-production
   tester under Audience > Test users. Google rejects unlisted users in this
   state.
3. Create an OAuth client with application type **Web application**. Put its
   client ID in `GOOGLE_CLIENT_ID` and its client secret in `GOOGLE_SECRET`.
4. Where the application uses a browser origin, add the environment's public
   HTTPS origin (scheme plus host, no path) under Authorized JavaScript
   origins. A backend-only/native flow does not invent an origin.
5. Add only that environment's provider-console callback from the redirect
   matrix under Authorized redirect URIs. It ends in `/auth/v1/callback`; it is
   not a mobile deep link.
6. After the values are in the protected runtime configuration, set
   `GOOGLE_ENABLED=true`, deploy/recreate Auth, inspect `/settings`, and run the
   real-provider initiation check below.

Do not put a Google client secret in a command line, tracked `.env`, ticket,
log, screenshot, or validation record.

## Apple Developer setup

Repeat these steps using separate staging and production identifiers and
credentials:

1. Record the Apple Developer **Team ID** that owns the environment's
   identifiers.
2. Create/select the native **App ID** (the bundle identifier) and enable the
   Sign in with Apple capability. Put the bundle identifier in
   `APPLE_BUNDLE_ID`.
3. Create a **Services ID** (the OAuth client ID), associate it with that App
   ID, and configure Sign in with Apple for it. Register the public Auth domain
   from the matrix without scheme/path and register the matching HTTPS
   `/auth/v1/callback` as its return URL.
4. Create a Sign in with Apple signing key, record its **Key ID**, and download
   the private `.p8` key once. Store that key only in the protected credential
   system. If it is lost or exposed, revoke it and create a replacement.
5. Generate the Apple client-secret JWT using the Team ID as issuer, the Key ID
   in the JWT header, the Services ID as subject, and
   `https://appleid.apple.com` as audience. Put only the generated JWT in
   `APPLE_SECRET`. Apple secrets expire in at most six months: the deployment
   owner must schedule rotation before expiry, generate a new JWT from the
   protected `.p8`, deploy it, rerun validation, and record the new expiry in
   the secret manager.
6. Put the Services ID in `APPLE_CLIENT_ID`. When web OAuth and native token
   sign-in share Auth, use a comma-separated list with the **Services ID first**
   and native App ID/bundle ID afterward. The first value drives web OAuth;
   later values are accepted token audiences.
7. Set `APPLE_ENABLED=true`, recreate Auth, inspect `/settings`, and run the
   real-provider initiation check.

The `.p8` key and generated Apple secret must never be stored in Git. Key ID
and Team ID are inputs to secret generation, not replacements for
`APPLE_CLIENT_ID`, `APPLE_SECRET`, or `APPLE_BUNDLE_ID`.

## Verification commands

Run the focused static/configuration checks and disposable backend check from
the repository root:

```sh
npm test -- __tests__/supabase-auth.test.js
./scripts/test-supabase-auth.sh
```

For a deployed non-production provider, put the public non-secret URLs in the
shell and run the provider separately. The script neither accepts nor prints a
provider secret:

```sh
AUTH_PUBLIC_URL=https://<staging-auth-domain>/auth/v1 API_EXTERNAL_URL=https://<staging-auth-domain>/auth/v1 ./scripts/check-real-auth-provider.sh google
AUTH_PUBLIC_URL=https://<staging-auth-domain>/auth/v1 API_EXTERNAL_URL=https://<staging-auth-domain>/auth/v1 ./scripts/check-real-auth-provider.sh apple
```

These commands prove configuration exposure, expected authorization host, and
callback construction. To validate a real secret, complete one browser sign-in
with a dedicated non-production test account, confirm Auth returns only to a
matrix allow-listed mobile destination, then revoke the resulting test session.
Never enable shell tracing or copy browser URLs/tokens into the record.

Provider behavior and names follow Supabase's
[self-hosted OAuth](https://supabase.com/docs/guides/self-hosting/self-hosted-oauth),
[Google](https://supabase.com/docs/guides/auth/social-login/auth-google), and
[Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple)
guidance. The iOS bundle mapping is documented in Supabase's
[self-hosted configuration reference](https://github.com/supabase/supabase/blob/master/docker/CONFIG.md).
