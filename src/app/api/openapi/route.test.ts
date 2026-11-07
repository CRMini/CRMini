import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("GET /api/openapi", () => {
  it("serve a especificação em JSON sem cache quando habilitado", async () => {
    process.env.NODE_ENV = "development";

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(body.openapi).toBe("3.1.0");
    expect(Object.keys(body.paths).sort()).toEqual(
      [
        "/api/cep",
        "/api/clients",
        "/api/clients/{id}",
        "/api/company/from-site",
        "/api/contacts",
        "/api/contacts/{id}",
        "/api/contacts/import",
        "/api/events",
        "/api/events/{id}",
        "/api/logo",
        "/api/logo/from-site",
        "/api/logo/{name}",
        "/api/opportunities",
        "/api/opportunities/{id}",
        "/api/settings",
        "/api/tasks",
        "/api/tasks/{id}",
      ].sort(),
    );
  });

  it("responde 404 em produção", async () => {
    process.env.NODE_ENV = "production";

    const response = await GET();

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: "Documentação da API indisponível.",
    });
  });
});
