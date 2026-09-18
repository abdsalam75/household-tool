# Mobile parent Auth configuration

The mobile client consumes the public Auth contract established in issue #6.
It uses only a Supabase project URL and public anon key; service-role keys,
provider secrets, SMTP credentials, passwords, authorization codes, and session
tokens must never be put in an Expo environment file or source control.

Copy `.env.example` to an ignored `.env.local` and select the matching
environment. `EXPO_PUBLIC_SUPABASE_URL` is the origin before `/auth/v1` (for
example, the #6 local `API_EXTERNAL_URL=http://localhost:8000/auth/v1` maps to
`EXPO_PUBLIC_SUPABASE_URL=http://localhost:8000`). Obtain the public anon key
from the same environment's protected deployment configuration.

| `EXPO_PUBLIC_APP_ENV` | Public Supabase origin             | App return destination from #6           |
| --------------------- | ---------------------------------- | ---------------------------------------- |
| `local`               | `http://localhost:8000`            | `household-tool-local://auth/callback`   |
| `staging`             | `https://<staging-auth-domain>`    | `household-tool-staging://auth/callback` |
| `production`          | `https://<production-auth-domain>` | `household-tool://auth/callback`         |

Staging and production require HTTPS. The client derives the return destination
from `EXPO_PUBLIC_APP_ENV`; it does not accept a caller-supplied callback. The
provider-console callback remains the separate `${API_EXTERNAL_URL}/callback`
route documented in `infra/supabase/AUTH.md`. Google and Apple browser flows
must return to the app destination above with a PKCE authorization code, which
the app exchanges through Supabase Auth.

Session data uses Expo SecureStore under one fixed key. There is no AsyncStorage,
file, debug-state, or plaintext fallback. Changing the native plugin list
requires rebuilding the Expo development client before device testing.

Focused checks need no real provider account:

```sh
npm test -- __tests__/parent-auth-service.test.ts __tests__/parent-auth-view.test.tsx __tests__/auth-config.test.ts __tests__/secure-storage.test.ts --runInBand
```
