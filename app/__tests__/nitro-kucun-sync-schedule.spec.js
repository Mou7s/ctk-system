import { describe, expect, it } from "vitest";

import { NITRO_JOB_MAP } from "../../server/utils/nitro-jobs/registry";

describe("kucun sync schedule", () => {
  it("103 全量每小时、走独立插件真跑", () => {
    const def = NITRO_JOB_MAP.get("kucunFullSync");
    expect(def.jobId).toBe(103);
    expect(def.name).toBe("D栋库存同步（全量）");
    expect(def.intervalMs).toBe(3_600_000);
    expect(def.skipScheduler).toBe(true);
  });

  it("106 差异每15分钟、走独立插件真跑", () => {
    const def = NITRO_JOB_MAP.get("kucunDiffSync");
    expect(def.jobId).toBe(106);
    expect(def.name).toBe("D栋库存同步（差异）");
    expect(def.intervalMs).toBe(900_000);
    expect(def.skipScheduler).toBe(true);
  });
});
