import type {
  HouseholdOutcome,
  ParentInvitation,
  ParentInvitationOutcome,
  HouseholdService as HouseholdServiceContract,
  HouseholdSettings,
} from "./types";

type RpcError = { code?: string; message?: string };
type RpcResult = { data: unknown; error: RpcError | null };

export type HouseholdRpcClient = {
  rpc(
    name: string,
    parameters?: Record<string, string>,
  ): PromiseLike<RpcResult>;
};

export type ParentInvitationCache = {
  getItem(): Promise<string | null>;
  setItem(value: string): Promise<void>;
  removeItem(): Promise<void>;
};

const RETRY_ERROR = "Household settings are unavailable. Please try again.";
const ZONE_ERROR =
  "Enter a valid named IANA time zone, such as Africa/Lagos or Etc/UTC.";
const CREATE_CONFLICT =
  "This account already belongs to a household and cannot create another one.";
const INVITATION_RETRY =
  "Parent invitations are unavailable. Please try again.";
const INVITATION_AUTH = "Parent invitations are unavailable for this account.";
const PARENT_LIMIT = "This household already has two active parents.";

function firstRow(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function settingsFrom(data: unknown): HouseholdSettings | null {
  const row = firstRow(data);
  if (
    !row ||
    typeof row.household_id !== "string" ||
    typeof row.timezone !== "string"
  ) {
    return null;
  }
  return { householdId: row.household_id, timeZone: row.timezone };
}

function safeMessage(error: RpcError, action: "create" | "read" | "update") {
  if (error.code === "22023") return ZONE_ERROR;
  if (action === "create" && error.code === "23505") return CREATE_CONFLICT;
  if (error.code === "42501") {
    return action === "create"
      ? "This account cannot create a household."
      : "Household settings are unavailable for this account.";
  }
  return RETRY_ERROR;
}

function invitationFrom(data: unknown): ParentInvitation | null {
  const row = firstRow(data);
  if (!row) return null;
  const status = row.invitation_status;
  if (
    (status !== "active" &&
      status !== "expired" &&
      status !== "revoked" &&
      status !== "consumed") ||
    typeof row.created_at !== "string" ||
    typeof row.expires_at !== "string"
  ) {
    return null;
  }
  return {
    status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function invitationMessage(error: RpcError) {
  if (error.code === "42501") return INVITATION_AUTH;
  if (error.code === "23514") return PARENT_LIMIT;
  return INVITATION_RETRY;
}

export class HouseholdService implements HouseholdServiceContract {
  constructor(
    private readonly client: HouseholdRpcClient,
    private readonly invitationUrlBase = "https://household.invalid/invitations/parent",
    private readonly invitationCache?: ParentInvitationCache,
  ) {}

  async load(): Promise<HouseholdOutcome> {
    try {
      const { data, error } = await this.client.rpc("get_household_settings");
      if (error) return { settings: null, message: safeMessage(error, "read") };
      return { settings: settingsFrom(data) };
    } catch {
      return { settings: null, message: RETRY_ERROR };
    }
  }

  async create(timeZone: string): Promise<HouseholdOutcome> {
    return this.mutate("setup_household", timeZone, "create");
  }

  async updateTimeZone(timeZone: string): Promise<HouseholdOutcome> {
    return this.mutate("update_household_timezone", timeZone, "update");
  }

  async loadParentInvitation(): Promise<ParentInvitationOutcome> {
    try {
      const { data, error } = await this.client.rpc(
        "get_parent_invitation_status",
      );
      if (error) return { invitation: null, message: invitationMessage(error) };
      const invitation = invitationFrom(data);
      if (invitation?.status !== "active" || !this.invitationCache) {
        if (invitation?.status !== "active")
          await this.invitationCache?.removeItem().catch(() => undefined);
        return { invitation };
      }
      const cached = await this.invitationCache.getItem().catch(() => null);
      if (!cached) return { invitation };
      try {
        const parsed = JSON.parse(cached) as Record<string, unknown>;
        if (
          parsed.createdAt === invitation.createdAt &&
          parsed.expiresAt === invitation.expiresAt &&
          typeof parsed.url === "string" &&
          this.isInvitationUrl(parsed.url)
        ) {
          return { invitation: { ...invitation, url: parsed.url } };
        }
      } catch {
        // Invalid or stale secure cache entries are never displayed.
      }
      return { invitation };
    } catch {
      return { invitation: null, message: INVITATION_RETRY };
    }
  }

  async createParentInvitation(): Promise<ParentInvitationOutcome> {
    try {
      const { data, error } = await this.client.rpc("create_parent_invitation");
      if (error) return { invitation: null, message: invitationMessage(error) };
      const row = firstRow(data);
      if (
        !row ||
        typeof row.link_token !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(row.link_token) ||
        typeof row.created_at !== "string" ||
        typeof row.expires_at !== "string"
      ) {
        return { invitation: null, message: INVITATION_RETRY };
      }
      const url = new URL(this.invitationUrlBase);
      url.search = "";
      url.hash = "";
      url.searchParams.set("token", row.link_token);
      const invitation: ParentInvitation = {
        status: "active",
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        url: url.toString(),
      };
      await this.invitationCache
        ?.setItem(JSON.stringify(invitation))
        .catch(() => undefined);
      return { invitation };
    } catch {
      return { invitation: null, message: INVITATION_RETRY };
    }
  }

  async revokeParentInvitation(): Promise<ParentInvitationOutcome> {
    try {
      const { data, error } = await this.client.rpc("revoke_parent_invitation");
      if (error) return { invitation: null, message: invitationMessage(error) };
      const invitation = invitationFrom(data);
      if (invitation)
        await this.invitationCache?.removeItem().catch(() => undefined);
      return invitation
        ? { invitation }
        : { invitation: null, message: INVITATION_RETRY };
    } catch {
      return { invitation: null, message: INVITATION_RETRY };
    }
  }

  private isInvitationUrl(candidate: string) {
    try {
      const expected = new URL(this.invitationUrlBase);
      const actual = new URL(candidate);
      return (
        actual.origin === expected.origin &&
        actual.pathname === expected.pathname &&
        actual.hash === "" &&
        [...actual.searchParams.keys()].length === 1 &&
        /^[A-Za-z0-9_-]{43}$/.test(actual.searchParams.get("token") ?? "")
      );
    } catch {
      return false;
    }
  }

  private async mutate(
    operation: "setup_household" | "update_household_timezone",
    timeZone: string,
    action: "create" | "update",
  ): Promise<HouseholdOutcome> {
    try {
      const { data, error } = await this.client.rpc(operation, {
        requested_timezone: timeZone.trim(),
      });
      if (error) return { settings: null, message: safeMessage(error, action) };

      const settings = settingsFrom(data);
      return settings ? { settings } : { settings: null, message: RETRY_ERROR };
    } catch {
      return { settings: null, message: RETRY_ERROR };
    }
  }
}
