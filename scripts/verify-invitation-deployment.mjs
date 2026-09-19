/* global console, fetch, process, URL */

const TOKEN_PATTERN = "?".repeat(43);
const TEST_TOKEN = "a".repeat(43);
const PARENT_PATH = "/invitations/parent";
const CHILD_PATH = "/invitations/child";
const RELATION = "delegate_permission/common.handle_all_urls";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function androidOnlyMode() {
  const value = process.env.INVITATION_ANDROID_ONLY;
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("INVITATION_ANDROID_ONLY must be true or false");
}

function deploymentValues() {
  const origin = new URL(required("EXPO_PUBLIC_INVITATION_ORIGIN"));
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.port ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      "EXPO_PUBLIC_INVITATION_ORIGIN must be an HTTPS origin without credentials, port, path, query, or fragment",
    );
  }
  const androidOnly = androidOnlyMode();
  if (androidOnly && process.env.IOS_APP_ID) {
    throw new Error("IOS_APP_ID must be unset in Android-only mode");
  }
  return {
    origin: origin.toString().replace(/\/$/, ""),
    iosAppId: androidOnly ? undefined : required("IOS_APP_ID"),
    androidPackage: required("ANDROID_PACKAGE_NAME"),
    androidFingerprint: required("ANDROID_CERT_SHA256").toUpperCase(),
  };
}

async function directResponse(url, expectedContentType, label) {
  let response;
  try {
    response = await fetch(url, { redirect: "manual" });
  } catch {
    throw new Error(`${label} request failed`);
  }
  if (response.status !== 200) {
    throw new Error(`${label} returned HTTP ${response.status}, expected 200`);
  }
  if (response.headers.has("location")) {
    throw new Error(`${label} returned a redirect location`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith(expectedContentType)) {
    throw new Error(`${label} returned an unexpected Content-Type`);
  }
  const cacheControl = response.headers.get("cache-control") ?? "";
  if (!cacheControl.toLowerCase().includes("no-store")) {
    throw new Error(`${label} is missing Cache-Control: no-store`);
  }
  return response;
}

function canonicalComponent(path) {
  return { "/": path, "?": { token: TOKEN_PATTERN } };
}

function requireExactComponents(actual, expected, source) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${source} has missing, mismatched, or broadened routing`);
  }
}

async function verifyAssociations(values) {
  if (values.iosAppId) {
    const aasaResponse = await directResponse(
      `${values.origin}/.well-known/apple-app-site-association`,
      "application/json",
      "AASA",
    );
    const aasa = await aasaResponse.json();
    const details = aasa?.applinks?.details;
    const appDetail = details?.find((detail) =>
      detail?.appIDs?.includes(values.iosAppId),
    );
    if (!appDetail) throw new Error("AASA does not identify IOS_APP_ID");
    requireExactComponents(
      appDetail.components?.map((component) => {
        const routing = { ...component };
        delete routing.comment;
        return routing;
      }),
      [canonicalComponent(PARENT_PATH)],
      "AASA",
    );
    console.log(
      "PASS AASA: direct HTTP 200 JSON, no redirect, no-store; iOS app ID and canonical path/token query matched",
    );
  }

  const assetResponse = await directResponse(
    `${values.origin}/.well-known/assetlinks.json`,
    "application/json",
    "assetlinks.json",
  );
  const assetlinks = await assetResponse.json();
  const statement =
    Array.isArray(assetlinks) && assetlinks.length === 1 ? assetlinks[0] : null;
  if (
    !statement ||
    JSON.stringify(statement.relation) !== JSON.stringify([RELATION]) ||
    statement.target?.namespace !== "android_app" ||
    statement.target?.package_name !== values.androidPackage ||
    !Array.isArray(statement.target?.sha256_cert_fingerprints) ||
    statement.target.sha256_cert_fingerprints.length !== 1 ||
    statement.target.sha256_cert_fingerprints[0].toUpperCase() !==
      values.androidFingerprint
  ) {
    throw new Error(
      "assetlinks.json does not identify ANDROID_PACKAGE_NAME and ANDROID_CERT_SHA256",
    );
  }
  requireExactComponents(
    statement.relation_extensions?.[RELATION]?.dynamic_app_link_components,
    [
      canonicalComponent(PARENT_PATH),
      { "/": CHILD_PATH, "#": "?*", exclude: true },
      canonicalComponent(CHILD_PATH),
      { "/": "*", exclude: true },
    ],
    "assetlinks.json",
  );
  console.log(
    "PASS assetlinks.json: direct HTTP 200 JSON, no redirect, no-store; Android package/fingerprint and parent/child path/token components matched",
  );
}

async function verifyFallback(values) {
  const candidates = [
    ...[PARENT_PATH, CHILD_PATH].flatMap((path) => {
      const label = path === PARENT_PATH ? "parent" : "child";
      return [
        [`${label} valid-shaped`, `${path}?token=${TEST_TOKEN}`],
        [`${label} missing-token`, path],
        [`${label} malformed-token`, `${path}?token=short`],
        [`${label} extra-query`, `${path}?token=${TEST_TOKEN}&member=private`],
        [`${label} fragment`, `${path}?token=${TEST_TOKEN}#variation`],
      ];
    }),
    ["unsupported-path", `/unsupported?token=${TEST_TOKEN}`],
  ];

  const failures = [];
  for (const [label, path] of candidates) {
    try {
      const response = await directResponse(
        `${values.origin}${path}`,
        "text/html",
        `${label} fallback`,
      );
      if (response.headers.get("referrer-policy") !== "no-referrer") {
        throw new Error(
          `${label} fallback is missing Referrer-Policy: no-referrer`,
        );
      }
      const body = await response.text();
      if (!body.includes("Install or open Household Tool")) {
        throw new Error(`${label} did not return the generic fallback`);
      }
      if (
        body.includes(TEST_TOKEN) ||
        /token=|member=|invite-status|invitation is valid/i.test(body)
      ) {
        throw new Error(`${label} disclosed link data or invitation state`);
      }
      console.log(
        `PASS ${label} fallback: direct HTTP 200 generic HTML, no redirect, no-store, no-referrer`,
      );
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `${label} failed`);
    }
  }
  if (failures.length) {
    throw new Error(failures.join("\n"));
  }
}

try {
  const values = deploymentValues();
  const results = await Promise.allSettled([
    verifyAssociations(values),
    verifyFallback(values),
  ]);
  const failures = results
    .filter((result) => result.status === "rejected")
    .map((result) =>
      result.reason instanceof Error ? result.reason.message : "Check failed",
    );
  if (failures.length) {
    throw new Error(failures.join("\n"));
  }
  console.log(
    `PASS ${values.iosAppId ? "invitation" : "Android-only invitation"} deployment at ${values.origin}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
