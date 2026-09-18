/* global __dirname */

import fs from "node:fs";
import path from "node:path";

import createExpoConfig from "../app.config";
import appJson from "../app.json";
import { readInvitationLinkConfig } from "../src/household/invitationLinkConfig";

const baseConfig = appJson.expo;
const { buildExpoConfig, nativeInvitationConfig } = createExpoConfig;

const root = path.join(__dirname, "..");
const caddyfile = fs.readFileSync(
  path.join(root, "infra/supabase/volumes/proxy/caddy/Caddyfile"),
  "utf8",
);
const tokenPattern = "?".repeat(43);

function deployedEnvironment(appEnvironment) {
  return {
    EXPO_PUBLIC_APP_ENV: appEnvironment,
    EXPO_PUBLIC_INVITATION_ORIGIN: `https://invite-${appEnvironment}.example.test`,
    IOS_BUNDLE_IDENTIFIER: `com.example.household.${appEnvironment}`,
    ANDROID_PACKAGE_NAME: `com.example.household.${appEnvironment}`,
  };
}

function associationJsonBodies() {
  return [
    ...caddyfile.matchAll(/respond <<JSON\n([\s\S]*?)\n\s+JSON 200/g),
  ].map(([, body]) =>
    JSON.parse(
      body
        .replace("{$IOS_APP_ID}", "TEAM123456.com.example.household.staging")
        .replace("{$ANDROID_PACKAGE_NAME}", "com.example.household.staging")
        .replace("{$ANDROID_CERT_SHA256}", Array(32).fill("AA").join(":")),
    ),
  );
}

describe("invitation deep-link configuration", () => {
  it("keeps custom schemes and excludes local hosts from native web association", () => {
    const config = buildExpoConfig(baseConfig, {
      EXPO_PUBLIC_APP_ENV: "local",
      EXPO_PUBLIC_INVITATION_ORIGIN: "http://localhost",
    });

    expect(config.scheme).toEqual([
      "household-tool-local",
      "household-tool-staging",
      "household-tool",
    ]);
    expect(config.ios).toMatchObject({
      bundleIdentifier: "com.householdtool.mobile.local",
    });
    expect(config.ios.associatedDomains).toBeUndefined();
    expect(config.android).toMatchObject({
      package: "com.householdtool.mobile.local",
    });
    expect(config.android.intentFilters).toBeUndefined();
  });

  it.each(["staging", "production"])(
    "declares matching native identifiers and HTTPS association for %s",
    (appEnvironment) => {
      const environment = deployedEnvironment(appEnvironment);
      const native = nativeInvitationConfig(environment);
      const config = buildExpoConfig(baseConfig, environment);

      expect(native).toMatchObject({
        appEnvironment,
        bundleIdentifier: environment.IOS_BUNDLE_IDENTIFIER,
        packageName: environment.ANDROID_PACKAGE_NAME,
      });
      expect(config.scheme).toEqual([
        "household-tool-local",
        "household-tool-staging",
        "household-tool",
      ]);
      expect(config.ios).toMatchObject({
        bundleIdentifier: environment.IOS_BUNDLE_IDENTIFIER,
        associatedDomains: [`applinks:${native.inviteHost}`],
      });
      expect(config.android).toMatchObject({
        package: environment.ANDROID_PACKAGE_NAME,
        intentFilters: [
          {
            action: "VIEW",
            autoVerify: true,
            category: ["BROWSABLE", "DEFAULT"],
            data: [
              {
                scheme: "https",
                host: native.inviteHost,
                path: "/invitations/parent",
              },
            ],
          },
        ],
      });
    },
  );

  it("builds only the canonical token URL and rejects unsafe deployed origins", () => {
    expect(
      readInvitationLinkConfig({
        EXPO_PUBLIC_APP_ENV: "staging",
        EXPO_PUBLIC_INVITATION_ORIGIN: "https://invite.example.test",
      }),
    ).toEqual({
      invitationOrigin: "https://invite.example.test",
      parentInvitationUrl: "https://invite.example.test/invitations/parent",
    });

    for (const origin of [
      "http://invite.example.test",
      "https://user:secret@invite.example.test",
      "https://invite.example.test/extra",
      "https://invite.example.test?environment=production",
    ]) {
      expect(() =>
        readInvitationLinkConfig({
          EXPO_PUBLIC_APP_ENV: "production",
          EXPO_PUBLIC_INVITATION_ORIGIN: origin,
        }),
      ).toThrow(/not allowed/);
    }
  });

  it("serves valid, environment-substituted association JSON scoped to the canonical URL", () => {
    const [aasa, assetlinks] = associationJsonBodies();
    expect(aasa.applinks.details).toEqual([
      {
        appIDs: ["TEAM123456.com.example.household.staging"],
        components: [
          expect.objectContaining({
            "/": "/invitations/parent",
            "?": { token: tokenPattern },
          }),
        ],
      },
    ]);
    expect(assetlinks).toEqual([
      expect.objectContaining({
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.example.household.staging",
          sha256_cert_fingerprints: [Array(32).fill("AA").join(":")],
        },
        relation_extensions: {
          "delegate_permission/common.handle_all_urls": {
            dynamic_app_link_components: [
              {
                "/": "/invitations/parent",
                "?": { token: tokenPattern },
              },
              { "/": "*", exclude: true },
            ],
          },
        },
      }),
    ]);
    expect(caddyfile).toMatch(
      /header Content-Type "application\/json"[\s\S]*?header Cache-Control "no-store, max-age=0"/,
    );
  });

  it("uses a generic, non-reflecting fallback for unavailable and invalid links", () => {
    const [, body] =
      caddyfile.match(/respond <<HTML\n([\s\S]*?)\n\s+HTML 200/) ?? [];
    expect(body).toMatch(/Install or open Household Tool/);
    expect(body).not.toMatch(/\{http\.request|token=|member|invite-status/i);
    expect(caddyfile).toMatch(/header Referrer-Policy "no-referrer"/);
    expect(caddyfile).toMatch(
      /header Content-Security-Policy "default-src 'none';/,
    );
  });
});
