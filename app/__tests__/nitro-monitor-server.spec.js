import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectMonitorServerInfo,
  resetCpuSampleCache,
  sanitizeExecArgv,
} from "../../server/utils/monitor-server-read.ts";

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
}));

vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
}));

globalThis.defineEventHandler = (handler) => handler;

function createCpuInfo(times, model = "Example CPU @ 3.20GHz", speed = 3200) {
  return { model, speed, times };
}

describe("Nitro monitor server route", () => {
  let handler;

  beforeAll(async () => {
    handler = (await import("../../server/routes/prod-api/monitor/server.get.ts")).default;
  });

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } };
    resetCpuSampleCache();
  });

  it("requires an authenticated session", async () => {
    state.authenticated = null;
    await expect(handler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
  });

  it("returns complete monitor groups and backward-compatible fields", async () => {
    const result = await handler({});
    expect(result.code).toBe(200);
    expect(result.data).toEqual(expect.objectContaining({
      collectedAt: expect.any(String),
      cpu: expect.objectContaining({
        cpuNum: expect.any(Number),
        model: expect.any(String),
        speedMHz: expect.any(Number),
        total: 100,
        used: expect.any(Number),
        sys: expect.any(Number),
        wait: 0,
        free: expect.any(Number),
        totalUsage: expect.any(Number),
        loadAvg: expect.objectContaining({
          supported: expect.any(Boolean),
          one: expect.any(Number),
          five: expect.any(Number),
          fifteen: expect.any(Number),
          ratio1m: expect.any(Number),
        }),
      }),
      mem: expect.objectContaining({
        total: expect.any(Number),
        used: expect.any(Number),
        free: expect.any(Number),
        usage: expect.any(Number),
        totalBytes: expect.any(Number),
        usedBytes: expect.any(Number),
        freeBytes: expect.any(Number),
      }),
      runtime: expect.objectContaining({
        name: expect.stringMatching(/^(Bun|Node\.js)$/),
        version: expect.any(String),
        engine: expect.stringMatching(/^(JavaScriptCore|V8)$/),
        nodeCompatVersion: expect.any(String),
        execPath: expect.any(String),
        pid: expect.any(Number),
        startTime: expect.any(String),
        uptimeSeconds: expect.any(Number),
        runTime: expect.any(String),
        inputArgs: expect.any(String),
        memory: expect.objectContaining({
          rssMB: expect.any(Number),
          heapUsedMB: expect.any(Number),
          heapTotalMB: expect.any(Number),
          externalMB: expect.any(Number),
          arrayBuffersMB: expect.any(Number),
          rssBytes: expect.any(Number),
          systemUsage: expect.any(Number),
        }),
      }),
      sys: expect.objectContaining({
        computerName: expect.any(String),
        computerIp: expect.any(String),
        osName: expect.any(String),
        osRelease: expect.any(String),
        platform: expect.any(String),
        osArch: expect.any(String),
        userDir: expect.any(String),
        uptimeSeconds: expect.any(Number),
        runTime: expect.any(String),
      }),
      sysFiles: expect.any(Array),
      jvm: expect.objectContaining({
        name: expect.stringMatching(/^(Bun|Node\.js)$/),
        version: expect.any(String),
        home: expect.any(String),
        startTime: expect.any(String),
        runTime: expect.any(String),
        inputArgs: expect.any(String),
        total: expect.any(Number),
        max: expect.any(Number),
        used: expect.any(Number),
        free: expect.any(Number),
        usage: expect.any(Number),
      }),
    }));

    expect(result.data.jvm.name).toBe(result.data.runtime.name);
    expect(result.data.jvm.version).toBe(result.data.runtime.version);
    expect(result.data.jvm.usage).toBe(result.data.runtime.memory.systemUsage);
    if (result.data.sysFiles.length > 0) {
      expect(result.data.sysFiles[0].typeName).toBe("应用工作目录");
    }
  });
});

