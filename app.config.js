/* global module, process, URL */

const APP_ENVIRONMENTS = new Set(["local", "staging", "production"]);
const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_-]+)+$/;

function parseInvitationOrigin(value, environment) {
  if (!value) {
    if (environment === "local") return null;
    throw new Error("EXPO_PUBLIC_INVITATION_ORIGIN is required");
  }

  let origin;
  try {
    origin = new URL(value);
  } catch {
    throw new Error("EXPO_PUBLIC_INVITATION_ORIGIN is invalid");
  }

  const loopback =
    origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
  const validTransport =
    origin.protocol === "https:" ||
    (environment === "local" && origin.protocol === "http:" && loopback);
  if (
    !validTransport ||
    origin.username ||
    origin.password ||
    origin.port ||
    (origin.pathname !== "/" && origin.pathname !== "") ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("EXPO_PUBLIC_INVITATION_ORIGIN is not allowed");
  }

  return origin;
}

function identifier(value, fallback, name) {
  const resolved = value || fallback;
  if (!IDENTIFIER_PATTERN.test(resolved)) {
    throw new Error(`${name} is invalid`);
  }
  return resolved;
}

function nativeInvitationConfig(environment = process.env) {
  const appEnvironment = environment.EXPO_PUBLIC_APP_ENV || "local";
  if (!APP_ENVIRONMENTS.has(appEnvironment)) {
    throw new Error("EXPO_PUBLIC_APP_ENV is invalid");
  }

  const suffix = appEnvironment === "production" ? "" : `.${appEnvironment}`;
  const origin = parseInvitationOrigin(
    environment.EXPO_PUBLIC_INVITATION_ORIGIN,
    appEnvironment,
  );
  const bundleIdentifier = identifier(
    environment.IOS_BUNDLE_IDENTIFIER,
    `com.householdtool.mobile${suffix}`,
    "IOS_BUNDLE_IDENTIFIER",
  );
  const packageName = identifier(
    environment.ANDROID_PACKAGE_NAME,
    `com.householdtool.mobile${suffix}`,
    "ANDROID_PACKAGE_NAME",
  );

  return {
    appEnvironment,
    bundleIdentifier,
    inviteHost: appEnvironment === "local" ? null : (origin?.hostname ?? null),
    packageName,
  };
}

function buildExpoConfig(config, environment) {
  const native = nativeInvitationConfig(environment);
  const ios = {
    ...config.ios,
    bundleIdentifier: native.bundleIdentifier,
  };
  const android = {
    ...config.android,
    package: native.packageName,
  };

  if (native.inviteHost) {
    ios.associatedDomains = [`applinks:${native.inviteHost}`];
    android.intentFilters = [
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
    ];
  }

  return { ...config, ios, android };
}

function createExpoConfig({ config }) {
  return buildExpoConfig(config, process.env);
}

module.exports = createExpoConfig;
module.exports.buildExpoConfig = buildExpoConfig;
module.exports.nativeInvitationConfig = nativeInvitationConfig;
