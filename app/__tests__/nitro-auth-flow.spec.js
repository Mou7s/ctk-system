import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const redis = new Map();
  const fakeRedis = {
    async set(key, value) {
      if (state.redisFailure) throw new Error("redis://user:secret@example.test:6379/0");
      redis.set(key, value);
      return "OK";
    },
    async get(key) {
      if (state.redisFailure) throw new Error("redis://user:secret@example.test:6379/0");
      return redis.get(key) ?? null;
    },
    async del(...keys) {
      if (state.redisFailure) throw new Error("redis://user:secret@example.test:6379/0");
      return keys.reduce((count, key) => count + (redis.delete(key) ? 1 : 0), 0);
    },
  };

  return {
    body: {
      username: "test-user",
      password: "safe-test-password",
      code: "",
      uuid: "",
    },
    headers: {},
    redis,
    fakeRedis,
    records: {
      loginInfo: vi.fn(),
      userLogin: vi.fn(),
      setCookie: vi.fn(),
      deleteCookie: vi.fn(),
      setResponseHeader: vi.fn(),
    },
    config: {
      authTokenSecret: "test-secret",
      legacyTokenSecret: "test-secret",
      tokenExpireMinutes: 60,
    },
    captchaEnabled: false,
    redisFailure: false,
  };
});

vi.mock("bcryptjs", () => ({
  compare: vi.fn(async () => true),
}));

vi.mock("h3", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readBody: vi.fn(async () => state.body),
    getHeader: vi.fn((_event, name) => state.headers[String(name).toLowerCase()] || ""),
    getRequestIP: vi.fn(() => "127.0.0.1"),
    setCookie: state.records.setCookie,
    deleteCookie: state.records.deleteCookie,
    setResponseHeader: state.records.setResponseHeader,
    getCookie: vi.fn(() => undefined),
  };
});

vi.mock("../../server/utils/redis.ts", () => ({
  getGarnet: () => state.fakeRedis,
}));

vi.mock("../../server/utils/runtime.ts", () => ({
  getNitroServerConfig: () => state.config,
}));

vi.mock("../../server/utils/user-repository.ts", () => ({
  findUserByUsername: vi.fn(async () => ({
    userId: 2,
    deptId: null,
    userName: "test-user",
    nickName: "Test User",
    email: null,
    phonenumber: null,
    sex: null,
    avatar: null,
    password: "hashed-password",
    status: "0",
    delFlag: "0",
    roles: [],
  })),
  getConfigValue: vi.fn(async (key) => ({
    "sys.account.captchaEnabled": state.captchaEnabled ? "true" : "false",
    "user.password.maxRetryCount": "5",
    "user.password.lockTime": "10",
  }[key] ?? null)),
  getUserPermissions: vi.fn(async () => []),
  getUserMenuIds: vi.fn(async () => [2054, 2189]),
  getUserRoleKeys: vi.fn(async () => []),
  recordLoginInfo: state.records.loginInfo,
  recordUserLogin: state.records.userLogin,
}));

vi.mock("../../server/utils/mysql.ts", () => ({
  getMysqlPool: vi.fn(() => {
    throw new Error("mysql://user:secret@example.test/app");
  }),
}));

globalThis.defineEventHandler = (handler) => handler;