describe("collectMonitorServerInfo", () => {
  beforeEach(() => {
    resetCpuSampleCache();
  });

  it("identifies Bun runtime and uses RSS / system memory without 100% false alert when heapUsed === heapTotal", async () => {
    const totalBytes = 16 * 1024 ** 3; // 16 GB
    const freeBytes = 10 * 1024 ** 3;  // 10 GB
    const rssBytes = 128 * 1024 ** 2;  // 128 MB
    const heapBytes = 642 * 1024;      // 642 KB (heapUsed === heapTotal in JSC)

    let cpuCall = 0;
    const data = await collectMonitorServerInfo({
      now: () => 1_700_000_000_000,
      sleep: vi.fn(async () => {}),
      cpus: () => {
        cpuCall += 1;
        return cpuCall === 1
          ? [createCpuInfo({ user: 1000, nice: 0, sys: 500, idle: 8500, irq: 0 })]
          : [createCpuInfo({ user: 1200, nice: 0, sys: 600, idle: 9200, irq: 0 })];
      },
      loadavg: () => [0.5, 0.4, 0.3],
      totalmem: () => totalBytes,
      freemem: () => freeBytes,
      hostname: () => "example-host",
      networkInterfaces: () => ({
        eth0: [{ address: "127.0.0.1", netmask: "255.0.0.0", family: "IPv4", mac: "00:00:00:00:00:00", internal: true, cidr: "127.0.0.1/8" }],
      }),
      osType: () => "Linux",
      osRelease: () => "6.8.0",
      platform: () => "linux",
      osArch: () => "x64",
      osUptime: () => 90061,
      cwd: () => "/srv/example-app",
      pid: 4321,
      execPath: "/usr/local/bin/bun",
      execArgv: ["--smol"],
      processUptime: () => 3661,
      memoryUsage: () => ({
        rss: rssBytes,
        heapTotal: heapBytes,
        heapUsed: heapBytes,
        external: 0,
        arrayBuffers: 0,
      }),
      versions: { bun: "1.4.4", node: "26.3.0" },
      processVersion: "v26.3.0",
      statfs: () => ({ blocks: 1000, bsize: 1024 * 1024, bavail: 400 }),
    });

    expect(data.runtime.name).toBe("Bun");
    expect(data.runtime.version).toBe("1.4.4");
    expect(data.runtime.engine).toBe("JavaScriptCore");
    expect(data.runtime.nodeCompatVersion).toBe("26.3.0");
    expect(data.runtime.pid).toBe(4321);

    // heapUsed === heapTotal (100% of dynamic heap), yet systemUsage is RSS / totalmem = 0.78%
    expect(data.runtime.memory.heapUsedMB).toBe(data.runtime.memory.heapTotalMB);
    expect(data.runtime.memory.rssMB).toBe(128);
    expect(data.runtime.memory.systemUsage).toBe(0.78);
    expect(data.runtime.memory.systemUsage).toBeLessThan(5);

    // Backward-compatible jvm fields match RSS / systemTotalMB
    expect(data.jvm).toEqual(expect.objectContaining({
      name: "Bun",
      version: "1.4.4",
      home: "/usr/local/bin/bun",
      used: 128,
      total: 16384,
      max: 16384,
      free: 16256,
      usage: 0.78,
    }));

    expect(data.cpu.used).toBe(20);
    expect(data.cpu.sys).toBe(10);
    expect(data.cpu.totalUsage).toBe(30);
    expect(data.cpu.free).toBe(70);
    expect(data.cpu.loadAvg).toEqual({
      supported: true,
      one: 0.5,
      five: 0.4,
      fifteen: 0.3,
      ratio1m: 0.5,
    });

    expect(data.sysFiles).toEqual([
      expect.objectContaining({
        dirName: "/srv/example-app",
        typeName: "应用工作目录",
        usage: 60,
      }),
    ]);
  });

  it("identifies Node.js runtime and marks loadAvg unsupported on Windows", async () => {
    const data = await collectMonitorServerInfo({
      now: () => 1_700_000_000_000,
      sleep: vi.fn(async () => {}),
      cpus: () => [createCpuInfo({ user: 500, nice: 0, sys: 250, idle: 4250, irq: 0 })],
      loadavg: () => [0, 0, 0],
      totalmem: () => 8 * 1024 ** 3,
      freemem: () => 4 * 1024 ** 3,
      platform: () => "win32",
      osType: () => "Windows_NT",
      osRelease: () => "10.0.22631",
      osArch: () => "x64",
      osUptime: () => 7200,
      cwd: () => "C:\\example-app",
      execPath: "C:\\Program Files\\nodejs\\node.exe",
      execArgv: ["--max-old-space-size=4096"],
      processUptime: () => 120,
      memoryUsage: () => ({
        rss: 256 * 1024 ** 2,
        heapTotal: 120 * 1024 ** 2,
        heapUsed: 100 * 1024 ** 2,
        external: 16 * 1024 ** 2,
        arrayBuffers: 8 * 1024 ** 2,
      }),
      versions: { node: "22.12.0" },
      processVersion: "v22.12.0",
      statfs: () => {
        throw new Error("statfs unavailable");
      },
    });

    expect(data.runtime.name).toBe("Node.js");
    expect(data.runtime.version).toBe("22.12.0");
    expect(data.runtime.engine).toBe("V8");
    expect(data.runtime.nodeCompatVersion).toBe("22.12.0");
    expect(data.runtime.memory.systemUsage).toBe(3.13);
    expect(data.jvm.name).toBe("Node.js");
    expect(data.jvm.version).toBe("22.12.0");
    expect(data.jvm.usage).toBe(3.13);
    expect(data.cpu.loadAvg).toEqual({
      supported: false,
      one: 0,
      five: 0,
      fifteen: 0,
      ratio1m: 0,
    });
    expect(data.sysFiles).toEqual([]);
  });

  it("reuses cached CPU snapshot within 0.5s-30s without sleeping and resamples after expiry", async () => {
    let currentTime = 10_000;
    const sleep = vi.fn(async (ms) => {
      currentTime += ms;
    });
    let tick = 0;
    const cpuSnapshots = [
      { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 },
      { user: 120, nice: 0, sys: 60, idle: 920, irq: 0 }, // cold sample end -> 30%
      { user: 160, nice: 0, sys: 70, idle: 970, irq: 0 }, // cached reuse (+5s) -> user+40, sys+10, idle+50 => 50%
      { user: 200, nice: 0, sys: 80, idle: 1020, irq: 0 }, // expired (>30s) before
      { user: 210, nice: 0, sys: 90, idle: 1100, irq: 0 }, // expired (>30s) after -> user+10, sys+10, idle+80 => 20%
    ];

    const baseDeps = {
      now: () => currentTime,
      sleep,
      cpus: () => [createCpuInfo(cpuSnapshots[Math.min(tick++, cpuSnapshots.length - 1)])],
      loadavg: () => [0, 0, 0],
      totalmem: () => 8 * 1024 ** 3,
      freemem: () => 4 * 1024 ** 3,
      platform: () => "linux",
      versions: { bun: "1.4.4", node: "26.3.0" },
      statfs: () => ({ blocks: 100, bsize: 1024, bavail: 50 }),
    };

    // 1st call: cold start -> sleeps 100ms
    const first = await collectMonitorServerInfo(baseDeps);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(first.cpu.totalUsage).toBe(30);

    // 2nd call (+5s): within 0.5s-30s -> reuses cache, no sleep
    currentTime += 5_000;
    const second = await collectMonitorServerInfo(baseDeps);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(second.cpu.totalUsage).toBe(50);

    // 3rd call (+31s): expired -> sleeps 100ms again
    currentTime += 31_000;
    const third = await collectMonitorServerInfo(baseDeps);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(third.cpu.totalUsage).toBe(20);
  });

  it("sanitizes sensitive startup arguments while preserving safe flags", () => {
    const output = sanitizeExecArgv([
      "--max-old-space-size=4096",
      "--db-password=super-secret-pass",
      "--api-token",
      "tok_example_12345",
      "--jwt-secret=my-jwt-secret",
      "--auth-key",
      "key_example_999",
      "--credential=cred-value",
      "--dsn=mysql://demo_user:demo_pass@127.0.0.1:3306/demo",
      "--smol",
    ]);

    expect(output).toContain("--max-old-space-size=4096");
    expect(output).toContain("--smol");
    expect(output).toContain("--db-password=***");
    expect(output).toContain("--api-token ***");
    expect(output).toContain("--jwt-secret=***");
    expect(output).toContain("--auth-key ***");
    expect(output).toContain("--credential=***");
    expect(output).toContain("--dsn=mysql://demo_user:***@127.0.0.1:3306/demo");
    expect(output).not.toContain("super-secret-pass");
    expect(output).not.toContain("tok_example_12345");
    expect(output).not.toContain("my-jwt-secret");
    expect(output).not.toContain("key_example_999");
    expect(output).not.toContain("cred-value");
    expect(output).not.toContain("demo_pass");
  });
});
