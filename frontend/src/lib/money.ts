// Amounts cross the API as integer minor units + an ISO currency code.
// This table mirrors `_EXPONENTS` in app/core/money.py.
const EXPONENTS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  CLP: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
};

export function minorUnitExponent(currency: string): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2;
}

/** Format minor units for display, e.g. formatMoney(12345, "AUD") -> "A$123.45". */
export function formatMoney(amountMinor: number, currency: string): string {
  const exp = minorUnitExponent(currency);
  const major = amountMinor / 10 ** exp;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
    }).format(major);
  } catch {
    return `${major.toFixed(exp)} ${currency}`;
  }
}

/** Parse a major-unit string from an input into integer minor units. */
export function toMinor(major: string | number, currency: string): number {
  const exp = minorUnitExponent(currency);
  const value = typeof major === "number" ? major : Number(major);
  if (!Number.isFinite(value)) throw new Error("Invalid amount");
  return Math.round(value * 10 ** exp);
}

/** Minor units as a plain editable string, e.g. 12345 -> "123.45". */
export function toMajorString(amountMinor: number, currency: string): string {
  const exp = minorUnitExponent(currency);
  return (amountMinor / 10 ** exp).toFixed(exp);
}
