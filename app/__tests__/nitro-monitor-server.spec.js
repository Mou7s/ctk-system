import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
}));

vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
}));

globalThis.defineEventHandler = (handler) => handler;

describe("Nitro monitor server route", () => {
  let handler;

  beforeAll(async () => {
    handler = (await import("../../server/routes/prod-api/monitor/server.get.ts")).default;
  });

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } };
  });

  it("requires an authenticated session", async () => {
    state.authenticated = null;
    await expect(handler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
  });

  it("returns the Java-compatible monitor groups", async () => {
    const result = await handler({});
    expect(result.code).toBe(200);
    expect(result.data).toEqual(expect.objectContaining({
      cpu: expect.objectContaining({ cpuNum: expect.any(Number), used: expect.any(Number) }),
      mem: expect.objectContaining({ total: expect.any(Number), usage: expect.any(Number) }),
      jvm: expect.objectContaining({ name: "Node.js", version: expect.any(String), runTime: expect.any(String) }),
      sys: expect.objectContaining({ computerName: expect.any(String), osName: expect.any(String) }),
      sysFiles: expect.any(Array),
    }));
  });
});
