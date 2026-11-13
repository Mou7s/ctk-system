import { describe, expect, it } from "vitest";
import { isJsonBlob, readBlobErrorMessage } from "../utils/blob-download.js";

describe("blob download guard", () => {
  it.each([
    ["application/json", true],
    ["application/json;charset=utf-8", true],
    ["application/json; charset=utf-8", true],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", false],
    ["application/zip", false],
    ["", false],
  ])("classifies %j as json=%s", (type, expected) => {
    expect(isJsonBlob({ type })).toBe(expected);
  });

  it("treats missing data as a non-json blob", () => {
    expect(isJsonBlob(null)).toBe(false);
    expect(isJsonBlob(undefined)).toBe(false);
  });

  it("returns the server msg for a json error blob", async () => {
    const blob = new Blob([JSON.stringify({ code: 401, msg: "登录状态已过期" })], { type: "application/json" });
    await expect(readBlobErrorMessage(blob)).resolves.toBe("登录状态已过期");
  });

  it("returns the fallback for an unparsable json blob and empty for a real file", async () => {
    const broken = new Blob(["<html>502 Bad Gateway</html>"], { type: "application/json" });
    await expect(readBlobErrorMessage(broken, "导出失败")).resolves.toBe("导出失败");

    const xlsx = new Blob([new Uint8Array([0x50, 0x4b])], { type: "application/zip" });
    await expect(readBlobErrorMessage(xlsx)).resolves.toBe("");
  });
});
