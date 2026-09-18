export type AppEnvironment = "local" | "staging" | "production";

export type PublicAuthConfig = {
  environment: AppEnvironment;
  supabaseUrl: string;
  supabaseAnonKey: string;
  redirectUrl: string;
};

const CALLBACKS: Record<AppEnvironment, string> = {
  local: "household-tool-local://auth/callback",
  staging: "household-tool-staging://auth/callback",
  production: "household-tool://auth/callback",
};

function isEnvironment(value: string | undefined): value is AppEnvironment {
  return value === "local" || value === "staging" || value === "production";
}

function decodeJwtRole(key: string): string | undefined {
  const payload = key.split(".")[1];
  if (!payload || typeof globalThis.atob !== "function") return undefined;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(
      globalThis.atob(
        normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="),
      ),
    ) as unknown;
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      "role" in decoded &&
      typeof decoded.role === "string"
    ) {
      return decoded.role;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function readPublicAuthConfig(
  environment: Record<string, string | undefined>,
): PublicAuthConfig {
  const appEnvironment = environment.EXPO_PUBLIC_APP_ENV;
  const supabaseUrl = environment.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = environment.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!isEnvironment(appEnvironment) || !supabaseUrl || !supabaseAnonKey) {
    throw new Error("Public Auth configuration is incomplete");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("Public Auth URL is invalid");
  }

  const isLoopback =
    parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
  const validTransport =
    parsedUrl.protocol === "https:" ||
    (appEnvironment === "local" &&
      parsedUrl.protocol === "http:" &&
      isLoopback);

  if (
    !validTransport ||
    parsedUrl.username ||
    parsedUrl.password ||
    (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "") ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error("Public Auth URL is not allowed");
  }

  if (
    supabaseAnonKey.startsWith("sb_secret_") ||
    decodeJwtRole(supabaseAnonKey) === "service_role"
  ) {
    throw new Error("A service-role key cannot be used by the mobile app");
  }

  return {
    environment: appEnvironment,
    supabaseUrl: parsedUrl.toString().replace(/\/$/, ""),
    supabaseAnonKey,
    redirectUrl: CALLBACKS[appEnvironment],
  };
}

export function readExpoPublicAuthConfig(): PublicAuthConfig {
  return readPublicAuthConfig({
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  });
}
