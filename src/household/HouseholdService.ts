import type {
  HouseholdOutcome,
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

const RETRY_ERROR = "Household settings are unavailable. Please try again.";
const ZONE_ERROR =
  "Enter a valid named IANA time zone, such as Africa/Lagos or Etc/UTC.";
const CREATE_CONFLICT =
  "This account already belongs to a household and cannot create another one.";

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

export class HouseholdService implements HouseholdServiceContract {
  constructor(private readonly client: HouseholdRpcClient) {}

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
