import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pool: { query: vi.fn() },
}));

vi.mock("../../server/utils/mysql.ts", () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}));

import { getUserMenuIds, getUserPermissions } from "../../server/utils/user-repository.ts";

describe("Nitro user permission queries", () => {
  beforeEach(() => {
    state.pool.query.mockReset();
  });

  it("loads page and function permissions while keeping function IDs out of page menus", async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ perms: "tk_custom:quotation:list" }, { perms: "tk_custom:quotation:initialReview" }], []])
      .mockResolvedValueOnce([[{ menu_id: 2200 }], []]);

    await expect(getUserPermissions(7)).resolves.toEqual([
      "tk_custom:quotation:list",
      "tk_custom:quotation:initialReview",
    ]);
    await expect(getUserMenuIds(7)).resolves.toEqual([2200]);

    expect(state.pool.query.mock.calls[0][0].sql).toContain("m.menu_type IN ('M', 'C', 'F')");
    expect(state.pool.query.mock.calls[1][0].sql).toContain("m.menu_type IN ('M', 'C')");
    expect(state.pool.query.mock.calls[1][0].sql).not.toContain("'F'");
  });
});
