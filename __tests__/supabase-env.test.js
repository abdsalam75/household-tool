import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("Supabase local environment generation", () => {
  it("keeps the tracked template non-secret and generates the MinIO password", () => {
    const template = readFileSync("infra/supabase/.env.example", "utf8");
    expect(template).toContain(
      "MINIO_ROOT_PASSWORD=GENERATE_WITH_scripts_create_supabase_env_sh",
    );
    expect(template).not.toContain("MINIO_ROOT_PASSWORD=secret1234");

    const directory = mkdtempSync(join(tmpdir(), "household-supabase-env-"));
    const environmentFile = join(directory, ".env");
    try {
      execFileSync(
        "bash",
        ["scripts/create-supabase-env.sh", environmentFile],
        {
          stdio: "pipe",
        },
      );
      const environment = readFileSync(environmentFile, "utf8");
      const password = environment.match(/^MINIO_ROOT_PASSWORD=(.+)$/m)?.[1];
      expect(password).toMatch(/^[a-f0-9]{64}$/);
      expect(password).not.toBe("secret1234");
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
