"use client";

import { cn } from "@/lib/utils";

/** Pill tabs (text only, the chosen one filled with the accent): one choice from a few. Arrow keys move between options, as in a radio group.
 *  variant="track": the quieter iOS segmented control (grey track, raised thumb), for a filter that sits under a pill row. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
  variant = "pill",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  variant?: "pill" | "track";
}) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      // The track wraps on phones: three long English labels cannot share a 320px row,
      // and keeping them on one line pushed the whole settings page sideways.
      className={cn("inline-flex flex-wrap gap-1", variant === "track" && "max-w-full gap-x-0 gap-y-0.5 rounded-2xl bg-[var(--segmented)] p-0.5 sm:flex-nowrap sm:rounded-full", className)}
      onKeyDown={(e) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        // In RTL the visual order is mirrored, so left/right swap.
        const dir = getComputedStyle(e.currentTarget).direction === "rtl" && e.key.startsWith("Arrow") && (e.key === "ArrowLeft" || e.key === "ArrowRight") ? -step : step;
        const next = options[(index + dir + options.length) % options.length];
        onChange(next.value);
        (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-11 rounded-full px-3.5 text-sm font-medium tabular-nums transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              variant === "track"
                ? cn("min-h-9 flex-1 whitespace-nowrap px-3 text-[13px] md:min-h-8", selected ? "bg-[var(--segmented-thumb)] font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
                : selected ? "bg-primary font-semibold text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
