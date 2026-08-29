import { describe, expect, it } from "vitest";
import { addDaysISO, nightCount } from "./dates";

describe("dates", () => {
  it("counts nights on a half-open interval", () => {
    expect(nightCount("2026-01-01", "2026-01-04")).toBe(3);
    expect(nightCount("2026-01-04", "2026-01-04")).toBe(0);
    expect(nightCount("2026-01-05", "2026-01-04")).toBe(0);
  });

  it("adds days across a month boundary", () => {
    expect(addDaysISO("2026-01-31", 1)).toBe("2026-02-01");
  });
});
