import type { AppEnvironment } from "../auth/config";

export const PARENT_INVITATION_PATH = "/invitations/parent";
export const CHILD_INVITATION_PATH = "/invitations/child";

export type InvitationLinkConfig = {
  invitationOrigin: string;
  parentInvitationUrl: string;
  childInvitationUrl: string;
};

function isEnvironment(value: string | undefined): value is AppEnvironment {
  return value === "local" || value === "staging" || value === "production";
}

export function readInvitationLinkConfig(
  environment: Record<string, string | undefined>,
): InvitationLinkConfig {
  const appEnvironment = environment.EXPO_PUBLIC_APP_ENV;
  const configuredOrigin = environment.EXPO_PUBLIC_INVITATION_ORIGIN;
  if (!isEnvironment(appEnvironment) || !configuredOrigin) {
    throw new Error("Public invitation-link configuration is incomplete");
  }

  let origin: URL;
  try {
    origin = new URL(configuredOrigin);
  } catch {
    throw new Error("Public invitation origin is invalid");
  }

  const loopback =
    origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
  const validTransport =
    origin.protocol === "https:" ||
    (appEnvironment === "local" && origin.protocol === "http:" && loopback);
  if (
    !validTransport ||
    origin.username ||
    origin.password ||
    origin.port ||
    (origin.pathname !== "/" && origin.pathname !== "") ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("Public invitation origin is not allowed");
  }

  const invitationOrigin = origin.toString().replace(/\/$/, "");
  return {
    invitationOrigin,
    parentInvitationUrl: `${invitationOrigin}${PARENT_INVITATION_PATH}`,
    childInvitationUrl: `${invitationOrigin}${CHILD_INVITATION_PATH}`,
  };
}

export function readExpoPublicInvitationLinkConfig(): InvitationLinkConfig {
  return readInvitationLinkConfig({
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_INVITATION_ORIGIN: process.env.EXPO_PUBLIC_INVITATION_ORIGIN,
  });
}
