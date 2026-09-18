import { readFileSync, readdirSync } from "fs";

describe("Supabase database migrations", () => {
  const script = readFileSync("scripts/apply-supabase-migrations.sh", "utf8");
  const guide = readFileSync("infra/supabase/README.md", "utf8");
  const migrationDirectory = "infra/supabase/migrations";

  it("keeps migrations as ordered plain SQL with a non-product starter", () => {
    const migrations = readdirSync(migrationDirectory).sort();
    expect(migrations).toEqual([
      "20260918000000_create_app_private_schema.sql",
    ]);
    expect(migrations[0]).toMatch(/^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/);

    const starter = readFileSync(
      `${migrationDirectory}/${migrations[0]}`,
      "utf8",
    );
    expect(starter.trim()).toBe("CREATE SCHEMA app_private;");
    expect(starter).not.toMatch(
      /create\s+table|household|membership|authorization/i,
    );
  });

  it("uses the in-container client and applies migration plus history atomically", () => {
    expect(script).toContain("exec -T db psql");
    expect(script).toContain("--no-password");
    expect(script).toContain("BEGIN;");
    expect(script).toContain("INSERT INTO public.schema_migrations");
    expect(script).toContain("COMMIT;");
    expect(script).toContain("applied migrations are immutable");
    expect(script).toContain("later migrations were not run");
    expect(script).not.toContain("--password");
  });

  it("documents creation, inspection, immutability, and disposable checks", () => {
    expect(guide).toContain("## Application database migrations");
    expect(guide).toContain("YYYYMMDDHHMMSS_lowercase_words.sql");
    expect(guide).toContain("./scripts/apply-supabase-migrations.sh");
    expect(guide).toContain("public.schema_migrations");
    expect(guide).toContain("to_regnamespace('app_private')");
    expect(guide).toContain("COMPOSE_PROJECT_NAME=household-migrations-check");
    expect(guide).toContain("Never edit the database schema directly");
  });
});
