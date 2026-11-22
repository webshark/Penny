"use client";

import { CircleDot } from "lucide-react";
import { ICON_MAP } from "@/components/dashboard/category-card";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-8 [&_svg]:size-4",
  md: "size-9 [&_svg]:size-[1.125rem]",
  lg: "size-11 [&_svg]:size-5",
} as const;

/**
 * A category's icon on a round tint of its own colour. The icon is pulled toward the foreground, so
 * it stays legible on the tint in both themes and every seeded colour. Pairs with a plain label:
 * a list of icon + name reads faster than a wall of coloured pills.
 */
export function CategoryIcon({
  icon,
  color,
  size = "md",
  className,
}: {
  icon?: string | null;
  color: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const Icon = ICON_MAP[icon ?? "circle-dot"] ?? CircleDot;
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full", SIZES[size], className)}
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`,
        color: `color-mix(in oklab, ${color} 72%, var(--foreground))`,
      }}
    >
      <Icon />
    </span>
  );
}
