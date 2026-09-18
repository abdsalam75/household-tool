import {
  ParentInvitationAcceptanceService,
  type InvitationAcceptanceRpcClient,
} from "../src/household/ParentInvitationAcceptanceService";

const base = "https://api.example.test/functions/v1/parent-invitations/accept";
const token = "a".repeat(43);

function setup(stored: string | null = null) {
  let value = stored;
  const storage = {
    getItem: jest.fn(async () => value),
    setItem: jest.fn(async (next: string) => {
      value = next;
    }),
    removeItem: jest.fn(async () => {
      value = null;
    }),
  };
  const client = {
    rpc: jest.fn(),
  } as jest.Mocked<InvitationAcceptanceRpcClient>;
  return {
    client,
    storage,
    service: new ParentInvitationAcceptanceService(client, base, storage),
  };
}

describe("ParentInvitationAcceptanceService", () => {
  it("accepts only the configured URL shape and stores only its opaque token", async () => {
    const { service, storage } = setup();

    await expect(service.captureUrl(`${base}?token=${token}`)).resolves.toBe(
      "pending",
    );
    expect(storage.setItem).toHaveBeenCalledWith(token);
    expect(storage.setItem).not.toHaveBeenCalledWith(
      expect.stringContaining("http"),
    );

    for (const candidate of [
      `${base}`,
      `${base}?token=short`,
      `${base}?token=${token}&household_id=secret`,
      `${base}?token=${token}#fragment`,
    ]) {
      await expect(service.captureUrl(candidate)).resolves.toBe("invalid");
    }
    await expect(
      service.captureUrl(`https://other.example.test/?token=${token}`),
    ).resolves.toBe("unrelated");
  });

  it("retains a valid pending token across authentication and clears corrupt state", async () => {
    await expect(setup(token).service.loadPending()).resolves.toBe("pending");
    const corrupt = setup("raw household identifier");
    await expect(corrupt.service.loadPending()).resolves.toBe("invalid");
    expect(corrupt.storage.removeItem).toHaveBeenCalled();
  });

  it("accepts through the token-only RPC and clears terminal success", async () => {
    const { client, service, storage } = setup(token);
    client.rpc.mockResolvedValue({
      data: [
        {
          invitation_status: "accepted",
          household_id: "invited-household",
          timezone: "Africa/Lagos",
        },
      ],
      error: null,
    });

    await expect(service.accept()).resolves.toEqual({
      status: "accepted",
      settings: {
        householdId: "invited-household",
        timeZone: "Africa/Lagos",
      },
    });
    expect(client.rpc).toHaveBeenCalledWith("accept_parent_invitation", {
      raw_token: token,
    });
    expect(storage.removeItem).toHaveBeenCalled();
  });

  it.each([
    "invalid",
    "expired",
    "revoked",
    "consumed",
    "wrong_role",
    "unauthorized",
    "already_member",
    "parent_limit",
  ] as const)("maps and clears the terminal %s outcome", async (status) => {
    const { client, service, storage } = setup(token);
    client.rpc.mockResolvedValue({
      data: [{ invitation_status: status }],
      error: null,
    });
    await expect(service.accept()).resolves.toEqual({ status });
    expect(storage.removeItem).toHaveBeenCalled();
  });

  it("retains the pending token for retryable transport and malformed responses", async () => {
    for (const response of [
      { data: null, error: { code: "XX000", message: "backend detail" } },
      { data: [{ invitation_status: "accepted" }], error: null },
    ]) {
      const { client, service, storage } = setup(token);
      client.rpc.mockResolvedValue(response);
      await expect(service.accept()).resolves.toEqual({ status: "retry" });
      expect(storage.removeItem).not.toHaveBeenCalled();
    }
  });

  it("clears the token when acceptance is cancelled", async () => {
    const { service, storage } = setup(token);
    await service.cancel();
    expect(storage.removeItem).toHaveBeenCalled();
  });
});
