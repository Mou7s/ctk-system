import { describe, expect, it } from "vitest";

import { NITRO_JOB_MAP } from "../../server/utils/nitro-jobs/registry";

describe("wecom sync schedule", () => {
  it("109 企微通讯录每小时、走独立插件真跑", () => {
    const def = NITRO_JOB_MAP.get("wecomEmployeeSync");
    expect(def.jobId).toBe(109);
    expect(def.name).toBe("更新企微员工（通讯录）");
    expect(def.intervalMs).toBe(3_600_000);
    expect(def.skipScheduler).toBe(true);
    expect(def.configKey).toBe("nitro.job.wecomEmployeeSync");
  });
});
