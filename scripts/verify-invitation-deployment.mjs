/* global console, fetch, process, URL */

const TOKEN_PATTERN = "?".repeat(43);
const TEST_TOKEN = "a".repeat(43);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
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
  return {
    origin: origin.toString().replace(/\/$/, ""),
    iosAppId: required("IOS_APP_ID"),
    androidPackage: required("ANDROID_PACKAGE_NAME"),
    androidFingerprint: required("ANDROID_CERT_SHA256").toUpperCase(),
  };
}

async function directResponse(url, expectedContentType, label) {
  const response = await fetch(url, { redirect: "manual" });
  if (response.status !== 200) {
    throw new Error(`${label} returned HTTP ${response.status}, expected 200`);
  }
  if (response.headers.has("location")) {
    throw new Error(`${label} returned a redirect location`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith(expectedContentType)) {
    throw new Error(`${label} returned unexpected Content-Type ${contentType}`);
  }
  const cacheControl = response.headers.get("cache-control") ?? "";
  if (!cacheControl.toLowerCase().includes("no-store")) {
    throw new Error(`${label} is missing Cache-Control: no-store`);
  }
  return response;
}

function requireCanonicalComponent(components, source) {
  const expected = components?.find(
    (component) =>
      component?.["/"] === "/invitations/parent" &&
      component?.["?"]?.token === TOKEN_PATTERN,
  );
  if (!expected) {
    throw new Error(`${source} does not limit routing to the canonical URL`);
  }
}

async function verifyAssociations(values) {
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
  requireCanonicalComponent(appDetail.components, "AASA");
  console.log(
    "PASS AASA: direct HTTP 200 JSON, no redirect, no-store; iOS app ID and canonical path/token query matched",
  );

  const assetResponse = await directResponse(
    `${values.origin}/.well-known/assetlinks.json`,
    "application/json",
    "assetlinks.json",
  );
  const assetlinks = await assetResponse.json();
  const statement = assetlinks?.find(
    (candidate) =>
      candidate?.relation?.includes(
        "delegate_permission/common.handle_all_urls",
      ) &&
      candidate?.target?.namespace === "android_app" &&
      candidate?.target?.package_name === values.androidPackage &&
      candidate?.target?.sha256_cert_fingerprints
        ?.map((fingerprint) => fingerprint.toUpperCase())
        .includes(values.androidFingerprint),
  );
  if (!statement) {
    throw new Error(
      "assetlinks.json does not identify ANDROID_PACKAGE_NAME and ANDROID_CERT_SHA256",
    );
  }
  requireCanonicalComponent(
    statement.relation_extensions?.[
      "delegate_permission/common.handle_all_urls"
    ]?.dynamic_app_link_components,
    "assetlinks.json",
  );
  console.log(
    "PASS assetlinks.json: direct HTTP 200 JSON, no redirect, no-store; Android package/fingerprint and canonical path/token query matched",
  );
}

async function verifyFallback(values) {
  const candidates = [
    ["valid-shaped", `/invitations/parent?token=${TEST_TOKEN}`],
    ["missing-token", "/invitations/parent"],
    ["malformed-token", "/invitations/parent?token=short"],
    ["extra-query", `/invitations/parent?token=${TEST_TOKEN}&member=private`],
    ["unsupported-path", `/unsupported?token=${TEST_TOKEN}`],
  ];

  for (const [label, path] of candidates) {
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
  }
}

try {
  const values = deploymentValues();
  await verifyAssociations(values);
  await verifyFallback(values);
  console.log(`PASS invitation deployment at ${values.origin}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
