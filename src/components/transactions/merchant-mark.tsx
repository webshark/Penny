import { merchantMark } from "@/lib/merchant-mark";

/** Readable letter on the brand colour: dark on light colours (Paz yellow), white on the rest. */
function ink(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "#111111" : "#ffffff";
}

/** The merchant's mark beside its name in transaction rows. Decorative: the name is read out already. */
export function MerchantMark({ name, size = 28 }: { name: string; size?: number }) {
  const m = merchantMark(name);
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full font-semibold leading-none"
      style={{ width: size, height: size, background: m.color, color: ink(m.color), fontSize: Math.round(size * 0.45) }}>
      {m.letter}
    </span>
  );
}
