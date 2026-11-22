/**
 * The Telegram message after a scheduled sync: only connections whose state changed (started failing, or
 * recovered), so a bank that stays down doesn't repeat the same alert every few hours. null when nothing changed.
 */
export interface SyncAlertItem {
  label: string;
  ok: boolean;
  /** The previous run of this connection failed. */
  wasFailing: boolean;
  /** Plain-language reason and what to do, already in Hebrew. */
  reason?: string;
}

export function syncAlert(items: SyncAlertItem[]): string | null {
  const broke = items.filter((i) => !i.ok && !i.wasFailing);
  const fixed = items.filter((i) => i.ok && i.wasFailing);
  if (broke.length === 0 && fixed.length === 0) return null;
  const lines: string[] = [];
  for (const b of broke) lines.push(`⚠️ הסנכרון של ${b.label} נכשל.${b.reason ? `\n${b.reason}` : ""}`);
  if (broke.length) lines.push("נמשיך לנסות בסנכרון הבא. אפשר גם /sync עכשיו.");
  for (const f of fixed) lines.push(`✓ ${f.label} מסתנכרן שוב.`);
  return lines.join("\n\n");
}
