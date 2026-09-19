/* global process, URL, console */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const parentPath = "/invitations/parent";
const tokenPattern = "?".repeat(43);

function required(name, pattern) {
  const value = process.env[name];
  if (!value || !pattern.test(value)) {
    throw new Error(`${name} is missing or invalid`);
  }
  return value;
}

function deploymentValues() {
  const originValue = required(
    "EXPO_PUBLIC_INVITATION_ORIGIN",
    /^https:\/\/[^\s]+$/,
  );
  let origin;
  try {
    origin = new URL(originValue);
  } catch {
    throw new Error("EXPO_PUBLIC_INVITATION_ORIGIN is invalid");
  }
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.port ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    originValue !== origin.origin
  ) {
    throw new Error("EXPO_PUBLIC_INVITATION_ORIGIN must be an HTTPS origin");
  }

  const values = {
    iosAppId: required(
      "IOS_APP_ID",
      /^[A-Z0-9]{10}\.[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+$/,
    ),
    androidPackage: required(
      "ANDROID_PACKAGE_NAME",
      /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/,
    ),
    androidFingerprint: required(
      "ANDROID_CERT_SHA256",
      /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/,
    ).toUpperCase(),
  };
  if (
    values.iosAppId.startsWith("0000000000.") ||
    values.androidFingerprint === Array(32).fill("00").join(":")
  ) {
    throw new Error(
      "Invitation association identifiers must not be placeholders",
    );
  }
  return values;
}

function associationFiles(values) {
  const canonicalComponent = {
    "/": parentPath,
    "?": { token: tokenPattern },
  };
  const aasa = {
    applinks: {
      details: [
        {
          appIDs: [values.iosAppId],
          components: [canonicalComponent],
        },
      ],
    },
  };
  const assetlinks = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: values.androidPackage,
        sha256_cert_fingerprints: [values.androidFingerprint],
      },
      relation_extensions: {
        "delegate_permission/common.handle_all_urls": {
          dynamic_app_link_components: [
            canonicalComponent,
            { "/": "*", exclude: true },
          ],
        },
      },
    },
  ];
  return { aasa, assetlinks };
}

const fallback = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Open Household Tool</title>
    <style>
      body { background: #f4f1ea; color: #152238; font: 16px/1.5 system-ui, sans-serif; margin: 0; }
      main { background: #fff; border-radius: 20px; margin: 12vh auto; max-width: 34rem; padding: 2rem; width: calc(100% - 6rem); }
      h1 { margin-top: 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>Open Household Tool</h1>
      <p>Install or open Household Tool, then return to the message that brought you here and tap its invitation link again.</p>
      <p>For your privacy, invitation details are shown only inside the app after sign-in.</p>
    </main>
  </body>
</html>
`;

const headers = `/*
  Cache-Control: no-store, max-age=0
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
/.well-known/apple-app-site-association
  Content-Type: application/json
/.well-known/assetlinks.json
  Content-Type: application/json
`;

async function build() {
  const values = deploymentValues();
  const { aasa, assetlinks } = associationFiles(values);
  const output = resolve("dist/invitation-pages");
  await rm(output, { recursive: true, force: true });
  await mkdir(join(output, ".well-known"), { recursive: true });
  await mkdir(join(output, "invitations"), { recursive: true });
  await Promise.all([
    writeFile(
      join(output, ".well-known/apple-app-site-association"),
      `${JSON.stringify(aasa, null, 2)}\n`,
    ),
    writeFile(
      join(output, ".well-known/assetlinks.json"),
      `${JSON.stringify(assetlinks, null, 2)}\n`,
    ),
    writeFile(join(output, "index.html"), fallback),
    writeFile(join(output, "invitations/parent.html"), fallback),
    writeFile(join(output, "_headers"), headers),
  ]);
  console.log("Built Cloudflare Pages invitation site");
}

try {
  await build();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
