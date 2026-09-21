# Invitation deep links

The only parent invitation URL is:

```text
https://<invite-domain>/invitations/parent?token=<43-character-opaque-token>
```

The URL contains no household or member identifier. The mobile app stores only
the opaque token and sends it to the existing server-side acceptance flow.
The web fallback never validates the token or reports invitation state.

Android staging also supports the canonical child invitation URL:

```text
https://household-tool-invitations.pages.dev/invitations/child?token=<43-character-opaque-token>
```

The staging app checks the exact origin, child path, one URL-safe token value,
and absence of fragments or extra parameters before showing a generic child
entry screen. It never validates, consumes, stores, or previews a child
invitation. Child validation and PIN setup belong to #14. iOS staging child
association and device testing belong to #54.

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

The dedicated `npm run build:invitation-pages:staging` command supplies the
public staging origin, `INVITATION_ANDROID_ONLY=true`, package
`com.householdtool.mobile.staging`, and the staging certificate fingerprint
listed in the verification command below. It clears any inherited `IOS_APP_ID`
and produces `dist/invitation-pages`. Run it locally and inspect the generated
`dist/invitation-pages/.well-known/assetlinks.json` before deployment. It must
contain the parent component, child fragment exclusion, exact child token
component, and final catch-all exclusion in that order. Both invitation HTML
files must contain only the generic fallback. The generic builder
`npm run build:invitation-pages` remains available for other environments and
requires their matching public environment values.

