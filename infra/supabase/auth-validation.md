# Parent Auth validation record

Date: 2026-09-18

Environment: isolated local Compose project `household-auth-check`

Auth image: `supabase/gotrue:v2.196.0`

Callback used: `http://127.0.0.1:54329/auth/v1/callback`

Command: `./scripts/test-supabase-auth.sh`

Only disposable placeholder provider values and randomly generated local
credentials were used. Output was assertion-only; account credentials,
provider secrets, and access/refresh tokens were not printed or retained.

## Email/password

- **PASS — configuration:** public settings reported email enabled, phone and
  anonymous sign-in disabled, and normal email auto-confirm disabled.
- **PASS — disposable verification mode:** the verifier enabled auto-confirm
  only for the throwaway Auth container, created and confirmed a random test
  parent, obtained a session with the correct password, and rejected an
  incorrect password. It asserted token presence without printing token or
  credential values.
- **BLOCKED — staging SMTP confirmation:** no external non-production SMTP
  account/sender is available in this repository. Prerequisite: provision the
  staging SMTP sender and protected `SMTP_*` runtime values. Rerun checklist:
  deploy with `ENABLE_EMAIL_AUTOCONFIRM=false`, register a fresh test parent,
  follow the received confirmation link, sign in once correctly and once with
  an incorrect password, revoke the session, and record only redacted outcomes.

## Google

- **PASS — local configuration/initiation:** with disposable runtime values,
  public settings reported Google enabled; `/authorize?provider=google`
  redirected to `accounts.google.com`; the provider `redirect_uri` was exactly
  the callback above. An allow-listed mobile destination was retained, while a
  caller-supplied outside destination was stored as `SITE_URL`, not as the
  final referrer.
- **BLOCKED — provider-console/browser completion:** a real dedicated
  non-production Google Web OAuth client and test user are not available in
  the repository. Prerequisite: complete the Google Cloud checklist in
  `AUTH.md`, inject its client ID/secret through protected staging runtime
  configuration, and add the tester. Rerun initiation exactly with:
  `AUTH_PUBLIC_URL=https://<staging-auth-domain>/auth/v1 API_EXTERNAL_URL=https://<staging-auth-domain>/auth/v1 ./scripts/check-real-auth-provider.sh google`.
  Then complete one browser sign-in and record only the redacted result.

## Apple

- **PASS — local configuration/initiation:** with disposable runtime values,
  public settings reported Apple enabled; `/authorize?provider=apple`
  redirected to `appleid.apple.com`; the provider `redirect_uri` was exactly
  the callback above. An allow-listed mobile destination was retained, while a
  caller-supplied outside destination was stored as `SITE_URL`, not as the
  final referrer.
- **BLOCKED — provider-console/browser completion:** no non-production Apple
  Team/App ID/Services ID, registered HTTPS staging domain, signing key, or
  generated client-secret JWT is available in the repository. Prerequisite:
  complete the Apple Developer checklist in `AUTH.md`, inject the generated
  secret and IDs through protected staging runtime configuration, and deploy
  the public HTTPS endpoint. Rerun initiation exactly with:
  `AUTH_PUBLIC_URL=https://<staging-auth-domain>/auth/v1 API_EXTERNAL_URL=https://<staging-auth-domain>/auth/v1 ./scripts/check-real-auth-provider.sh apple`.
  Then complete one browser sign-in and record only the redacted result and
  secret-expiry/rotation ownership.
