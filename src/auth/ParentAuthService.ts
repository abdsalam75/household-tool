import type { Session, User } from "@supabase/supabase-js";

import type { AuthOutcome, ParentAccount, Provider } from "./types";

type SessionResult = {
  data: { session: Session | null };
  error: Error | null;
};

type UserResult = {
  data: { user: User | null };
  error: Error | null;
};

export type AuthClient = {
  signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<SessionResult>;
  signInWithOAuth(options: {
    provider: Provider;
    options: { redirectTo: string; skipBrowserRedirect: boolean };
  }): Promise<{ data: { url: string | null }; error: Error | null }>;
  exchangeCodeForSession(code: string): Promise<SessionResult>;
  getSession(): Promise<SessionResult>;
  refreshSession(): Promise<SessionResult>;
  getUser(): Promise<UserResult>;
  signOut(options?: { scope?: "global" | "local" | "others" }): Promise<{
    error: Error | null;
  }>;
};

export type AuthBrowser = {
  openAuthSessionAsync(
    authorizationUrl: string,
    redirectUrl: string,
  ): Promise<{ type: string; url?: string }>;
};

const EMAIL_ERROR =
  "We couldn’t sign you in. Check your email, password, and confirmation, then try again.";
const OAUTH_ERROR = "We couldn’t complete sign-in. Please try again.";
const SESSION_ERROR = "Your session expired. Please sign in again.";

function accountFromUser(user: User): ParentAccount {
  return { id: user.id, email: user.email ?? null };
}

function accountFromSession(session: Session): ParentAccount | null {
  return session.user ? accountFromUser(session.user) : null;
}

export class ParentAuthService {
  constructor(
    private readonly auth: AuthClient,
    private readonly browser: AuthBrowser,
    private readonly redirectUrl: string,
    private readonly clearStoredSession: () => Promise<void>,
  ) {}

  isAuthCallback(url: string): boolean {
    try {
      const actual = new URL(url);
      const expected = new URL(this.redirectUrl);
      return (
        actual.protocol === expected.protocol &&
        actual.hostname === expected.hostname &&
        actual.port === expected.port &&
        actual.pathname === expected.pathname &&
        actual.username === "" &&
        actual.password === ""
      );
    } catch {
      return false;
    }
  }

  async signInWithEmail(email: string, password: string): Promise<AuthOutcome> {
    if (!email || !password) return { account: null, message: EMAIL_ERROR };

    try {
      const { data, error } = await this.auth.signInWithPassword({
        email,
        password,
      });
      const account = data.session ? accountFromSession(data.session) : null;
      if (error || !account) return { account: null, message: EMAIL_ERROR };
      return { account };
    } catch {
      return { account: null, message: EMAIL_ERROR };
    }
  }

  async signInWithProvider(provider: Provider): Promise<AuthOutcome> {
    try {
      const { data, error } = await this.auth.signInWithOAuth({
        provider,
        options: { redirectTo: this.redirectUrl, skipBrowserRedirect: true },
      });
      if (error || !data.url) return { account: null, message: OAUTH_ERROR };

      const browserResult = await this.browser.openAuthSessionAsync(
        data.url,
        this.redirectUrl,
      );
      if (browserResult.type === "cancel" || browserResult.type === "dismiss") {
        return { account: null, cancelled: true };
      }
      if (browserResult.type !== "success" || !browserResult.url) {
        return { account: null, message: OAUTH_ERROR };
      }

      return this.completeOAuthCallback(browserResult.url);
    } catch {
      return { account: null, message: OAUTH_ERROR };
    }
  }

  async completeOAuthCallback(url: string): Promise<AuthOutcome> {
    if (!this.isAuthCallback(url)) {
      return { account: null, message: OAUTH_ERROR };
    }

    let callback: URL;
    try {
      callback = new URL(url);
    } catch {
      return { account: null, message: OAUTH_ERROR };
    }

    if (
      callback.searchParams.has("error") ||
      callback.searchParams.has("error_code")
    ) {
      return { account: null, message: OAUTH_ERROR };
    }

    const code = callback.searchParams.get("code");
    if (!code || callback.hash) {
      return { account: null, message: OAUTH_ERROR };
    }

    try {
      const { data, error } = await this.auth.exchangeCodeForSession(code);
      const account = data.session ? accountFromSession(data.session) : null;
      if (error || !account) return { account: null, message: OAUTH_ERROR };
      return { account };
    } catch {
      return { account: null, message: OAUTH_ERROR };
    }
  }

  async restoreSession(): Promise<AuthOutcome> {
    try {
      let { data, error } = await this.auth.getSession();
      if (error) return this.clearInvalidSession();
      if (!data.session) return { account: null };

      if (
        !data.session.expires_at ||
        data.session.expires_at <= Math.floor(Date.now() / 1000)
      ) {
        ({ data, error } = await this.auth.refreshSession());
        if (error || !data.session) return this.clearInvalidSession();
      }

      const validation = await this.auth.getUser();
      if (validation.error || !validation.data.user) {
        return this.clearInvalidSession();
      }

      return { account: accountFromUser(validation.data.user) };
    } catch {
      return this.clearInvalidSession();
    }
  }

  async signOut(): Promise<AuthOutcome> {
    let remoteFailed = false;
    try {
      const { error } = await this.auth.signOut({ scope: "global" });
      remoteFailed = Boolean(error);
    } catch {
      remoteFailed = true;
    }

    await this.removeStoredSession();
    return {
      account: null,
      message: remoteFailed
        ? "You’re signed out on this device. Please try again later to finish signing out everywhere."
        : undefined,
    };
  }

  private async clearInvalidSession(): Promise<AuthOutcome> {
    try {
      await this.auth.signOut({ scope: "local" });
    } catch {
      // Secure storage is still cleared below.
    }
    await this.removeStoredSession();
    return { account: null, message: SESSION_ERROR };
  }

  private async removeStoredSession() {
    try {
      await this.clearStoredSession();
    } catch {
      // The app still transitions to signed out and never reuses this client session.
    }
  }
}