For an existing Git-integrated staging Pages project, the Cloudflare account
owner must check that the connected repository is `abdsalam75/household-tool`,
the production branch is the intended branch, automatic production deployments
are enabled, the root directory is the repository root, framework preset is
None, build command is `npm run build:invitation-pages:staging`, and build output
directory is `dist/invitation-pages`. Then push the committed issue work to that
branch and wait for its successful production deployment. A local commit does
not update the public site. If this project uses Direct Upload instead, the
owner can run the same staging build locally and use the existing project's
Create a new deployment action to upload the `dist/invitation-pages` folder to
production. Do not create a second Pages project for the same hostname. These
paths follow Cloudflare's [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/),
[build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/),
and [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
documentation.

After the deployment, run the live verifier below. Expect every association and
fallback check to PASS; a missing child component means the public deployment
is still stale or the wrong build command/output directory was used. In the
Pages dashboard, compare the production deployment commit or upload time with
the intended artifact and inspect its build log. If a deployment breaks the
site, the owner can restore a prior successful production deployment from the
Deployments menu using Cloudflare's [rollback procedure](https://developers.cloudflare.com/pages/configuration/rollbacks/).

The staging command writes only
`/.well-known/assetlinks.json` under `.well-known` and omits the AASA header
rule. To enable iOS later, use the generic builder with
`INVITATION_ANDROID_ONLY=false` and the real registered `IOS_APP_ID`, after
#54 supplies its child association. That full mode writes both association
files. The build fails if
any required value is absent or malformed. Both modes write an explicit
`invitations/parent.html` and `invitations/child.html` assets for the two
extensionless paths and the same generic `index.html` fallback. The Android
association adds the child path and excludes child URL fragments on Android 15+
when dynamic App Links are supported. The AASA remains parent-only pending #54.
There is no
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
`application/json`, and `no-store` for the required association files; validates
their application identifiers, signing fingerprint, exact path components,
43-character query matcher, and Android child-fragment exclusion. It checks
valid-shaped, missing-token, malformed-token, extra-parameter, and fragment
browser responses for both paths, plus an unsupported path, for generic,
non-reflecting content. Successful output names each check and its response
properties without printing a test token or token-bearing URL. The verifier's
mocked test output is not deployment evidence; capture its output only when run
against the real staging origin with matching deployment values.

For this Android-only staging deployment, use the matching public identifiers:

Copy each command as one physical shell line and press Enter only at the end
of that line. Terminal display wrapping is harmless, but inserting Enter
inside the URL or certificate fingerprint truncates the value and makes the
remaining text look like a command. The `curl` check should likewise be one
line, for example: `curl -i 'https://household-tool-invitations.pages.dev/.well-known/assetlinks.json'`.

If a terminal or clipboard keeps inserting breaks into long values, construct
the staging values from short pieces instead:

```sh
unset EXPO_PUBLIC_INVITATION_ORIGIN INVITATION_ANDROID_ONLY IOS_APP_ID ANDROID_PACKAGE_NAME ANDROID_CERT_SHA256
origin_scheme='https://'
origin_host='household-tool-invitations.pages.dev'
export EXPO_PUBLIC_INVITATION_ORIGIN="${origin_scheme}${origin_host}"
export INVITATION_ANDROID_ONLY='true'
unset IOS_APP_ID
export ANDROID_PACKAGE_NAME='com.householdtool.mobile.staging'
fp_a='F8:80:93:DA:99:49:4A:9E'
fp_b='7F:86:02:E4:4E:08:7C:4F'
fp_c='BC:B9:1E:B1:E4:54:49:86'
fp_d='6A:09:29:F9:A9:55:C4:F3'
export ANDROID_CERT_SHA256="${fp_a}:${fp_b}:${fp_c}:${fp_d}"
npm run verify:invitation-deployment
```

```sh
export EXPO_PUBLIC_INVITATION_ORIGIN=https://household-tool-invitations.pages.dev
export INVITATION_ANDROID_ONLY=true
unset IOS_APP_ID
export ANDROID_PACKAGE_NAME=com.householdtool.mobile.staging
export ANDROID_CERT_SHA256=F8:80:93:DA:99:49:4A:9E:7F:86:02:E4:4E:08:7C:4F:BC:B9:1E:B1:E4:54:49:86:6A:09:29:F9:A9:55:C4:F3
npm run build:invitation-pages:staging
npm run verify:invitation-deployment
```

The build writes `dist/invitation-pages`; deploy that output through the
existing Cloudflare Pages project, then run the live verifier. A local build
or mocked verifier result is not live deployment evidence. The Android-only
verifier does not request AASA. iOS staging work is tracked in #54.

Android's static path filters ignore query parameters, and Android versions
before 15 ignore dynamic query and fragment rules. On Android 15+, a dynamic
query dictionary may match a URL with extra parameters. Therefore the OS may
launch the app for a malformed URL even with the narrow path filters. The app
checks the complete canonical child URL and shows only a generic invalid-link
message for a malformed child URL. This platform limit prevents a claim that
every noncanonical URL is rejected by OS routing on all Android versions.
See [Android's dynamic App Links guidance](https://developer.android.com/training/app-links/configure-assetlinks)
and [URI relative filter matching](https://developer.android.com/guide/topics/manifest/uri-relative-filter-group-element).

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

- Build the `preview` profile with `npx eas-cli@latest build --profile preview
  --platform android` after authenticating to the owner's EAS account. Record
  the completed APK build identifier and version. Confirm the signed APK uses
  `com.householdtool.mobile.staging` and the association fingerprint above.
  EAS credentials and APK signing material must stay outside Git.
- Install the matching signed staging APK fresh on a physical Android device,
  connect the device to the internet, authorize USB debugging, and
  wait for link verification. Reset and request verification when needed:

  ```sh
  adb devices -l
  adb shell getprop ro.product.model
  adb shell getprop ro.build.version.release
  adb shell pm set-app-links --package <STAGING_ANDROID_PACKAGE_NAME> 0 all
  adb shell pm verify-app-links --re-verify <STAGING_ANDROID_PACKAGE_NAME>
  adb shell pm get-app-links <STAGING_ANDROID_PACKAGE_NAME>
  ```

- Confirm the staging domain reports `verified` and link handling is enabled
  for the app in system settings.
- Send the canonical child URL to the device and tap it from a messaging app.
  Confirm Household Tool opens at the generic child-invitation entry screen.
  The screen must not show invitation state, household/member data, or the
  token. A malformed child URL that Android still routes must show the generic
  invalid-invitation message.
- Cancel rather than accept unless the membership change is authorized.

Record the device model, Android version, build identifier/version, package,
verified-domain result, supported-links setting, test time, and PASS/FAIL in
the redacted [issue #53 evidence checklist](evidence/issue-53-android-staging.md).
Never record the URL or token.

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
