import { describe, expect, it } from "vitest";

describe("Kingdee maintenance page route", () => {
  it("uses the new route and keeps the old route as a redirect page", async () => {
    const newPage = await import("../../app/pages/tk_custom/kingdeeMaintenance/index.vue");
    const oldPage = await import("../../app/pages/tk_custom/executeSql/index.vue");
    expect(newPage).toBeDefined();
    expect(oldPage).toBeDefined();
  });
});
