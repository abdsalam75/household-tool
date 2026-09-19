/* global console, process, URL */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// These are public staging association identifiers, not signing credentials.
const environment = {
  ...process.env,
  EXPO_PUBLIC_INVITATION_ORIGIN: "https://household-tool-invitations.pages.dev",
  INVITATION_ANDROID_ONLY: "true",
  ANDROID_PACKAGE_NAME: "com.householdtool.mobile.staging",
  ANDROID_CERT_SHA256:
    "F8:80:93:DA:99:49:4A:9E:7F:86:02:E4:4E:08:7C:4F:BC:B9:1E:B1:E4:54:49:86:6A:09:29:F9:A9:55:C4:F3",
};
delete environment.IOS_APP_ID;

const builder = fileURLToPath(
  new URL("./build-invitation-pages.mjs", import.meta.url),
);
const result = spawnSync(process.execPath, [builder], {
  env: environment,
  stdio: "inherit",
});
if (result.error) {
  console.error("Could not start the staging invitation Pages build");
}
process.exitCode = result.status ?? 1;
