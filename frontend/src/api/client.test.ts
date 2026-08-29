import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, setToken } from "./client";

function mockResponse(status: number, body: unknown) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
  setToken(null);
});

describe("api client error normalisation", () => {
  it("unwraps the {error:{code,message}} shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => mockResponse(409, { error: { code: "no_availability", message: "Full" } })),
    );
    await expect(api("/api/x")).rejects.toMatchObject({
      status: 409,
      code: "no_availability",
      message: "Full",
    });
  });

  it("summarises FastAPI's {detail:[...]} validation shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        mockResponse(422, {
          detail: [{ loc: ["body", "rooms"], msg: "field required" }],
        }),
      ),
    );
    const err = await api("/api/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.code).toBe("validation_error");
    expect(apiErr.fields).toEqual({ rooms: "field required" });
  });

  it("clears the token and throws on 401", async () => {
    setToken("stale");
    vi.stubGlobal("fetch", vi.fn(() => mockResponse(401, null)));
    await expect(api("/api/me")).rejects.toMatchObject({ status: 401 });
    // token cleared as a side effect
    const { getToken } = await import("./client");
    expect(getToken()).toBeNull();
  });
});
