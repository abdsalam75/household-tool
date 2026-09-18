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

  it("creates an opaque-token invitation URL without exposing identifiers", async () => {
    const client = { rpc: jest.fn() } as jest.Mocked<HouseholdRpcClient>;
    const service = new HouseholdService(
      client,
      "https://invite.example.test/parent",
    );
    const token = "a".repeat(43);
    client.rpc.mockResolvedValue({
      data: [
        {
          link_token: token,
          created_at: "2026-09-18T20:00:00Z",
          expires_at: "2026-09-19T20:00:00Z",
        },
      ],
      error: null,
    });

    const outcome = await service.createParentInvitation();

    expect(client.rpc).toHaveBeenCalledWith("create_parent_invitation");
    expect(outcome.invitation).toEqual({
      status: "active",
      createdAt: "2026-09-18T20:00:00Z",
      expiresAt: "2026-09-19T20:00:00Z",
      url: `https://invite.example.test/parent?token=${token}`,
    });
    expect(outcome.invitation?.url).not.toMatch(
      /household|account|credential|pin|id=/i,
    );
  });

  it("loads and revokes invitation state without client identifiers", async () => {
    const { client, service } = setup();
    client.rpc.mockResolvedValue({
      data: [
        {
          invitation_status: "revoked",
          created_at: "2026-09-18T20:00:00Z",
          expires_at: "2026-09-19T20:00:00Z",
        },
      ],
      error: null,
    });

    await expect(service.loadParentInvitation()).resolves.toMatchObject({
      invitation: { status: "revoked" },
    });
    await expect(service.revokeParentInvitation()).resolves.toMatchObject({
      invitation: { status: "revoked" },
    });
    expect(client.rpc).toHaveBeenNthCalledWith(
      1,
      "get_parent_invitation_status",
    );
    expect(client.rpc).toHaveBeenNthCalledWith(2, "revoke_parent_invitation");
  });

  it("restores only a matching active invitation URL from secure cache", async () => {
    const client = { rpc: jest.fn() } as jest.Mocked<HouseholdRpcClient>;
    const token = "b".repeat(43);
    const url = `https://invite.example.test/parent?token=${token}`;
    const cache = {
      getItem: jest.fn().mockResolvedValue(
        JSON.stringify({
          url,
          createdAt: "2026-09-18T20:00:00Z",
          expiresAt: "2026-09-19T20:00:00Z",
        }),
      ),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    const service = new HouseholdService(
      client,
      "https://invite.example.test/parent",
      cache,
    );
    client.rpc.mockResolvedValue({
      data: [
        {
          invitation_status: "active",
          created_at: "2026-09-18T20:00:00Z",
          expires_at: "2026-09-19T20:00:00Z",
        },
      ],
      error: null,
    });

    await expect(service.loadParentInvitation()).resolves.toMatchObject({
      invitation: { status: "active", url },
    });
  });

  it("maps parent-limit and authorization failures to safe messages", async () => {
    for (const [code, message] of [
      ["23514", /two active parents/i],
      ["42501", /unavailable for this account/i],
    ] as const) {
      const { client, service } = setup();
      client.rpc.mockResolvedValue({
        data: null,
        error: { code, message: "sensitive detail" },
      });
      const outcome = await service.createParentInvitation();
      expect(outcome.message).toMatch(message);
      expect(outcome.message).not.toMatch(/sensitive/);
    }
  });
});