describe("Nitro login and logout flow", () => {
  let loginHandler;
  let logoutHandler;
  let getAuthSession;
  let getInfoHandler;
  let captchaHandler;
  let wmsOverviewHandler;

  beforeAll(async () => {
    loginHandler = (await import("../../server/routes/prod-api/login.post.ts")).default;
    logoutHandler = (await import("../../server/routes/prod-api/logout.post.ts")).default;
    ({ getAuthSession } = await import("../../server/utils/auth.ts"));
    getInfoHandler = (await import("../../server/routes/prod-api/getInfo.get.ts")).default;
    captchaHandler = (await import("../../server/routes/prod-api/captchaImage.get.ts")).default;
    wmsOverviewHandler = (await import("../../server/routes/prod-api/tk_custom/wmsStructure/overview.get.ts")).default;
  });

  beforeEach(() => {
    state.redis.clear();
    state.headers = {};
    state.captchaEnabled = false;
    state.redisFailure = false;
    state.body.code = "";
    state.body.uuid = "";
    state.records.loginInfo.mockClear();
    state.records.userLogin.mockClear();
    state.records.setCookie.mockClear();
    state.records.deleteCookie.mockClear();
    state.records.setResponseHeader.mockClear();
  });

  it("creates Nitro and Java-compatible sessions, then revokes both on logout", async () => {
    state.captchaEnabled = true;
    const captchaResult = await captchaHandler({ node: { req: {}, res: {} } });
    expect(captchaResult).toMatchObject({ code: 200, msg: "操作成功", captchaEnabled: true });
    expect(captchaResult.uuid).toEqual(expect.any(String));
    expect(captchaResult.img).toEqual(expect.any(String));
    const captchaKey = `captcha_codes:${captchaResult.uuid}`;
    const captchaAnswer = state.redis.get(captchaKey);
    expect(captchaAnswer).toEqual(expect.any(String));
    state.body.uuid = captchaResult.uuid;
    state.body.code = captchaAnswer;

    const loginResult = await loginHandler({ node: { req: {}, res: {} } });
    expect(loginResult.code).toBe(200);
    expect(loginResult.msg).toBe("操作成功");
    expect(loginResult.token).toEqual(expect.any(String));
    expect(state.redis.has(captchaKey)).toBe(false);
    expect(state.redis.size).toBe(2);
    expect(state.records.setCookie).toHaveBeenCalledWith(
      expect.anything(),
      "Admin-Token",
      loginResult.token,
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
    expect(state.records.userLogin).toHaveBeenCalledTimes(1);
    expect(state.records.loginInfo).toHaveBeenCalledWith(
      "test-user",
      "0",
      "登录成功",
      "127.0.0.1",
      "",
    );

    state.headers.authorization = `Bearer ${loginResult.token}`;
    const infoResult = await getInfoHandler({ node: { req: {}, res: {} } });
    expect(infoResult.code).toBe(200);
    expect(infoResult.user.userName).toBe("test-user");
    expect(infoResult.user).not.toHaveProperty("password");
    expect(infoResult.roles).toEqual(["ROLE_DEFAULT"]);
    expect(infoResult.permissions).toEqual([]);
    expect(infoResult.menuIds).toEqual([2054, 2189]);
    expect(infoResult.isDefaultPassword).toBe(true);

    const sessionKey = [...state.redis.keys()].find((key) => key.startsWith("auth_sessions:"));
    const session = JSON.parse(state.redis.get(sessionKey));
    session.expireTime = Date.now() + 5 * 60 * 1000;
    state.redis.set(sessionKey, JSON.stringify(session));

    const refreshed = await getAuthSession({ node: { req: {}, res: {} } });
    expect(refreshed?.token).toEqual(expect.any(String));
    expect(state.records.setCookie).toHaveBeenCalledTimes(2);
    expect(state.records.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "x-nitro-token",
      refreshed.token,
    );

    state.headers.authorization = `Bearer ${refreshed.token}`;
    const logoutResult = await logoutHandler({ node: { req: {}, res: {} } });
    expect(logoutResult).toEqual({ code: 200, msg: "退出成功" });
    expect(state.redis.size).toBe(0);
    expect(state.records.deleteCookie).toHaveBeenCalledWith(expect.anything(), "Admin-Token", { path: "/" });
    expect(state.records.loginInfo).toHaveBeenCalledWith(
      "test-user",
      "0",
      "退出成功",
      "127.0.0.1",
      "",
    );
  });

  it("returns explicit dependency errors without exposing connection details", async () => {
    state.captchaEnabled = true;
    state.redisFailure = true;
    const captchaResult = await captchaHandler({ node: { req: {}, res: {} } });
    expect(captchaResult).toEqual({ code: 500, msg: "验证码服务暂不可用" });

    state.redisFailure = false;
    state.captchaEnabled = false;
    const loginResult = await loginHandler({ node: { req: {}, res: {} } });
    state.headers.authorization = `Bearer ${loginResult.token}`;
    const mysqlResult = await wmsOverviewHandler({ node: { req: {}, res: {} } });
    expect(mysqlResult).toEqual({ code: 500, msg: "获取仓库结构失败" });
  });

  it("rolls back both session records when login audit writing fails", async () => {
    state.records.loginInfo.mockImplementationOnce(async () => {
      throw new Error("mysql://user:secret@example.test/app");
    });

    const loginResult = await loginHandler({ node: { req: {}, res: {} } });
    expect(loginResult).toEqual({ code: 500, msg: "登录服务暂不可用" });
    expect(state.redis.size).toBe(0);
    expect(state.records.deleteCookie).toHaveBeenCalledWith(expect.anything(), "Admin-Token", { path: "/" });
  });

  it("does not report logout success when Garnet cannot revoke the session", async () => {
    const loginResult = await loginHandler({ node: { req: {}, res: {} } });
    state.headers.authorization = `Bearer ${loginResult.token}`;
    state.redisFailure = true;

    const logoutResult = await logoutHandler({ node: { req: {}, res: {} } });
    expect(logoutResult).toEqual({ code: 503, msg: "退出服务暂不可用" });
    expect(state.records.deleteCookie).toHaveBeenCalledWith(expect.anything(), "Admin-Token", { path: "/" });
  });
});
