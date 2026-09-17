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

  it("keeps the Compose topology pinned, private, persistent, and health-gated", () => {
    const compose = readFileSync("infra/supabase/docker-compose.yml", "utf8");
    const caddy = readFileSync(
      "infra/supabase/docker-compose.caddy.yml",
      "utf8",
    );
    const operatorGuide = readFileSync("infra/supabase/README.md", "utf8");

    const services = [
      "studio",
      "api-gw",
      "auth",
      "rest",
      "realtime",
      "storage",
      "imgproxy",
      "meta",
      "functions",
      "db",
      "supavisor",
    ];
    for (const [index, service] of services.entries()) {
      const start = compose.indexOf(`\n  ${service}:`);
      const nextStarts = services
        .slice(index + 1)
        .map((name) => compose.indexOf(`\n  ${name}:`, start + 1))
        .filter((position) => position !== -1);
      const end =
        nextStarts.length > 0
          ? Math.min(...nextStarts)
          : compose.indexOf("\nvolumes:", start);
      expect(start).not.toBe(-1);
      expect(compose.slice(start, end)).toContain("\n    healthcheck:");
    }

    const images = [
      ...`${compose}\n${caddy}`.matchAll(/^\s+image:\s*(\S+)/gm),
    ].map(([, image]) => image);
    expect(images).toHaveLength(12);
    expect(images.every((image) => /:[^:$]+$/.test(image))).toBe(true);
    expect(images.every((image) => !image.endsWith(":latest"))).toBe(true);

    expect(compose).toContain("condition: service_healthy");
    expect(compose).not.toContain("condition: service_started");
    expect(compose).toContain("postgres-data:/var/lib/postgresql/data");
    expect(compose).toContain("storage-data:/var/lib/storage");
    expect(caddy).toContain('      - "80:80"');
    expect(caddy).toContain('      - "443:443"');
    expect(operatorGuide).toContain("8c7a4d9dbbaf8b552893822e89d7bf06f33f9220");
  });
});
