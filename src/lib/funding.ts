/**
 * Money the applicant recorded by hand.
 *
 * Deliberately limited to manually recorded deposits: an application marked
 * `submitted` is a request, not money received, so those amounts are excluded.
 * Nothing here is checked against a bank or a funder.
 */
export const RECORDED_AWARDED_LABEL = "Recorded awarded funds";

export const RECORDED_AWARDED_NOTE =
  "Awarded funds are only the deposits you recorded yourself. Submitted applications are not counted until you record a deposit, and AutoGrant has no bank connection, so nothing is pulled from your account automatically — confirm every deposit against your bank statement.";

/**
 * Parses a hand-typed amount, ignoring currency symbols and thousands separators.
 *
 * Negative values — including accounting-style `(500)` — return 0: a refund or
 * correction must never be counted as an award credit.
 */
export function parseRecordedAmount(raw: string | number): number {
  const text = String(raw).trim();
  if (!text) return 0;
  if (text.startsWith("-") || /^\(.*\)$/.test(text)) return 0;
  const cleaned = Number(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(cleaned) && cleaned > 0 ? cleaned : 0;
}

/** Total of deposits the applicant recorded, rounded to whole cents. */
export function recordedAwardedTotal(deposits: readonly { amount: string | number }[]): number {
  const total = deposits.reduce((sum, deposit) => sum + parseRecordedAmount(deposit.amount), 0);
  return Math.round(total * 100) / 100;
}
