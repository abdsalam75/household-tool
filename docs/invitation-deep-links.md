# Parent invitation deep links

The only parent invitation URL is:

```text
https://<invite-domain>/invitations/parent?token=<43-character-opaque-token>
```

The URL contains no household or member identifier. The mobile app stores only
the opaque token and sends it to the existing server-side acceptance flow.
The web fallback never validates the token or reports invitation state.

## Deployment values

Use separate public invitation hosts and native application identifiers for
staging and production. These values are public identifiers, but they must
still be supplied by the matching deployment rather than copied between
environments.

| Value | Mobile build | Invite-host deployment | Requirement |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_APP_ENV` | yes | no | `staging` or `production` |
| `EXPO_PUBLIC_INVITATION_ORIGIN` | yes | Pages build and verification command | Exact HTTPS origin, with no path, query, fragment, credentials, or port |
| `IOS_BUNDLE_IDENTIFIER` | yes | included within `IOS_APP_ID` | Bundle ID registered for this environment |
| `IOS_APP_ID` | no | Caddy or Pages in full iOS/Android mode | Apple application identifier: `<TEAM_ID>.<IOS_BUNDLE_IDENTIFIER>`; leave unset for Android-only Pages |
| `INVITATION_ANDROID_ONLY` | no | Pages build and verification command | Set to `true` for Android-only output; omit or set `false` for full iOS/Android output |
| `ANDROID_PACKAGE_NAME` | yes | Caddy or Pages | Android application ID for this environment |
| `ANDROID_CERT_SHA256` | no | Caddy or Pages | SHA-256 fingerprint of the certificate that signs this environment's installed build |
| `INVITE_DOMAIN` | no | Caddy only | Hostname from `EXPO_PUBLIC_INVITATION_ORIGIN`, without `https://` |

`ANDROID_CERT_SHA256` comes from the staging signing certificate or the Play
App Signing page, as applicable. It is a certificate fingerprint, not a
private key. Apple team IDs, application IDs, package names, and certificate
fingerprints are not signing secrets. Keep Apple credentials, Android
keystores, private keys, access tokens, and service-role keys outside Git.

The mobile build config preserves the `household-tool-local`,
`household-tool-staging`, and `household-tool` custom schemes for development
and authentication callbacks. Only staging and production invitation origins
should be associated with distributable builds.

For an installable Android staging build, the EAS `preview` profile sets
`EXPO_PUBLIC_APP_ENV=staging`, the staging Pages invitation origin, and
`ANDROID_PACKAGE_NAME=com.householdtool.mobile.staging`. Its Android
`buildType` is `apk` and its distribution is `internal`. Run
`eas build --profile preview --platform android` to build only Android; no iOS
build is requested. The EAS project ID is in `app.json`. The APK is signed by
EAS, so obtain the SHA-256 fingerprint for the certificate used by the
installed APK and use that exact fingerprint with the same package name in
the Pages `ANDROID_CERT_SHA256` and `ANDROID_PACKAGE_NAME` values. Do not add
the keystore or signing credentials to Git. A failed EAS API request does not
produce an APK; retry the build and record its completed artifact before
claiming signed-build or device evidence.

## Deploy the invitation origin with Cloudflare Pages

The supplied staging origin is
`https://household-tool-invitations.pages.dev`. Configure the matching staging
mobile build with that exact `EXPO_PUBLIC_INVITATION_ORIGIN`. The production
origin has not been supplied; configure it separately when known. A Pages
hostname existing does not establish that the site or association files are
deployed.

For the staging Pages project connected to this Git repository, set the root
directory to the repository root, framework preset to None, build command to
`npm run build:invitation-pages`, and build output directory to
`dist/invitation-pages`. Set these public build environment values in the
Pages project to the identifiers of the matching staging build:

- `EXPO_PUBLIC_INVITATION_ORIGIN=https://household-tool-invitations.pages.dev`
- `INVITATION_ANDROID_ONLY=true` — explicitly deploy Android-only association
  output while the registered Apple application ID is unavailable.
- `ANDROID_PACKAGE_NAME` — installed staging Android package identifier.
- `ANDROID_CERT_SHA256` — SHA-256 fingerprint of the certificate signing that
  installed build, as 32 colon-separated hexadecimal bytes.

