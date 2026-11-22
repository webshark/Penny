"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, CalendarClock } from "lucide-react";
import { getInsights } from "@/lib/api";
import { loadPreference } from "@/lib/preference-sync";
import { upcomingCharges } from "@/lib/balance-forecast";
import { shekels } from "@/lib/money";

/** Whether the person turned the pinned "coming up" section off (Settings > Appearance). */
export function useShowUpcoming() {
  const q = useQuery({ queryKey: ["preference", "transactions-upcoming"], queryFn: () => loadPreference("transactions-upcoming") });
  return (q.data as { hidden?: unknown } | null)?.hidden !== true;
}

/** "upcoming transactions": recurring charges that are late or due in the next 3 days, pinned above the list. */
export function UpcomingCharges() {
  const t = useTranslations("upcoming");
  const locale = useLocale();
  const show = useShowUpcoming();
  const q = useQuery({ queryKey: ["insights"], queryFn: getInsights });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  if (!show || !q.data) return null;
  const items = upcomingCharges(q.data.series.filter((s) => s.status === "suggested"), today);
  if (!items.length) return null;
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const days = (d: string) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  return (
    <section aria-label={t("title")} className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4 text-primary" aria-hidden />{t("title")} <span className="font-normal text-muted-foreground">({items.length})</span></h2>
      <ul className="divide-y divide-border">
        {items.map((s) => (
          <li key={`${s.merchant}|${s.account}|${s.cadence}`} className="flex min-h-11 items-center gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium" title={s.merchant}>{s.merchant}</span>
            {s.overdue
              ? <span className="inline-flex items-center gap-1 rounded-md bg-[var(--status-heads-up)]/15 px-1.5 py-0.5 text-xs font-medium text-[var(--status-heads-up)]"><AlertCircle className="size-3" aria-hidden />{t("late")}</span>
              : <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{rel.format(days(s.due), "day")}</span>}
            <bdi className="w-20 text-end font-semibold tabular-nums" data-money>{shekels(Math.round(s.expectedAmount), locale)}</bdi>
          </li>
        ))}
      </ul>
    </section>
  );
}
