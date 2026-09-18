import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import process from "process";

describe("Supabase parent authentication configuration", () => {
  const compose = readFileSync("infra/supabase/docker-compose.yml", "utf8");
  const template = readFileSync("infra/supabase/.env.example", "utf8");

  it("wires email, Google, and Apple while keeping unsafe methods disabled", () => {
    const requiredWiring = [
      "GOTRUE_EXTERNAL_EMAIL_ENABLED: ${ENABLE_EMAIL_SIGNUP}",
      "GOTRUE_MAILER_AUTOCONFIRM: ${ENABLE_EMAIL_AUTOCONFIRM}",
      "GOTRUE_EXTERNAL_GOOGLE_ENABLED: ${GOOGLE_ENABLED:-false}",
      "GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}",
      "GOTRUE_EXTERNAL_GOOGLE_SECRET: ${GOOGLE_SECRET:-}",
      "GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: ${GOOGLE_REDIRECT_URI:-${API_EXTERNAL_URL}/callback}",
      "GOTRUE_EXTERNAL_APPLE_ENABLED: ${APPLE_ENABLED:-false}",
      "GOTRUE_EXTERNAL_APPLE_CLIENT_ID: ${APPLE_CLIENT_ID:-}",
      "GOTRUE_EXTERNAL_APPLE_SECRET: ${APPLE_SECRET:-}",
      "GOTRUE_EXTERNAL_APPLE_REDIRECT_URI: ${APPLE_REDIRECT_URI:-${API_EXTERNAL_URL}/callback}",
      "GOTRUE_EXTERNAL_IOS_BUNDLE_ID: ${APPLE_BUNDLE_ID:-}",
    ];
    for (const setting of requiredWiring) expect(compose).toContain(setting);

    expect(template).toMatch(/^ENABLE_EMAIL_SIGNUP=true$/m);
    expect(template).toMatch(/^ENABLE_EMAIL_AUTOCONFIRM=false$/m);
    expect(template).toMatch(/^ENABLE_ANONYMOUS_USERS=false$/m);
    expect(template).toMatch(/^ENABLE_PHONE_SIGNUP=false$/m);
    expect(template).toMatch(/^ENABLE_PHONE_AUTOCONFIRM=false$/m);
    expect(template).toMatch(/^GOOGLE_ENABLED=false$/m);
    expect(template).toMatch(/^APPLE_ENABLED=false$/m);
  });

  it("resolves disposable provider values through Compose without missing Auth variables", () => {
    const directory = mkdtempSync(join(tmpdir(), "household-auth-config-"));
    const environmentFile = join(directory, ".env");
    try {
      execFileSync(
        "bash",
        ["scripts/create-supabase-env.sh", environmentFile],
        {
          stdio: "pipe",
        },
      );
      const environment = {
        ...process.env,
        GOOGLE_ENABLED: "true",
        GOOGLE_CLIENT_ID: "disposable-google-client.apps.invalid",
        GOOGLE_SECRET: "disposable-google-secret",
        GOOGLE_REDIRECT_URI: "http://localhost:8000/auth/v1/callback",
        APPLE_ENABLED: "true",
        APPLE_CLIENT_ID:
          "com.invalid.household.web,com.invalid.household.native",
        APPLE_SECRET: "disposable-apple-secret",
        APPLE_BUNDLE_ID: "com.invalid.household.native",
        APPLE_REDIRECT_URI: "http://localhost:8000/auth/v1/callback",
      };
      const resolved = JSON.parse(
        execFileSync(
          "docker",
          [
            "compose",
            "--env-file",
            environmentFile,
            "-f",
            "infra/supabase/docker-compose.yml",
            "config",
            "--format",
            "json",
          ],
          { encoding: "utf8", env: environment },
        ),
      );
      const auth = resolved.services.auth.environment;
      expect(auth.GOTRUE_EXTERNAL_GOOGLE_ENABLED).toBe("true");
      expect(auth.GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID).toBe(
        "disposable-google-client.apps.invalid",
      );
      expect(auth.GOTRUE_EXTERNAL_APPLE_ENABLED).toBe("true");
      expect(auth.GOTRUE_EXTERNAL_APPLE_CLIENT_ID).toBe(
        "com.invalid.household.web,com.invalid.household.native",
      );
      expect(auth.GOTRUE_EXTERNAL_IOS_BUNDLE_ID).toBe(
        "com.invalid.household.native",
      );
      expect(auth.GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI).toBe(
        `${auth.API_EXTERNAL_URL}/callback`,
      );
      expect(auth.GOTRUE_EXTERNAL_APPLE_REDIRECT_URI).toBe(
        `${auth.API_EXTERNAL_URL}/callback`,
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("tracks no usable provider, SMTP, private-key, or test-account secret", () => {
    const value = (key) =>
      template.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1];
    expect(value("GOOGLE_CLIENT_ID")).toBe("");
    expect(value("GOOGLE_SECRET")).toBe("");
    expect(value("GOOGLE_REDIRECT_URI")).toBe("");
    expect(value("APPLE_CLIENT_ID")).toBe("");
    expect(value("APPLE_SECRET")).toBe("");
    expect(value("APPLE_BUNDLE_ID")).toBe("");
    expect(value("APPLE_REDIRECT_URI")).toBe("");
    expect(value("SMTP_ADMIN_EMAIL")).toBe("SET_OUTSIDE_GIT");
    expect(value("SMTP_HOST")).toBe("SET_OUTSIDE_GIT");
    expect(value("SMTP_USER")).toBe("SET_OUTSIDE_GIT");
    expect(value("SMTP_PASS")).toBe(
      "GENERATE_WITH_scripts_create_supabase_env_sh",
    );

    const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
      encoding: "utf8",
    })
      .split("\0")
      .filter((path) => path && existsSync(path));
    const issueFiles = [
      "__tests__/supabase-auth.test.js",
      "infra/supabase/AUTH.md",
      "infra/supabase/auth-validation.md",
      "infra/supabase/docker-compose.auth-test.yml",
      "scripts/check-real-auth-provider.sh",
      "scripts/test-supabase-auth.sh",
    ];
    const allFiles = [...new Set([...trackedFiles, ...issueFiles])];
    const trackedContents = allFiles
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(trackedContents).not.toMatch(
      /-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/,
    );
    expect(trackedContents).not.toMatch(/GOCSPX-[A-Za-z0-9_-]{20,}/);
    const forbiddenTestPassword = ["disposable", "parent", "password"].join(
      "-",
    );
    expect(trackedContents).not.toContain(forbiddenTestPassword);
  });

  it("documents provider consoles, environment redirects, and exact checks", () => {
    const guide = readFileSync("infra/supabase/AUTH.md", "utf8");
    const record = readFileSync("infra/supabase/auth-validation.md", "utf8");
    for (const phrase of [
      "## Redirect matrix",
      "## Google Cloud setup",
      "## Apple Developer setup",
      "Services ID first",
      "./scripts/test-supabase-auth.sh",
      "./scripts/check-real-auth-provider.sh google",
      "./scripts/check-real-auth-provider.sh apple",
      "household-tool-local://invite/*",
    ]) {
      expect(guide).toContain(phrase);
    }
    for (const phrase of [
      "## Email/password",
      "## Google",
      "## Apple",
      "BLOCKED",
      "2026-09-18",
    ]) {
      expect(record).toContain(phrase);
    }
  });
});
