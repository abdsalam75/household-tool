export type Provider = "google" | "apple";

export type AuthAction = Provider | "email" | "callback" | "signout";

export type ParentAccount = {
  id: string;
  email: string | null;
};

export type AuthOutcome = {
  account: ParentAccount | null;
  message?: string;
  cancelled?: boolean;
};

export type ParentAuthService = {
  restoreSession(): Promise<AuthOutcome>;
  signInWithEmail(email: string, password: string): Promise<AuthOutcome>;
  signInWithProvider(provider: Provider): Promise<AuthOutcome>;
  completeOAuthCallback(url: string): Promise<AuthOutcome>;
  isAuthCallback(url: string): boolean;
  signOut(): Promise<AuthOutcome>;
};
