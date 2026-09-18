import type { Session, User } from "@supabase/supabase-js";

import {
  type AuthBrowser,
  type AuthClient,
  ParentAuthService,
} from "../src/auth/ParentAuthService";

const REDIRECT_URL = "household-tool-local://auth/callback";

function user(email = "parent@example.test"): User {
  return { id: "parent-id", email } as User;
}

function session(expiresAt = Math.floor(Date.now() / 1000) + 3600): Session {
  return {
    access_token: "raw-access-token",
    refresh_token: "raw-refresh-token",
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: "bearer",
    user: user(),
  } as Session;
}

function setup() {
  const auth = {
    signInWithPassword: jest.fn(),
    signInWithOAuth: jest.fn(),
    exchangeCodeForSession: jest.fn(),
    getSession: jest.fn(),
    refreshSession: jest.fn(),
    getUser: jest.fn(),
    signOut: jest.fn(),
  } as jest.Mocked<AuthClient>;
  const browser = {
    openAuthSessionAsync: jest.fn(),
  } as jest.Mocked<AuthBrowser>;
  const clearStoredSession = jest.fn<Promise<void>, []>().mockResolvedValue();
  const service = new ParentAuthService(
    auth,
    browser,
    REDIRECT_URL,
    clearStoredSession,
  );
  return { auth, browser, clearStoredSession, service };
}

describe("ParentAuthService", () => {
  it("signs in with email and exposes only the account identity", async () => {
    const { auth, service } = setup();
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const error = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    auth.signInWithPassword.mockResolvedValue({
      data: { session: session() },
      error: null,
    });

    const outcome = await service.signInWithEmail(
      "parent@example.test",
      "raw-password",
    );

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "parent@example.test",
      password: "raw-password",
    });
    expect(outcome).toEqual({
      account: { id: "parent-id", email: "parent@example.test" },
    });
    expect(JSON.stringify(outcome)).not.toMatch(
      /raw-password|raw-access-token|raw-refresh-token/,
    );
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
  });

  it("returns one retryable safe error for rejected email credentials", async () => {
    const { auth, service } = setup();
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: new Error("backend credential detail"),
    });

    const outcome = await service.signInWithEmail("malformed", "raw-password");

    expect(outcome.account).toBeNull();
    expect(outcome.message).toMatch(/try again/i);
    expect(outcome.message).not.toMatch(/backend|raw-password/i);
  });

  it("completes Google OAuth through the exact app callback and PKCE exchange", async () => {
    const { auth, browser, service } = setup();
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://auth.example.test/authorize?provider=google" },
      error: null,
    });
    browser.openAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `${REDIRECT_URL}?code=disposable-code`,
    });
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: session() },
      error: null,
    });

    const outcome = await service.signInWithProvider("google");

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: REDIRECT_URL, skipBrowserRedirect: true },
    });
    expect(browser.openAuthSessionAsync).toHaveBeenCalledWith(
      "https://auth.example.test/authorize?provider=google",
      REDIRECT_URL,
    );
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("disposable-code");
    expect(outcome.account?.email).toBe("parent@example.test");
  });

  it.each(["cancel", "dismiss"])(
    "treats browser %s as cancellation without a rejection message",
    async (type) => {
      const { auth, browser, service } = setup();
      auth.signInWithOAuth.mockResolvedValue({
        data: { url: "https://auth.example.test/authorize?provider=apple" },
        error: null,
      });
      browser.openAuthSessionAsync.mockResolvedValue({ type });

      await expect(service.signInWithProvider("apple")).resolves.toEqual({
        account: null,
        cancelled: true,
      });
      expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    },
  );

  it("returns a safe provider failure and never claims success", async () => {
    const { auth, browser, service } = setup();
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new Error("provider disabled: client secret missing"),
    });

    const outcome = await service.signInWithProvider("apple");

    expect(outcome.account).toBeNull();
    expect(outcome.message).toMatch(/try again/i);
    expect(outcome.message).not.toMatch(/secret|provider disabled/i);
    expect(browser.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it("rejects foreign, provider-to-Supabase, missing, and fragment callbacks", async () => {
    const { auth, service } = setup();
    const callbacks = [
      "https://auth.example.test/auth/v1/callback?code=code",
      "household-tool-staging://auth/callback?code=code",
      `${REDIRECT_URL}`,
      `${REDIRECT_URL}#access_token=raw-access-token&refresh_token=raw-refresh-token`,
    ];

    for (const callback of callbacks) {
      const outcome = await service.completeOAuthCallback(callback);
      expect(outcome.account).toBeNull();
      expect(outcome.message).toMatch(/try again/i);
    }
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("restores and validates a current stored session", async () => {
    const { auth, service } = setup();
    auth.getSession.mockResolvedValue({
      data: { session: session() },
      error: null,
    });
    auth.getUser.mockResolvedValue({ data: { user: user() }, error: null });

    await expect(service.restoreSession()).resolves.toEqual({
      account: { id: "parent-id", email: "parent@example.test" },
    });
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it("clears an expired session when refresh fails", async () => {
    const { auth, clearStoredSession, service } = setup();
    auth.getSession.mockResolvedValue({
      data: { session: session(Math.floor(Date.now() / 1000) - 1) },
      error: null,
    });
    auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new Error("expired refresh token detail"),
    });
    auth.signOut.mockResolvedValue({ error: null });

    const outcome = await service.restoreSession();

    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(clearStoredSession).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({
      account: null,
      message: "Your session expired. Please sign in again.",
    });
  });

  it("signs out through Auth and always clears secure storage", async () => {
    const { auth, clearStoredSession, service } = setup();
    auth.signOut.mockResolvedValue({ error: null });

    await expect(service.signOut()).resolves.toEqual({
      account: null,
      message: undefined,
    });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(clearStoredSession).toHaveBeenCalledTimes(1);
  });
});
