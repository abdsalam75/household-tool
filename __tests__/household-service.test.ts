import {
  HouseholdService,
  type HouseholdRpcClient,
} from "../src/household/HouseholdService";

function setup() {
  const client = { rpc: jest.fn() } as jest.Mocked<HouseholdRpcClient>;
  return { client, service: new HouseholdService(client) };
}

describe("HouseholdService", () => {
  it("loads no protected data when setup has not been created", async () => {
    const { client, service } = setup();
    client.rpc.mockResolvedValue({ data: [], error: null });

    await expect(service.load()).resolves.toEqual({ settings: null });
    expect(client.rpc).toHaveBeenCalledWith("get_household_settings");
  });

  it("creates setup with only the reviewed time zone and maps the persisted result", async () => {
    const { client, service } = setup();
    client.rpc.mockResolvedValue({
      data: [{ household_id: "household-id", timezone: "Africa/Lagos" }],
      error: null,
    });

    await expect(service.create(" Africa/Lagos ")).resolves.toEqual({
      settings: { householdId: "household-id", timeZone: "Africa/Lagos" },
    });
    expect(client.rpc).toHaveBeenCalledWith("setup_household", {
      requested_timezone: "Africa/Lagos",
    });
  });

  it("updates without accepting a client household ID or role", async () => {
    const { client, service } = setup();
    client.rpc.mockResolvedValue({
      data: [{ household_id: "derived-id", timezone: "America/New_York" }],
      error: null,
    });

    await service.updateTimeZone("America/New_York");

    expect(client.rpc).toHaveBeenCalledWith("update_household_timezone", {
      requested_timezone: "America/New_York",
    });
  });

  it("returns user-safe validation, conflict, authorization, and retry errors", async () => {
    const cases = [
      ["22023", /valid named IANA/i],
      ["23505", /already belongs/i],
      ["42501", /cannot create/i],
      ["XX000", /try again/i],
    ] as const;

    for (const [code, message] of cases) {
      const { client, service } = setup();
      client.rpc.mockResolvedValue({
        data: null,
        error: { code, message: "sensitive backend detail" },
      });

      const outcome = await service.create("Not/A_Zone");
      expect(outcome.settings).toBeNull();
      expect(outcome.message).toMatch(message);
      expect(outcome.message).not.toMatch(/sensitive backend detail/i);
    }
  });
});
