import { describe, expect, it, vi } from "vitest";
import { signNitroToken, verifyNitroToken } from "../../server/utils/jwt.ts";
import { createMathCaptcha } from "../../server/utils/captcha.ts";
import { apiSuccessFields, errorMessage } from "../../server/utils/response.ts";

const authTestConfig = vi.hoisted(() => ({
  authTokenSecret: "test-secret",
  legacyTokenSecret: "test-secret",
  tokenExpireMinutes: 60,
}));

const authRedis = vi.hoisted(() => {
  const store = new Map();
  const client = {
    async set(key, value) {
      store.set(key, value);
      return "OK";
    },
    async get(key) {
      return store.get(key) ?? null;
    },
    async del(...keys) {
      return keys.reduce((count, key) => count + (store.delete(key) ? 1 : 0), 0);
    },
  };
  return { store, client };
});

vi.mock("../../server/utils/runtime.ts", () => ({
  getNitroServerConfig: () => authTestConfig,
}));
vi.mock("../../server/utils/redis.ts", () => ({
  getGarnet: () => authRedis.client,
}));

import { deleteAuthSession, getAuthSession, hasPermission, hasRole, saveAuthSession } from "../../server/utils/auth.ts";

describe("Nitro authentication primitives", () => {
  it("signs and verifies an HS512 token, rejecting tampering", () => {
    const token = signNitroToken("session-1", "test-secret", 10);
    expect(verifyNitroToken(token, "test-secret")?.login_user_key).toBe("session-1");

    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(verifyNitroToken(tampered, "test-secret")).toBeNull();
    expect(verifyNitroToken(token, "wrong-secret")).toBeNull();
  });

  it("creates a browser-renderable math captcha without exposing the answer in the image URL", () => {
    const captcha = createMathCaptcha();
    expect(captcha.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(captcha.code).toMatch(/^\d+$/);
    expect(captcha.image).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(Buffer.from(captcha.image, "base64").toString("utf8")).toContain("<svg");
  });

  it("allows the session layer to inspect an expired JWT only for Redis-backed renewal", () => {
    vi.useFakeTimers();
    const issuedAt = new Date("2026-08-08T00:00:00.000Z");
    vi.setSystemTime(issuedAt);
    const token = signNitroToken("session-renewal", "test-secret", 1);

    vi.setSystemTime(new Date(issuedAt.getTime() + 61 * 1000));
    expect(verifyNitroToken(token, "test-secret")).toBeNull();
    expect(verifyNitroToken(token, "test-secret", { allowExpired: true })?.login_user_key).toBe("session-renewal");
    vi.useRealTimers();
  });

  it("keeps legacy top-level success fields in valid Chinese response format", () => {
    expect(apiSuccessFields({ token: "redacted" })).toEqual({ code: 200, msg: "操作成功", token: "redacted" });
  });

  it("redacts credentials from plain-text, JSON-like, and URL errors", () => {
    const safe = errorMessage(new Error('password=secret token: abc "appSecret":"hidden" mysql://user:pass@example.test/db'));
    expect(safe).not.toContain("secret");
    expect(safe).not.toContain("abc");
    expect(safe).not.toContain("hidden");
    expect(safe).not.toContain("user:pass");
    expect(safe).toContain("[redacted]");
  });

  it("enforces role and permission matching with wildcard support", () => {
    const session = {
      userId: 2,
      roles: ["warehouse"],
      permissions: ["tk_custom:kingdee:*"],
    };
    expect(hasRole(session, "warehouse")).toBe(true);
    expect(hasRole(session, "admin")).toBe(false);
    expect(hasPermission(session, "tk_custom:kingdee:query")).toBe(true);
    expect(hasPermission(session, "system:user:list")).toBe(false);
    expect(hasRole({ ...session, userId: 1 }, "admin")).toBe(true);
    expect(hasPermission({ ...session, userId: 1 }, "system:user:list")).toBe(true);
  });

  it("revokes both Nitro and Java-compatibility session records on logout", async () => {
    const tokenId = "session-revocation";
    const token = signNitroToken(tokenId, "test-secret", 60);
    const user = {
      userId: 2,
      deptId: null,
      userName: "test-user",
      nickName: "Test User",
      roles: [],
    };
    await saveAuthSession({
      version: 1,
      tokenId,
      userId: user.userId,
      deptId: user.deptId,
      userName: user.userName,
      roles: [],
      permissions: [],
      user,
      loginTime: Date.now(),
      expireTime: Date.now() + 60 * 60 * 1000,
    });

    const event = {
      node: {
        req: { headers: { authorization: `Bearer ${token}`, cookie: "" }, socket: {} },
        res: { setHeader() {} },
      },
    };
    expect((await getAuthSession(event))?.session.tokenId).toBe(tokenId);
    expect(authRedis.store.has(`auth_sessions:${tokenId}`)).toBe(true);
    expect(authRedis.store.has(`login_tokens:${tokenId}`)).toBe(true);

    await deleteAuthSession(tokenId);
    expect(await getAuthSession(event)).toBeNull();
    expect(authRedis.store.has(`auth_sessions:${tokenId}`)).toBe(false);
    expect(authRedis.store.has(`login_tokens:${tokenId}`)).toBe(false);
  });
});
