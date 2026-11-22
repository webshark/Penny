import { IL } from "@/lib/il-defaults";

/** The month a study fund opened in ("YYYY-MM") → the month its money becomes free to withdraw, tax-free. */
export function studyFundLiquidFrom(opened: string): string | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(opened);
  return m ? `${Number(m[1]) + IL.studyFundLiquidYears}-${m[2]}` : null;
}

/** Liquid from the start of that month on; `today` is "YYYY-MM-DD" or "YYYY-MM". */
export function studyFundIsLiquid(opened: string, today: string): boolean {
  const from = studyFundLiquidFrom(opened);
  return from != null && today.slice(0, 7) >= from;
}
