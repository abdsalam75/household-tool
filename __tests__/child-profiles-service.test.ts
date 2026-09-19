import {
  HouseholdService,
  type HouseholdRpcClient,
} from "../src/household/HouseholdService";

function setup() {
  const client = { rpc: jest.fn() } as jest.Mocked<HouseholdRpcClient>;
  return { client, service: new HouseholdService(client) };
}

const child = { child_id: "child-id", display_name: "Ada", active: true };

describe("child profile RPC adapter", () => {
  it("lists only the server-provided safe child fields and accepts an empty list", async () => {
    const { client, service } = setup();
    client.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [child], error: null });
    await expect(service.listChildProfiles()).resolves.toEqual({
      profiles: [],
    });
    await expect(service.listChildProfiles()).resolves.toEqual({
      profiles: [{ id: "child-id", displayName: "Ada", active: true }],
    });
    expect(client.rpc).toHaveBeenCalledWith("list_child_profiles");
  });

  it("trims a name, sends no household or role, and blocks blank names locally", async () => {
    const { client, service } = setup();
    client.rpc.mockResolvedValue({ data: [child], error: null });
    await expect(service.createChildProfile(" \t ")).resolves.toEqual({
      profile: null,
      message: "Enter a child name.",
    });
    expect(client.rpc).not.toHaveBeenCalled();
    await expect(service.createChildProfile(" Ada ")).resolves.toEqual({
      profile: { id: "child-id", displayName: "Ada", active: true },
    });
    expect(client.rpc).toHaveBeenCalledWith("create_child_profile", {
      requested_display_name: "Ada",
    });
  });

  it("deactivates by opaque profile ID and maps denial, duplicate, and malformed failures safely", async () => {
    const { client, service } = setup();
    client.rpc.mockResolvedValueOnce({
      data: [{ ...child, active: false }],
      error: null,
    });
    await expect(
      service.deactivateChildProfile("child-id"),
    ).resolves.toMatchObject({ profile: { active: false } });
    expect(client.rpc).toHaveBeenCalledWith("deactivate_child_profile", {
      requested_child_id: "child-id",
    });
    for (const [code, message] of [
      ["42501", /unavailable for this account/],
      ["23505", /already exists/],
      ["XX000", /try again/],
    ] as const) {
      client.rpc.mockResolvedValueOnce({
        data: null,
        error: { code, message: "secret household-id" },
      });
      const result = await service.createChildProfile("Ada");
      expect(result.message).toMatch(message);
      expect(result.message).not.toMatch(/secret|household-id/);
    }
    client.rpc.mockResolvedValueOnce({
      data: [{ id: "wrong field" }],
      error: null,
    });
    await expect(service.listChildProfiles()).resolves.toMatchObject({
      profiles: null,
      message: expect.stringMatching(/try again/),
    });
  });
});
