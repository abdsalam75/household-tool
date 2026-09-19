# Issue #53 Android staging evidence

Current status: NOT RUN for physical-device verification. Do not mark PASS
until a newly installed signed staging APK has been tested on a physical
Android device. The live deployment verifier still reports FAIL because the
staging host serves the parent-only association. The new staging-specific
build command generates the required child rule locally; this output has not
been deployed.

Last live check: 2026-09-19 19:56 UTC. The local Pages build passed. The live
verifier confirmed direct HTTP 200 generic no-store, no-referrer HTML for
parent and child valid-shaped, missing-token, malformed-token, extra-query,
and fragment requests, plus the unsupported path. The live Android association
failed the new child-component check. Overall live verification: FAIL.

At that check, the local `master` branch contained the issue implementation
commits, but GitHub's `master` had not received them. The Cloudflare account
owner must confirm the existing Pages project's deployment method and publish
the matching staging artifact. Follow the exact Git-integrated or Direct Upload
steps in `docs/invitation-deep-links.md`, then rerun the live verifier. A local
build result is not evidence of a live association update.

The EAS preview build was attempted from committed source with the existing
remote Android keystore. The EAS API request failed during project upload,
then failed again on retry. No build identifier or APK was produced. Retry the
build when the EAS API request succeeds; do not infer a signed-build PASS from
the configured keystore alone.

| Field | Redacted result to record |
| --- | --- |
| Verification date/time with timezone | Pending |
| Device model | Pending |
| Android version | Pending |
| EAS build identifier and app version | Pending |
| Package name | `com.householdtool.mobile.staging` |
| Signing certificate fingerprint matches deployed association | Pending PASS/FAIL |
| Domain verification from `adb shell pm get-app-links` | Pending PASS/FAIL; record only domain and state |
| Supported links enabled in Android settings | Pending PASS/FAIL |
| Messaging-app tap opens generic child entry | Pending PASS/FAIL |
| No invitation, household/member, or token disclosure | Pending PASS/FAIL |
| Valid-shaped, missing, malformed, extra-query, fragment, and unsupported-path browser fallbacks | Live HTTP checks PASS; physical browser check Pending PASS/FAIL for each case |
| Live `npm run verify:invitation-deployment` | FAIL: child association missing at current staging host |

Before testing, the Cloudflare account owner must deploy the generated Pages
output and run the live verifier with the staging public values in
`docs/invitation-deep-links.md`; the expected result is PASS for both
association rules and all 11 fallback cases. The EAS account owner must obtain
a completed `preview` APK and its build identifier; the earlier upload failures
produced none. On a physical device, install that APK fresh, authorize USB
debugging, and check the model and OS version with `adb shell getprop`. Request
domain verification with `adb shell pm verify-app-links --re-verify
com.householdtool.mobile.staging`, then inspect `adb shell pm get-app-links
com.householdtool.mobile.staging`. Confirm the domain says `verified` and
supported links are enabled in Android settings. Tap a test child invitation
from a messaging app, then check the generic entry screen and browser fallback
cases. Record PASS or FAIL for each row and the date/time. Do not copy command
output that contains a token or URL.

Keep raw tokens, token-bearing URLs, household/member data, signing material,
credentials, and private keys out of this file, screenshots, and issue comments.
