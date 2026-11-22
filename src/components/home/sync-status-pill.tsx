"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatLastSync, formatJerusalemTimeOfDay } from "@/lib/formatters";
import { translateProviderName, useFormatterLabels } from "@/lib/i18n-data";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ActivitySnapshot, HomeBankHealthItem } from "@/lib/types";

interface Props {
  items: HomeBankHealthItem[] | null;
  nextScheduledSync: string | null;
  activity: ActivitySnapshot | null;
  onOpenChange?: (open: boolean) => void;
  /** Show the status in words next to the dot (open sidebar); the dot alone when the sidebar is collapsed. */
  labelled?: boolean;
  /** A refresh icon with a short age ("23h") instead of the sentence; the sentence stays in the tooltip. */
  compact?: boolean;
}

type PillTone = "ok" | "warn" | "error" | "muted" | "active";

interface PillState {
  tone: PillTone;
  label: string;
  detail: string | null;
  /** Oldest last sync (UTC, no zone), for the compact age. */
  since?: string | null;
}

const TONE_STYLES: Record<PillTone, { dot: string; text: string; ring: string; pulse: boolean }> = {
  ok: {
    dot: "bg-[var(--status-on-track)]",
    text: "text-foreground",
    ring: "ring-[color-mix(in_oklch,var(--status-on-track)_30%,var(--border))]",
    pulse: false,
  },
  warn: {
    dot: "bg-[var(--status-heads-up)]",
    text: "text-foreground",
    ring: "ring-[color-mix(in_oklch,var(--status-heads-up)_35%,var(--border))]",
    pulse: false,
  },
  error: {
    dot: "bg-[var(--status-over)]",
    text: "text-[var(--status-over)]",
    ring: "ring-[color-mix(in_oklch,var(--status-over)_45%,var(--border))]",
    pulse: false,
  },
  muted: {
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    ring: "ring-border",
    pulse: false,
  },
  active: {
    dot: "bg-[var(--accent)]",
    text: "text-foreground",
    ring: "ring-[color-mix(in_oklch,var(--accent)_45%,var(--border))]",
    pulse: true,
  },
};

function formatElapsed(sinceIso: string | null, justNow: string): string {
  if (!sinceIso) return "";
  const start = new Date(sinceIso).getTime();
  const ageMs = Date.now() - start;
  if (!Number.isFinite(ageMs) || ageMs < 0) return justNow;
  const sec = Math.floor(ageMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

function useTick(active: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

/** The sync status in words and tone: the pill's tooltip, and the line in the profile menu. */
export function useSyncState(items: HomeBankHealthItem[] | null, activity: ActivitySnapshot | null) {
  const tPill = useTranslations("syncPill");
  const tBanks = useTranslations("banks");
  const fmtLabels = useFormatterLabels();
  const syncActive = activity?.sync.active === true;
  const syncStale = activity?.sync.stale === true;
  useTick(syncActive);

  const baseState = useMemo<PillState>(() => {
    if (!items || items.length === 0) {
      return { tone: "muted", label: tPill("noBanksConnected"), detail: null };
    }

    const errors = items.filter((i) => i.status === "error");
    if (errors.length > 0) {
      return {
        tone: "error",
        label:
          errors.length === 1
            ? tPill("oneBankFailed")
            : tPill("banksFailed", { count: errors.length }),
        detail: errors
          .map((e) => translateProviderName(e.provider, e.providerName, tBanks))
          .join(", "),
      };
    }

    const okItems = items.filter((i) => i.status === "ok");
    const staleItems = items.filter((i) => i.status === "stale");
    const everSynced = items.filter((i) => i.lastSyncAt != null);

    if (everSynced.length === 0) {
      return { tone: "muted", label: tPill("neverSynced"), detail: null };
    }

    const oldestSync = everSynced.reduce<string | null>((oldest, i) => {
      if (!i.lastSyncAt) return oldest;
      if (!oldest) return i.lastSyncAt;
      return new Date(i.lastSyncAt + "Z").getTime() <
        new Date(oldest + "Z").getTime()
        ? i.lastSyncAt
        : oldest;
    }, null);

    if (staleItems.length > 0 && okItems.length === 0) {
      return {
        tone: "warn",
        label: tPill("lastSyncRelative", { time: formatLastSync(oldestSync, fmtLabels) }),
        since: oldestSync,
        detail: staleItems
          .map((s) => translateProviderName(s.provider, s.providerName, tBanks))
          .join(", "),
      };
    }

    return {
      tone: "ok",
      label: tPill("syncedRelative", { time: formatLastSync(oldestSync, fmtLabels) }),
      detail: null,
      since: oldestSync,
    };
  }, [items, tPill, tBanks, fmtLabels]);

  let state: PillState = baseState;
  if (syncActive && syncStale) {
    state = { tone: "warn", label: tPill("syncMayBeStuck"), detail: null };
  } else if (syncActive) {
    const elapsed = formatElapsed(activity?.sync.since ?? null, fmtLabels.justNow);
    state = {
      tone: "active",
      label: elapsed
        ? tPill("syncingNowElapsed", { elapsed })
        : tPill("syncingNow"),
      detail: null,
    };
  }

  const styles = TONE_STYLES[state.tone];
  return { state, styles };
}

export function SyncStatusPill({
  items,
  nextScheduledSync,
  activity,
  onOpenChange,
  labelled,
  compact,
}: Props) {
  const locale = useLocale();
  // A minute clock for the compact age, so render stays pure.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const tPill = useTranslations("syncPill");
  const syncActive = activity?.sync.active === true;
  const { state, styles } = useSyncState(items, activity);
  // "23 ש׳" / "23h": the age of the oldest sync, in the largest unit that fits.
  const age = (since: string | null | undefined) => {
    if (!since) return null;
    const mins = Math.max(0, (now - new Date(since + "Z").getTime()) / 60_000);
    const [n, unit] = mins < 60 ? [Math.round(mins), "minute"] : mins < 1440 ? [Math.round(mins / 60), "hour"] : [Math.round(mins / 1440), "day"];
    return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "narrow" }).format(n);
  };

  const nextText = nextScheduledSync
    ? tPill("nextScheduled", { time: formatJerusalemTimeOfDay(nextScheduledSync) })
    : null;
  const tooltipText = nextText && !syncActive ? `${state.label} · ${nextText}` : state.label;

  return (
    <Popover onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={tooltipText}
                  className={cn(
                    compact
                      ? "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      : labelled
                      ? "flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-start text-sm transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                      : "inline-flex size-11 items-center justify-center rounded-full transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    styles.text
                  )}
                />
              }
            />
          }
        >
          {compact ? <>
            <RefreshCw aria-hidden className={cn("size-4 shrink-0", styles.pulse && "motion-safe:animate-spin")} />
            {age(state.since) && <span aria-hidden className="text-xs font-medium tabular-nums">{age(state.since)}</span>}
            <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", styles.dot)} />
            <span className="sr-only">{tooltipText}</span>
          </> : <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", styles.dot, styles.pulse && "animate-pulse")}
          />}
          {compact ? null : labelled
            ? <span className="min-w-0 flex-1 truncate text-sidebar-foreground group-data-[collapsible=icon]:sr-only">{state.label}</span>
            : <span className="sr-only">{tooltipText}</span>}
        </TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
      <PopoverContent>
        <ActivityPanel activity={activity} />
      </PopoverContent>
    </Popover>
  );
}

