import { describe, expect, it } from "vitest";

import { shouldRunWarningPushAt } from "../../server/utils/nitro-jobs/kucun-warning-schedule";

describe("kucun warning schedule", () => {
  it("does not catch up an already-passed time after a service restart", () => {
    expect(
      shouldRunWarningPushAt(
        new Date(2026, 8, 8, 15, 56, 0),
        { hour: 8, minute: 0 },
        "",
      ),
    ).toBe(false);
  });

  it("runs at the configured hour and minute", () => {
    expect(
      shouldRunWarningPushAt(
        new Date(2026, 8, 9, 8, 0, 0),
        { hour: 8, minute: 0 },
        "",
      ),
    ).toBe(true);
  });

  it("does not run before the configured time or twice on the same day", () => {
    expect(
      shouldRunWarningPushAt(
        new Date(2026, 8, 9, 7, 59, 0),
        { hour: 8, minute: 0 },
        "",
      ),
    ).toBe(false);
    expect(
      shouldRunWarningPushAt(
        new Date(2026, 8, 9, 8, 0, 0),
        { hour: 8, minute: 0 },
        "2026-09-09",
      ),
    ).toBe(false);
  });
});
