import {
  HouseholdService,
  type HouseholdRpcClient,
  type ChildInvitationCache,
} from "../src/household/HouseholdService";

const token = "A".repeat(43);
const childId = "private-child-id";
const createdAt = "2026-09-19T10:00:00Z";
const expiresAt = "2026-09-20T10:00:00Z";
const base = "https://invite.example.test/invitations/child";
const url = `${base}?token=${token}`;

function setup(cache?: ChildInvitationCache) {
  const client = { rpc: jest.fn() } as jest.Mocked<HouseholdRpcClient>;
  const service = new HouseholdService(
    client,
    "https://invite.example.test/invitations/parent",
    undefined,
    base,
    cache,
  );
  return { client, service };
}

describe("child invitation RPC adapter", () => {
  it("creates only the canonical opaque-token URL and stores it in secure cache", async () => {
    const cache = {
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async () => undefined),
      removeItem: jest.fn(async () => undefined),
    };
    const { client, service } = setup(cache);
    client.rpc.mockResolvedValue({
      data: [
        { link_token: token, created_at: createdAt, expires_at: expiresAt },
      ],
      error: null,
    });
    const result = await service.createChildInvitation(childId);
    expect(client.rpc).toHaveBeenCalledWith("create_child_invitation", {
      requested_child_id: childId,
    });
    expect(result.invitation).toEqual({
      status: "active",
      createdAt,
      expiresAt,
      url,
    });
    expect(new URL(url).searchParams.keys().next().value).toBe("token");
    expect([...new URL(url).searchParams.keys()]).toEqual(["token"]);
    expect(url).not.toMatch(
      /private-child-id|household|member|pin|credential|session|id=/i,
    );
    expect(cache.setItem).toHaveBeenCalledWith(
      childId,
      JSON.stringify(result.invitation),
    );
  });

  it("restores only matching child and server lifecycle, and clears terminal links", async () => {
    const cache = {
      getItem: jest.fn(async () =>
        JSON.stringify({ status: "active", createdAt, expiresAt, url }),
      ),
      setItem: jest.fn(async () => undefined),
      removeItem: jest.fn(async () => undefined),
    };
    const { client, service } = setup(cache);
    client.rpc.mockResolvedValueOnce({
      data: [
        {
          invitation_status: "active",
          created_at: createdAt,
          expires_at: expiresAt,
        },
      ],
      error: null,
    });
    await expect(service.loadChildInvitation(childId)).resolves.toMatchObject({
      invitation: { url },
    });
    expect(client.rpc).toHaveBeenCalledWith("get_child_invitation_status", {
      requested_child_id: childId,
    });

    cache.getItem.mockResolvedValueOnce(
      JSON.stringify({ createdAt: "old", expiresAt, url }),
    );
    client.rpc.mockResolvedValueOnce({
      data: [
        {
          invitation_status: "active",
          created_at: createdAt,
          expires_at: expiresAt,
        },
      ],
      error: null,
    });
    await expect(service.loadChildInvitation(childId)).resolves.toMatchObject({
      invitation: { status: "active" },
    });

    for (const status of ["expired", "revoked", "consumed"]) {
      client.rpc.mockResolvedValueOnce({
        data: [
          {
            invitation_status: status,
            created_at: createdAt,
            expires_at: expiresAt,
          },
        ],
        error: null,
      });
      await expect(service.loadChildInvitation(childId)).resolves.toMatchObject(
        { invitation: { status } },
      );
    }
    expect(cache.removeItem).toHaveBeenCalledTimes(3);
  });

  it("revokes by child selection, clears secure token, and maps unsafe errors safely", async () => {
    const cache = {
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async () => undefined),
      removeItem: jest.fn(async () => undefined),
    };
    const { client, service } = setup(cache);
    client.rpc.mockResolvedValueOnce({
      data: [
        {
          invitation_status: "revoked",
          created_at: createdAt,
          expires_at: expiresAt,
        },
      ],
      error: null,
    });
    await expect(service.revokeChildInvitation(childId)).resolves.toMatchObject(
      { invitation: { status: "revoked" } },
    );
    expect(client.rpc).toHaveBeenCalledWith("revoke_child_invitation", {
      requested_child_id: childId,
    });
    expect(cache.removeItem).toHaveBeenCalledWith(childId);
    for (const [code, expected] of [
      ["42501", /unavailable for this account/],
      ["23514", /unavailable for invitations/],
      ["XX000", /try again/],
    ] as const) {
      client.rpc.mockResolvedValueOnce({
        data: null,
        error: { code, message: "secret household and token" },
      });
      const result = await service.createChildInvitation(childId);
      expect(result.message).toMatch(expected);
      expect(result.message).not.toMatch(/secret|household|token/);
    }
  });
});
