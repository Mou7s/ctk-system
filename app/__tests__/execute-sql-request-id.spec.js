import { afterEach, describe, expect, it, vi } from "vitest";

import { createClientRequestId } from "../../app/utils/requestId.js";

describe("client request id", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses Web Crypto UUID when it is available", () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "uuid-from-web-crypto") });

    expect(createClientRequestId("execute")).toBe("uuid-from-web-crypto");
  });

  it("falls back when the HTTP page has no Web Crypto UUID", () => {
    vi.stubGlobal("crypto", undefined);

    const requestId = createClientRequestId("execute");

    expect(requestId).toMatch(/^execute-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
    expect(requestId.length).toBeLessThanOrEqual(64);
  });

  it("generates distinct fallback ids within the same page", () => {
    vi.stubGlobal("crypto", {});

    const first = createClientRequestId("execute");
    const second = createClientRequestId("execute");

    expect(second).not.toBe(first);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(second.length).toBeLessThanOrEqual(64);
  });
});
