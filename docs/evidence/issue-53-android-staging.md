# Issue #53 Android staging evidence

Current status: NOT RUN for physical-device verification. Do not mark PASS
until a newly installed signed staging APK has been tested on a physical
Android device. The live deployment verifier currently reports FAIL because
the staging host still serves the parent-only association.

Last live check: 2026-09-19 19:45 UTC. The local Pages build passed. The live
verifier confirmed direct HTTP 200 generic no-store, no-referrer HTML for
parent and child valid-shaped, missing-token, malformed-token, extra-query,
and fragment requests, plus the unsupported path. The live Android association
failed the new child-component check. Overall live verification: FAIL.

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

Before testing, deploy the generated Pages output and run the live verifier
with the staging public values in `docs/invitation-deep-links.md`. Obtain a
completed EAS preview APK through the owner's account, install it fresh on the
physical device, and authorize USB debugging. Check the device model and OS
version with `adb shell getprop`, request domain verification with `adb shell pm
verify-app-links --re-verify com.householdtool.mobile.staging`, and inspect
`adb shell pm get-app-links com.householdtool.mobile.staging`. Confirm the
domain says `verified` and supported links are enabled in Android settings.
Tap a test child invitation from a messaging app, then check the generic entry
screen and the browser fallback cases. Record PASS or FAIL for each row and
the date/time. Do not copy command output that contains a token or URL.

Keep raw tokens, token-bearing URLs, household/member data, signing material,
credentials, and private keys out of this file, screenshots, and issue comments.
