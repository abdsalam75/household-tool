/* global __dirname, process */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import createExpoConfig from "../app.config";
import appJson from "../app.json";
import easJson from "../eas.json";
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

function runVerifierWithMockResponses(badFallback = false, overrides = {}) {
  const [aasa, assetlinks] = associationJsonBodies();
  assetlinks[0].relation_extensions[
    "delegate_permission/common.handle_all_urls"
  ].dynamic_app_link_components.splice(
    1,
    0,
    {
      "/": "/invitations/child",
      "#": "?*",
      exclude: true,
    },
    {
      "/": "/invitations/child",
      "?": { token: tokenPattern },
    },
  );
  const preload = `
    const aasa = ${JSON.stringify(aasa)};
    const assetlinks = ${JSON.stringify(assetlinks)};
    const components = assetlinks[0].relation_extensions["delegate_permission/common.handle_all_urls"].dynamic_app_link_components;
    if (process.env.TEST_ASSOCIATION_MUTATION === "missing-child") components.splice(1, 2);
    if (process.env.TEST_ASSOCIATION_MUTATION === "broadened") components.push({ "/": "/other" });
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      const common = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
      if (url.pathname === "/.well-known/apple-app-site-association") {
        if (process.env.INVITATION_ANDROID_ONLY === "true") {
          throw new Error("Android-only verification requested AASA");
        }
        return new Response(JSON.stringify(aasa), {
          status: 200, headers: { ...common, "Content-Type": "application/json" },
        });
      }
      if (url.pathname === "/.well-known/assetlinks.json") {
        return new Response(JSON.stringify(assetlinks), {
          status: 200, headers: { ...common, "Content-Type": "application/json" },
        });
      }
      const fallback = process.env.TEST_FALLBACK_MUTATION === "missing" && url.pathname === "/invitations/child"
        ? "Empty page" : process.env.TEST_FALLBACK_MUTATION === "disclosing" && url.pathname === "/invitations/child"
        ? "Install or open Household Tool token=" + "a".repeat(43) : "Install or open Household Tool";
      return new Response(fallback, {
        status: process.env.TEST_BAD_FALLBACK === "1" && url.pathname === "/invitations/child" && url.searchParams.has("token") ? 503 : 200,
        headers: { ...common, "Content-Type": "text/html" },
      });
    };
  `;
  return spawnSync(
    process.execPath,
    [
      `--import=data:text/javascript,${encodeURIComponent(preload)}`,
      path.join(root, "scripts/verify-invitation-deployment.mjs"),
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        EXPO_PUBLIC_INVITATION_ORIGIN: "https://invite-staging.example.test",
        IOS_APP_ID: "TEAM123456.com.example.household.staging",
        INVITATION_ANDROID_ONLY: "false",
        ANDROID_PACKAGE_NAME: "com.example.household.staging",
        ANDROID_CERT_SHA256: Array(32).fill("AA").join(":"),
        TEST_BAD_FALLBACK: badFallback ? "1" : "0",
        ...overrides,
      },
    },
  );
}

function buildPages(cwd, overrides = {}) {
  return spawnSync(
    process.execPath,
    [path.join(root, "scripts/build-invitation-pages.mjs")],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        EXPO_PUBLIC_INVITATION_ORIGIN:
          "https://household-tool-invitations.pages.dev",
        IOS_APP_ID: "TEAM123456.com.example.household.staging",
        INVITATION_ANDROID_ONLY: "false",
        ANDROID_PACKAGE_NAME: "com.example.household.staging",
        ANDROID_CERT_SHA256: Array(32).fill("ab").join(":"),
        ...overrides,
      },
    },
  );
}