function ActivityPanel({ activity }: { activity: ActivitySnapshot | null }) {
  const t = useTranslations("activityPanel");
  const fmtLabels = useFormatterLabels();
  const sync = activity?.sync;
  const scheduler = activity?.scheduler;
  const ollama = activity?.ollama;

  let syncRow: { tone: PillTone; text: string };
  if (!sync) {
    syncRow = { tone: "muted", text: fmtLabels.never };
  } else if (!sync.active) {
    syncRow = { tone: "muted", text: t("syncIdle") };
  } else if (sync.stale) {
    syncRow = { tone: "warn", text: t("syncMayBeStuck") };
  } else {
    const elapsed = formatElapsed(sync.since, fmtLabels.justNow);
    const kindLabel = sync.kind === "scheduled" ? t("syncKindScheduled") : t("syncKindManual");
    syncRow = {
      tone: "active",
      text: elapsed
        ? t("syncingKindElapsed", { kind: kindLabel, elapsed })
        : t("syncingKind", { kind: kindLabel }),
    };
  }

  const schedulerRow: { tone: PillTone; text: string } = scheduler?.armed
    ? {
        tone: "ok",
        text: t("schedulerNext", { time: formatJerusalemTimeOfDay(scheduler.nextRunAt!) }),
      }
    : { tone: "muted", text: t("schedulerOff") };

  const ollamaRow: { tone: PillTone; text: string } = ollama?.running
    ? { tone: "ok", text: t("ollamaRunning") }
    : { tone: "muted", text: t("ollamaNotRunning") };

  return (
    <div className="space-y-2.5">
      <div className="text-xs font-medium text-foreground">{t("title")}</div>
      <Row label={t("syncLabel")} value={syncRow.text} tone={syncRow.tone} />
      <Row label={t("schedulerLabel")} value={schedulerRow.text} tone={schedulerRow.tone} />
      <Row label={t("ollamaLabel")} value={ollamaRow.text} tone={ollamaRow.tone} />
      <p className="pt-1 text-xs leading-snug text-muted-foreground">
        {t("footerNote")}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: PillTone;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            styles.dot,
            styles.pulse && "animate-pulse"
          )}
        />
        {label}
      </div>
      <div className={cn("text-end", styles.text)}>{value}</div>
    </div>
  );
}
