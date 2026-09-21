# Issue #53 Android staging evidence

Current status: NOT RUN for physical-device verification. Do not mark PASS
until a newly installed signed staging APK has been tested on a physical
Android device. The corrected staging Pages artifact is now deployed and the
live verifier passes; the physical APK/device gates remain open.

Last live check: 2026-09-21 06:34 UTC. The live verifier confirmed direct HTTP
200 JSON/no-store association data with the matching staging package and
certificate fingerprint, exact parent and child components, and direct HTTP
200 generic no-store/no-referrer HTML for parent and child valid-shaped,
missing-token, malformed-token, extra-query, and fragment requests, plus the
unsupported path. Overall live verification: PASS.

The implementation commit `9177a2901c60d886c7891e56c4109c85d5c2e8cc` is now
published on GitHub and the existing Cloudflare Pages project serves the
matching artifact. The live verifier is the authoritative deployment check;
a local build alone is not deployment evidence.

The current EAS preview build was accepted and is in progress:
`c706c880-69bd-4e7d-916e-16dac0171c61`. It uses the existing remote Android
keystore and must finish before an APK or signed-build result can be recorded.

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
| Live `npm run verify:invitation-deployment` | PASS: association and all 11 fallback checks passed on 2026-09-21 UTC |

Before testing, wait for the EAS build to finish and download its APK. On a
physical device, install that APK fresh, authorize USB debugging, and check
the model and OS version with `adb shell getprop`. Request domain verification
with `adb shell pm verify-app-links --re-verify
com.householdtool.mobile.staging`, then inspect `adb shell pm get-app-links
com.householdtool.mobile.staging`. Confirm the domain says `verified` and
supported links are enabled in Android settings. Tap a test child invitation
from a messaging app, then check the generic entry screen and browser fallback
cases. Record PASS or FAIL for each row and the date/time. Do not copy command
output that contains a token or URL.

Keep raw tokens, token-bearing URLs, household/member data, signing material,
credentials, and private keys out of this file, screenshots, and issue comments.
