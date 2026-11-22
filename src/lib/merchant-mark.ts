/**
 * A merchant's mark in transaction rows, without fetching logos: the brand's colour and initial for
 * well-known Israeli merchants, a steady colour from the name for the rest. Nothing is fetched, so no merchant name
 * ever leaves the computer.
 */
export interface MerchantMark { letter: string; color: string }

const BRANDS: [RegExp, string, string][] = [
  [/שופרסל|shufersal/i, "ש", "#e2001a"],
  [/רמי\s*לוי/, "ר", "#0057a8"],
  [/ויקטורי/, "ו", "#e30613"],
  [/יוחננוף/, "י", "#00843d"],
  [/סופר[\s-]*פארם|super[\s-]*pharm/i, "ס", "#e4002b"],
  // \b only knows Latin letters, so Hebrew words get explicit edges.
  [/(^|[\s-])פז([\s-]|$)|\bpaz\b/i, "פ", "#ffcc00"],
  [/דלק|delek/i, "ד", "#e30613"],
  [/סונול|sonol/i, "ס", "#0072ce"],
  [/איקאה|ikea/i, "I", "#0058a3"],
  [/מקדונלד|mcdonald/i, "M", "#da291c"],
  [/וולט|wolt/i, "W", "#009de0"],
  [/נטפליקס|netflix/i, "N", "#e50914"],
  [/ספוטיפיי|spotify/i, "S", "#1db954"],
  [/apple|אפל/i, "A", "#555555"],
  [/google|גוגל/i, "G", "#4285f4"],
  [/amazon|אמזון/i, "A", "#ff9900"],
  [/בזק|bezeq/i, "ב", "#0047ba"],
  [/פרטנר|partner/i, "P", "#00b2a9"],
  [/סלקום|cellcom/i, "C", "#6a1b9a"],
  [/\bhot\b|הוט/i, "H", "#e4002b"],
  [/חברת\s*החשמל|electric/i, "ח", "#f4a300"],
  [/יאנגו|yango/i, "Y", "#ff3d00"],
  [/(^|[\s-])גט([\s-]|$)|\bgett\b/i, "G", "#ffd700"],
  [/זארה|zara/i, "Z", "#111111"],
  [/aliexpress|עליאקספרס/i, "A", "#ff4747"],
];

const PALETTE = ["#7c5cff", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#8b5cf6", "#f97316", "#64748b"];

/** First letter or digit of the name, for a mark with no brand. */
const initial = (name: string) => (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "•").toUpperCase();

export function merchantMark(name: string): MerchantMark {
  for (const [re, letter, color] of BRANDS) if (re.test(name)) return { letter, color };
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return { letter: initial(name), color: PALETTE[h % PALETTE.length] };
}
