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

async function directResponse(url, expectedContentType) {
  const response = await fetch(url, { redirect: "manual" });
  if (response.status !== 200) {
    throw new Error(`${url} returned HTTP ${response.status}, expected 200`);
  }
  if (response.headers.has("location")) {
    throw new Error(`${url} returned a redirect location`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith(expectedContentType)) {
    throw new Error(`${url} returned unexpected Content-Type ${contentType}`);
  }
  const cacheControl = response.headers.get("cache-control") ?? "";
  if (!cacheControl.toLowerCase().includes("no-store")) {
    throw new Error(`${url} is missing Cache-Control: no-store`);
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
  );
  const aasa = await aasaResponse.json();
  const details = aasa?.applinks?.details;
  const appDetail = details?.find((detail) =>
    detail?.appIDs?.includes(values.iosAppId),
  );
  if (!appDetail) throw new Error("AASA does not identify IOS_APP_ID");
  requireCanonicalComponent(appDetail.components, "AASA");

  const assetResponse = await directResponse(
    `${values.origin}/.well-known/assetlinks.json`,
    "application/json",
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
}

async function verifyFallback(values) {
  const candidates = [
    `${values.origin}/invitations/parent?token=${TEST_TOKEN}`,
    `${values.origin}/invitations/parent`,
    `${values.origin}/invitations/parent?token=short`,
    `${values.origin}/invitations/parent?token=${TEST_TOKEN}&member=private`,
    `${values.origin}/unsupported?token=${TEST_TOKEN}`,
  ];

  for (const url of candidates) {
    const response = await directResponse(url, "text/html");
    if (response.headers.get("referrer-policy") !== "no-referrer") {
      throw new Error(`${url} is missing Referrer-Policy: no-referrer`);
    }
    const body = await response.text();
    if (!body.includes("Install or open Household Tool")) {
      throw new Error(`${url} did not return the generic fallback`);
    }
    if (
      body.includes(TEST_TOKEN) ||
      /token=|member=|invite-status|invitation is valid/i.test(body)
    ) {
      throw new Error(`${url} disclosed link data or invitation state`);
    }
  }
}

try {
  const values = deploymentValues();
  await verifyAssociations(values);
  await verifyFallback(values);
  console.log(`Invitation deployment verified at ${values.origin}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
