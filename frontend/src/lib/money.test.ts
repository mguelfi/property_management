import { describe, expect, it } from "vitest";
import { formatMoney, minorUnitExponent, toMajorString, toMinor } from "./money";

describe("money", () => {
  it("knows minor-unit exponents", () => {
    expect(minorUnitExponent("AUD")).toBe(2);
    expect(minorUnitExponent("jpy")).toBe(0);
    expect(minorUnitExponent("KWD")).toBe(3);
  });

  it("round-trips major <-> minor", () => {
    expect(toMinor("123.45", "AUD")).toBe(12345);
    expect(toMinor("100", "JPY")).toBe(100);
    expect(toMinor(50, "BHD")).toBe(50000);
    expect(toMajorString(12345, "AUD")).toBe("123.45");
    expect(toMajorString(100, "JPY")).toBe("100");
  });

  it("rejects nonsense amounts", () => {
    expect(() => toMinor("abc", "AUD")).toThrow();
  });

  it("formats with the currency symbol and right precision", () => {
    expect(formatMoney(12345, "AUD")).toMatch(/123\.45/);
    expect(formatMoney(100, "JPY")).not.toMatch(/\./);
  });
});