Leave `IOS_APP_ID` unset in Android-only mode; the builder rejects a supplied
value instead of accepting a fabricated identifier. It writes only
`/.well-known/assetlinks.json` under `.well-known` and omits the AASA header
rule. To enable iOS later, remove `INVITATION_ANDROID_ONLY` (or set it to
`false`) and supply the real registered `IOS_APP_ID`. That full mode still
requires the Apple ID and writes both association files. The build fails if
any required value is absent or malformed. Both modes write an explicit
`invitations/parent.html` asset for the extensionless canonical path and the
same generic `index.html` fallback. There is no
`404.html`, so Pages' single-page-app fallback serves that generic page for
unmatched paths. The generated `_headers` sets `Content-Type:
application/json` on generated association paths and `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, and a restrictive content security policy on
all paths. No redirect rules, Pages Functions, token parsing, or invitation
lookup are involved. [Cloudflare's serving rules](https://developers.cloudflare.com/pages/configuration/serving-pages/)
describe the extensionless route and unmatched-path behavior; the live
verifier below must establish actual HTTP responses after deployment.

Use a separate Pages project and matching environment values for production.
Do not copy staging identifiers or a fingerprint into production merely to
make a build succeed. A native rebuild and reinstall is required after
changing the associated domain, intent filter, bundle/package ID, or signing
identity.

## Deploy the invitation origin with Caddy

1. Point `INVITE_DOMAIN` DNS at the Caddy deployment and ensure TCP 443 is
   publicly reachable. Do not place a redirecting CDN rule in front of the two
   `/.well-known/` paths.
2. Supply the four invite-host Caddy values (`INVITE_DOMAIN`, `IOS_APP_ID`,
   `ANDROID_PACKAGE_NAME`, and `ANDROID_CERT_SHA256`) in the same protected
   deployment environment that supplies `PROXY_DOMAIN`. The Caddy overlay in
   `infra/supabase/docker-compose.caddy.yml` passes them to the tracked
   `Caddyfile`.
3. Deploy or reload Caddy. It obtains the HTTPS certificate and serves both
   association documents directly with `application/json` and
   `Cache-Control: no-store`. All other paths receive the same generic HTML
   fallback with no external assets and `Referrer-Policy: no-referrer`.
4. Set the matching mobile values before creating the native staging or
   production build. A native rebuild and reinstall is required after changing
   associated domains, intent filters, bundle ID, or package name.

Do not reuse generated association responses between environments. Caddy
substitutes the values when it loads its configuration; Pages does so during
the build. `no-store` prevents a browser from retaining one environment's
identifiers for another.

## Automated staging verification

First run the repository checks:

```sh
npm run typecheck
npm run format:check
npm run lint
npm test
```

Then export the staging values in the current shell and verify the live host:

```sh
export EXPO_PUBLIC_INVITATION_ORIGIN=https://<staging-invite-domain>
export IOS_APP_ID=<APPLE_TEAM_ID>.<STAGING_IOS_BUNDLE_IDENTIFIER>
export ANDROID_PACKAGE_NAME=<STAGING_ANDROID_PACKAGE_NAME>
export ANDROID_CERT_SHA256=<STAGING_SIGNING_CERTIFICATE_SHA256>
npm run verify:invitation-deployment
```

The verifier does not follow redirects. It checks a direct HTTP 200,
`application/json`, and `no-store` for both association files; validates their
application identifiers, signing fingerprint, exact path, and 43-character
query matcher; and checks the valid, missing-token, malformed-token,
extra-parameter, and unsupported-path browser responses for generic,
non-reflecting content. Successful output names each check and its response
properties without printing a test token or token-bearing URL. The verifier's
mocked test output is not deployment evidence; capture its output only when run
against the real staging origin with matching deployment values.

For an Android-only Pages deployment, set `INVITATION_ANDROID_ONLY=true` in
the verification shell as well, leave `IOS_APP_ID` unset, and supply the same
origin, Android package, and signing fingerprint. The verifier then checks
assetlinks and all generic fallback cases without requesting AASA. This is
Android-only deployment evidence; the issue's iOS acceptance criteria still
require the real Apple ID, AASA response, signed iOS build, and physical iPhone
result when iOS is enabled.

## Physical-device staging checklist

Use a newly installed staging build whose identifiers exactly match the live
staging association files. Use a fresh 43-character test token created through
the normal invitation flow; do not paste the token into logs or screenshots.

### iPhone

- Confirm the signed app has the Associated Domains entitlement containing
  only `applinks:<staging-invite-domain>` for this feature.
- Send the canonical URL to the device in Messages or Mail and tap it. Do not
  paste it into Safari's address bar; that does not exercise a normal Universal
  Link tap.
- Confirm the staging app opens and shows the existing sign-in or generic
  parent-invitation confirmation flow. Confirm no token, household ID, member
  ID, or invitation preview appears.
- Cancel rather than accept unless this test is specifically authorized to
  change staging membership.

Record the device model, iOS version, build identifier/version, test time, and
PASS/FAIL. Never record the URL or token.

### Android

- Install the matching staging build, connect the device to the internet, and
  wait for link verification. Reset and request verification when needed:

  ```sh
  adb shell pm set-app-links --package <STAGING_ANDROID_PACKAGE_NAME> 0 all
  adb shell pm verify-app-links --re-verify <STAGING_ANDROID_PACKAGE_NAME>
  adb shell pm get-app-links <STAGING_ANDROID_PACKAGE_NAME>
  ```

- Confirm the staging domain reports `verified` and link handling is enabled
  for the app in system settings.
- Send the canonical URL to the device and tap it from a supported browser or
  messaging app. Confirm the app opens into the same safe sign-in/confirmation
  flow and does not show the token as household data.
- Cancel rather than accept unless the membership change is authorized.

Record the device model, Android version, build identifier/version,
verification result, test time, and PASS/FAIL. Never record the URL or token.

### Browser fallback and invalid-link safety

- On iOS or Android without Household Tool installed, tap the canonical URL.
  Confirm the generic “Install or open Household Tool” page appears and does
  not name a household, member, invitation status, or token and does not claim
  the invitation is valid.
- Repeat with a missing token, a short or tampered token, an extra query
  parameter, a fragment, and an unsupported path. Confirm every case stays
  generic and reveals no invitation state. On installed devices, a malformed
  URL that the OS still routes may instead show the app's existing generic
  invalid-invitation message. A URL fragment is not sent in an HTTP request,
  so verify that case in the browser or app on the device.
- Record device/browser versions and PASS/FAIL without recording any token.

Physical iOS and Android results are staging release evidence and cannot be
substituted by simulator, Expo Go, or unit-test results.
