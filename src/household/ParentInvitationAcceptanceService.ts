import type { HouseholdSettings } from "./types";

type RpcError = { code?: string; message?: string };
type RpcResult = { data: unknown; error: RpcError | null };

export type InvitationAcceptanceRpcClient = {
  rpc(
    name: string,
    parameters?: Record<string, string>,
  ): PromiseLike<RpcResult>;
};

export type PendingInvitationStorage = {
  getItem(): Promise<string | null>;
  setItem(value: string): Promise<void>;
  removeItem(): Promise<void>;
};

export type InvitationRejection =
  | "invalid"
  | "expired"
  | "revoked"
  | "consumed"
  | "wrong_role"
  | "unauthorized"
  | "already_member"
  | "parent_limit";

export type InvitationAcceptanceOutcome =
  | { status: "accepted"; settings: HouseholdSettings }
  | { status: InvitationRejection }
  | { status: "retry" };

export type InvitationLinkOutcome = "unrelated" | "pending" | "invalid";

export type ParentInvitationAcceptanceServiceContract = {
  captureUrl(candidate: string): Promise<InvitationLinkOutcome>;
  loadPending(): Promise<"pending" | "none" | "invalid">;
  accept(): Promise<InvitationAcceptanceOutcome>;
  cancel(): Promise<void>;
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TERMINAL_STATUSES = new Set<InvitationRejection>([
  "invalid",
  "expired",
  "revoked",
  "consumed",
  "wrong_role",
  "unauthorized",
  "already_member",
  "parent_limit",
]);

function firstRow(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export class ParentInvitationAcceptanceService implements ParentInvitationAcceptanceServiceContract {
  constructor(
    private readonly client: InvitationAcceptanceRpcClient,
    private readonly invitationUrlBase: string,
    private readonly storage: PendingInvitationStorage,
  ) {}

  async captureUrl(candidate: string): Promise<InvitationLinkOutcome> {
    let actual: URL;
    let expected: URL;
    try {
      actual = new URL(candidate);
      expected = new URL(this.invitationUrlBase);
    } catch {
      return "unrelated";
    }

    if (
      actual.origin !== expected.origin ||
      actual.pathname !== expected.pathname
    ) {
      return "unrelated";
    }

    const token = actual.searchParams.get("token");
    if (
      actual.username ||
      actual.password ||
      actual.hash ||
      [...actual.searchParams.keys()].length !== 1 ||
      !token ||
      !TOKEN_PATTERN.test(token)
    ) {
      await this.clear();
      return "invalid";
    }

    try {
      await this.storage.setItem(token);
      return "pending";
    } catch {
      return "invalid";
    }
  }

  async loadPending(): Promise<"pending" | "none" | "invalid"> {
    try {
      const token = await this.storage.getItem();
      if (!token) return "none";
      if (TOKEN_PATTERN.test(token)) return "pending";
      await this.clear();
      return "invalid";
    } catch {
      return "none";
    }
  }

  async accept(): Promise<InvitationAcceptanceOutcome> {
    let token: string | null;
    try {
      token = await this.storage.getItem();
    } catch {
      return { status: "retry" };
    }

    if (!token || !TOKEN_PATTERN.test(token)) {
      await this.clear();
      return { status: "invalid" };
    }

    try {
      const { data, error } = await this.client.rpc(
        "accept_parent_invitation",
        { raw_token: token },
      );
      if (error) return { status: "retry" };

      const row = firstRow(data);
      const status = row?.invitation_status;
      if (
        status === "accepted" &&
        typeof row?.household_id === "string" &&
        typeof row.timezone === "string"
      ) {
        await this.clear();
        return {
          status,
          settings: {
            householdId: row.household_id,
            timeZone: row.timezone,
          },
        };
      }
      if (
        typeof status === "string" &&
        TERMINAL_STATUSES.has(status as InvitationRejection)
      ) {
        await this.clear();
        return { status: status as InvitationRejection };
      }
      return { status: "retry" };
    } catch {
      return { status: "retry" };
    }
  }

  async cancel(): Promise<void> {
    await this.clear();
  }

  private async clear() {
    await this.storage.removeItem().catch(() => undefined);
  }
}
