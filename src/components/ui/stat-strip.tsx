"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StatStripItem {
  key: string;
  /** Short label, shown small and spaced over the figure. */
  label: string;
  value: ReactNode;
  /** One line of context under the figure: a change, a share, a rate. */
  hint?: ReactNode;
  /** A colour dot beside the label, when the figure maps to a known flow. */
  dot?: string;
  /** Hover tooltip for a label that needs a longer explanation than the hint line. */
  title?: string;
  tone?: "positive" | "negative";
}

/**
 * One surface split by hairlines instead of a card per number: three quiet figures read as one
 * row, which is how a household actually compares income, spending and what is left.
 * `tone="hero"` sits on the dark summary card; `tone="card"` is the page's own surface.
 */
export function StatStrip({
  items,
  tone = "card",
  label,
  columns,
  className,
}: {
  items: StatStripItem[];
  tone?: "card" | "hero";
  label?: string;
  /** Fixed column count; defaults to one column per figure (two on a phone). */
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const hero = tone === "hero";
  const cols = columns ?? (items.length > 2 ? 3 : 2);
  const anyHint = items.some((item) => item.hint != null);
  return (
    <dl
      aria-label={label}
      className={cn(
        "grid overflow-hidden rounded-2xl border",
        cols === 2 && "grid-cols-2",
        cols === 3 && "grid-cols-3",
        cols === 4 && "grid-cols-2 sm:grid-cols-4",
        hero
          ? "rounded-none border-0 border-t border-white/15 bg-transparent text-white shadow-none"
          : "border-border/80 bg-card shadow-[var(--card-elevation)]",
        className
      )}
    >
      {items.map((item, i) => (
        <div
          key={item.key}
          title={item.title}
          className={cn(
            "min-w-0 px-3 py-3.5 sm:px-5 sm:py-4",
            i > 0 && "border-s",
            hero ? "border-white/15" : "border-border/80"
          )}
        >
          <dt
            className={cn(
              "flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] sm:text-[0.6875rem]",
              hero ? "text-white/70" : "text-muted-foreground"
            )}
          >
            {item.dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.dot }} />}
            <span className="min-w-0 truncate">{item.label}</span>
          </dt>
          <dd
            className={cn(
              "figure mt-1 whitespace-nowrap text-[1.0625rem] leading-tight sm:mt-1.5 sm:text-2xl",
              item.tone === "positive" && "text-status-on-track",
              item.tone === "negative" && "text-status-over"
            )}
          >
            {item.value}
          </dd>
          {/* On a phone the three figures are the point; the context line returns at 640px. */}
          {anyHint && (
            <dd className={cn("mt-1 hidden min-h-4 text-caption sm:block", hero ? "text-white/65" : "text-muted-foreground")}>{item.hint}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
