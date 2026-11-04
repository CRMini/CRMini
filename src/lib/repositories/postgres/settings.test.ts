import { beforeEach, describe, expect, it, vi } from "vitest";

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock("./connection", () => ({
  getPostgresPool: () => ({ query: poolQuery }),
}));

import { getUserName, saveUserName } from "./settings";

beforeEach(() => {
  poolQuery.mockReset();
});

describe("settings no PostgreSQL", () => {
  it("devolve null quando a preferência não existe", async () => {
    poolQuery.mockResolvedValue({ rows: [] });

    await expect(getUserName()).resolves.toBeNull();
    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining("$1"), [
      "user_name",
    ]);
  });

  it("devolve o valor configurado", async () => {
    poolQuery.mockResolvedValue({ rows: [{ value: "Ana" }] });

    await expect(getUserName()).resolves.toBe("Ana");
  });

  it("grava com UPSERT parametrizado", async () => {
    poolQuery.mockResolvedValue({ rows: [] });

    await saveUserName("Ana");

    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (key) DO UPDATE");
    expect(params).toEqual(["user_name", "Ana"]);
  });

  it("remove a preferência quando o nome é vazio", async () => {
    poolQuery.mockResolvedValue({ rows: [] });

    await saveUserName(null);

    expect(poolQuery).toHaveBeenCalledWith(
      "DELETE FROM app_settings WHERE key = $1",
      ["user_name"],
    );
  });
});