describe("invitation deep-link configuration", () => {
  it("configures an installable Android staging preview build", () => {
    const preview = easJson.build.preview;
    const config = buildExpoConfig(baseConfig, preview.env);

    expect(appJson.expo.extra.eas.projectId).toBeTruthy();
    expect(preview.distribution).toBe("internal");
    expect(preview.android.buildType).toBe("apk");
    expect(preview.env.EXPO_PUBLIC_APP_ENV).toBe("staging");
    expect(preview.env.IOS_APP_ID).toBeUndefined();
    expect(config.android).toMatchObject({
      package: "com.householdtool.mobile.staging",
      intentFilters: [
        {
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "household-tool-invitations.pages.dev",
              path: "/invitations/parent",
            },
            {
              scheme: "https",
              host: "household-tool-invitations.pages.dev",
              path: "/invitations/child",
            },
          ],
        },
      ],
    });
  });

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
              ...(appEnvironment === "staging"
                ? [
                    {
                      scheme: "https",
                      host: native.inviteHost,
                      path: "/invitations/child",
                    },
                  ]
                : []),
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
      childInvitationUrl: "https://invite.example.test/invitations/child",
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

  it("reports every live verifier check without printing token-shaped URLs", () => {
    const result = runVerifierWithMockResponses();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/PASS AASA: direct HTTP 200 JSON/);
    expect(result.stdout).toMatch(
      /PASS assetlinks\.json: direct HTTP 200 JSON/,
    );
    for (const label of [
      ...["parent", "child"].flatMap((path) =>
        [
          "valid-shaped",
          "missing-token",
          "malformed-token",
          "extra-query",
          "fragment",
        ].map((caseName) => `${path} ${caseName}`),
      ),
      "unsupported-path",
    ]) {
      expect(result.stdout).toContain(
        `PASS ${label} fallback: direct HTTP 200`,
      );
    }
    expect(result.stdout).toContain(
      "PASS invitation deployment at https://invite-staging.example.test",
    );
    expect(result.stdout).not.toContain("a".repeat(43));
    expect(result.stdout).not.toContain("token=");
  });

  it("names a failed verifier case without printing its token-shaped URL", () => {
    const result = runVerifierWithMockResponses(true);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "child valid-shaped fallback returned HTTP 503, expected 200",
    );
    expect(result.stderr).not.toContain("a".repeat(43));
    expect(result.stderr).not.toContain("token=");
  });

  it("verifies an Android-only deployment without requiring or requesting AASA", () => {
    const result = runVerifierWithMockResponses(false, {
      INVITATION_ANDROID_ONLY: "true",
      IOS_APP_ID: "",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("PASS AASA");
    expect(result.stdout).toContain("PASS assetlinks.json");
    expect(result.stdout).toContain("PASS child fragment fallback");
    expect(result.stdout).toContain("PASS unsupported-path fallback");
    expect(result.stderr).toBe("");
  });

  it.each(["missing-child", "broadened"])(
    "rejects %s Android association routing",
    (mutation) => {
      const result = runVerifierWithMockResponses(false, {
        TEST_ASSOCIATION_MUTATION: mutation,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "assetlinks.json has missing, mismatched, or broadened routing",
      );
      expect(result.stderr).not.toContain("token=");
    },
  );

  it.each([
    ["missing", "child valid-shaped did not return the generic fallback"],
    [
      "disclosing",
      "child valid-shaped disclosed link data or invitation state",
    ],
  ])("rejects %s child fallback", (mutation, expected) => {
    const result = runVerifierWithMockResponses(false, {
      TEST_FALLBACK_MUTATION: mutation,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expected);
    expect(result.stderr).not.toContain("a".repeat(43));
    expect(result.stderr).not.toContain("token=");
  });

  it("builds direct Pages association assets and one generic canonical and unknown-path fallback", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "invitation-pages-"));
    try {
      const result = buildPages(cwd);
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain("TEAM123456");
      expect(result.stdout).not.toContain("ab:ab");

      const output = path.join(cwd, "dist/invitation-pages");
      expect(fs.readdirSync(output).sort()).toEqual([
        ".well-known",
        "_headers",
        "index.html",
        "invitations",
      ]);
      expect(fs.readdirSync(path.join(output, ".well-known")).sort()).toEqual([
        "apple-app-site-association",
        "assetlinks.json",
      ]);
      expect(fs.readdirSync(path.join(output, "invitations")).sort()).toEqual([
        "child.html",
        "parent.html",
      ]);

      const aasa = JSON.parse(
        fs.readFileSync(
          path.join(output, ".well-known/apple-app-site-association"),
          "utf8",
        ),
      );
      const assetlinks = JSON.parse(
        fs.readFileSync(
          path.join(output, ".well-known/assetlinks.json"),
          "utf8",
        ),
      );
      const [caddyAasa, caddyAssetlinks] = associationJsonBodies();
      expect(aasa).toEqual({
        applinks: {
          details: [
            {
              appIDs: caddyAasa.applinks.details[0].appIDs,
              components: [
                {
                  "/": "/invitations/parent",
                  "?": { token: tokenPattern },
                },
              ],
            },
          ],
        },
      });
      expect(assetlinks[0]).toMatchObject({
        relation: caddyAssetlinks[0].relation,
        target: {
          namespace: "android_app",
          package_name: "com.example.household.staging",
          sha256_cert_fingerprints: [Array(32).fill("AB").join(":")],
        },
      });
      expect(
        assetlinks[0].relation_extensions[
          "delegate_permission/common.handle_all_urls"
        ].dynamic_app_link_components,
      ).toEqual([
        { "/": "/invitations/parent", "?": { token: tokenPattern } },
        { "/": "/invitations/child", "#": "?*", exclude: true },
        { "/": "/invitations/child", "?": { token: tokenPattern } },
        { "/": "*", exclude: true },
      ]);

      const headers = fs.readFileSync(path.join(output, "_headers"), "utf8");
      expect(headers).toMatch(/\/\*\n {2}Cache-Control: no-store, max-age=0/);
      expect(headers).toMatch(/Referrer-Policy: no-referrer/);
      expect(headers).toMatch(
        /\/\.well-known\/apple-app-site-association\n {2}Content-Type: application\/json/,
      );
      expect(headers).toMatch(
        /\/\.well-known\/assetlinks\.json\n {2}Content-Type: application\/json/,
      );
      const fallback = fs.readFileSync(path.join(output, "index.html"), "utf8");
      expect(
        fs.readFileSync(path.join(output, "invitations/parent.html"), "utf8"),
      ).toBe(fallback);
      expect(
        fs.readFileSync(path.join(output, "invitations/child.html"), "utf8"),
      ).toBe(fallback);
      expect(fallback).toContain("Install or open Household Tool");
      expect(fallback).not.toMatch(/token=|member=|invite-status/i);
      expect(fs.existsSync(path.join(output, "404.html"))).toBe(false);
      expect(fs.existsSync(path.join(output, "_redirects"))).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("rebuilds Android-only Pages output without AASA or its header rule", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "invitation-pages-"));
    try {
      expect(buildPages(cwd).status).toBe(0);
      const result = buildPages(cwd, {
        INVITATION_ANDROID_ONLY: "true",
        IOS_APP_ID: "",
      });
      expect(result.status).toBe(0);
      const output = path.join(cwd, "dist/invitation-pages");
      expect(fs.readdirSync(path.join(output, ".well-known"))).toEqual([
        "assetlinks.json",
      ]);
      const assetlinks = JSON.parse(
        fs.readFileSync(
          path.join(output, ".well-known/assetlinks.json"),
          "utf8",
        ),
      );
      expect(assetlinks[0].target).toEqual({
        namespace: "android_app",
        package_name: "com.example.household.staging",
        sha256_cert_fingerprints: [Array(32).fill("AB").join(":")],
      });
      expect(
        assetlinks[0].relation_extensions[
          "delegate_permission/common.handle_all_urls"
        ].dynamic_app_link_components,
      ).toEqual([
        { "/": "/invitations/parent", "?": { token: tokenPattern } },
        { "/": "/invitations/child", "#": "?*", exclude: true },
        { "/": "/invitations/child", "?": { token: tokenPattern } },
        { "/": "*", exclude: true },
      ]);
      const headers = fs.readFileSync(path.join(output, "_headers"), "utf8");
      expect(headers).toContain(
        "/.well-known/assetlinks.json\n  Content-Type: application/json",
      );
      expect(headers).not.toContain("apple-app-site-association");
      expect(headers).toContain("Cache-Control: no-store, max-age=0");
      expect(headers).toContain("Referrer-Policy: no-referrer");
      const fallback = fs.readFileSync(path.join(output, "index.html"), "utf8");
      expect(
        fs.readFileSync(path.join(output, "invitations/parent.html"), "utf8"),
      ).toBe(fallback);
      expect(
        fs.readFileSync(path.join(output, "invitations/child.html"), "utf8"),
      ).toBe(fallback);
      expect(fallback).toContain("Install or open Household Tool");
      expect(fallback).not.toMatch(/token=|member=|invite-status/i);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it.each([
    ["missing Apple app ID", { IOS_APP_ID: "" }],
    ["Apple app ID in Android-only mode", { INVITATION_ANDROID_ONLY: "true" }],
    ["invalid Android-only mode", { INVITATION_ANDROID_ONLY: "yes" }],
    [
      "missing Android package in Android-only mode",
      {
        INVITATION_ANDROID_ONLY: "true",
        IOS_APP_ID: "",
        ANDROID_PACKAGE_NAME: "",
      },
    ],
    [
      "missing fingerprint in Android-only mode",
      {
        INVITATION_ANDROID_ONLY: "true",
        IOS_APP_ID: "",
        ANDROID_CERT_SHA256: "",
      },
    ],
    ["missing Android package", { ANDROID_PACKAGE_NAME: "" }],
    ["malformed Android package", { ANDROID_PACKAGE_NAME: "com.example;bad" }],
    ["malformed fingerprint", { ANDROID_CERT_SHA256: "not-a-fingerprint" }],
    [
      "placeholder fingerprint",
      { ANDROID_CERT_SHA256: Array(32).fill("00").join(":") },
    ],
    [
      "non-origin URL",
      { EXPO_PUBLIC_INVITATION_ORIGIN: "https://example.test/path" },
    ],
  ])("rejects %s before creating a Pages output", (_, overrides) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "invitation-pages-"));
    try {
      const result = buildPages(cwd, overrides);
      expect(result.status).toBe(1);
      expect(fs.existsSync(path.join(cwd, "dist/invitation-pages"))).toBe(
        false,
      );
      expect(result.stderr).not.toContain("https://example.test/path");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
