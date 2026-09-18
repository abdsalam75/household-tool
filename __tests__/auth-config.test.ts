import { readPublicAuthConfig } from "../src/auth/config";

function jwtForRole(role: string) {
  return `header.${btoa(JSON.stringify({ role }))}.signature`;
}

describe("mobile public Auth configuration", () => {
  it.each([
    ["local", "http://localhost:8000", "household-tool-local://auth/callback"],
    [
      "staging",
      "https://staging-auth.example.test",
      "household-tool-staging://auth/callback",
    ],
    [
      "production",
      "https://production-auth.example.test",
      "household-tool://auth/callback",
    ],
  ])("uses the #6 %s callback", (environment, url, redirectUrl) => {
    expect(
      readPublicAuthConfig({
        EXPO_PUBLIC_APP_ENV: environment,
        EXPO_PUBLIC_SUPABASE_URL: url,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: jwtForRole("anon"),
      }),
    ).toMatchObject({ environment, supabaseUrl: url, redirectUrl });
  });

  it("rejects service-role/secret keys and insecure deployed URLs", () => {
    const base = {
      EXPO_PUBLIC_APP_ENV: "production",
      EXPO_PUBLIC_SUPABASE_URL: "https://auth.example.test",
    };

    expect(() =>
      readPublicAuthConfig({
        ...base,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: jwtForRole("service_role"),
      }),
    ).toThrow(/service-role/);
    expect(() =>
      readPublicAuthConfig({
        ...base,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_disposable",
      }),
    ).toThrow(/service-role/);
    expect(() =>
      readPublicAuthConfig({
        ...base,
        EXPO_PUBLIC_SUPABASE_URL: "http://auth.example.test",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: jwtForRole("anon"),
      }),
    ).toThrow(/not allowed/);
  });
});
