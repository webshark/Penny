"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { getBalanceForecast } from "@/lib/api";
import { scenarioPoints } from "@/lib/scenario";
import { shekels } from "@/lib/money";
import { CardShell, CardSkeleton, CardError } from "./card-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ScenarioCard() {
  const locale = useLocale(); const t = useTranslations("scenario");
  const title = t("whatIf");
  const q = useQuery({ queryKey: ["balance-forecast"], queryFn: getBalanceForecast });
  const [expense, setExpense] = useState(""); const [saving, setSaving] = useState(""); const [date, setDate] = useState("");
  const money = (v: number) => shekels(v, locale);
  if (q.isPending) return <CardSkeleton label={title} />;
  if (q.isError) return <CardError label={title} />;
  const base = q.data.forecast?.points ?? [];
  if (!base.length) return <CardShell label={title}><p>{t("connectAnAccountWith")}</p></CardShell>;
  const start = base[0].date; const end = base.at(-1)!.date;
  const points = scenarioPoints(base, { expense: Number(expense), monthlySaving: Number(saving), date: date || start });
  const low = points.reduce((a, b) => a.balance < b.balance ? a : b);
  const min = Math.min(0, ...points.map(p => p.balance), ...base.map(p => p.balance));
  const max = Math.max(1, ...points.map(p => p.balance), ...base.map(p => p.balance));
  const line = (ps: typeof points) => ps.map((p, i) => `${10 + i / Math.max(1, ps.length - 1) * 580},${150 - (p.balance - min) / (max - min) * 130}`).join(" ");
  const events = q.data.forecast?.events ?? [];
  return <CardShell label={title}>
    <p className="mb-4 text-sm text-muted-foreground">{t("a90DayExperiment")}</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="space-y-1 text-sm">{t("plannedExpense")}<Input type="number" min="0" step="0.01" value={expense} onChange={e => setExpense(e.target.value)} /></label>
      <label className="space-y-1 text-sm">{t("when")}<Input type="date" min={start} max={end} value={date || start} onChange={e => setDate(e.target.value)} /></label>
      <label className="space-y-1 text-sm">{t("monthlySavingsTransfer")}<Input type="number" min="0" step="0.01" value={saving} onChange={e => setSaving(e.target.value)} /></label>
    </div>
    <svg viewBox="0 0 600 175" role="img" aria-label={t("accountForecastDashedBaseline")} className="mt-5 w-full"><polyline points={line(base)} fill="none" stroke="currentColor" opacity="0.4" strokeDasharray="5 5" strokeWidth="2" /><polyline points={line(points)} fill="none" stroke="var(--primary)" strokeWidth="3" /></svg>
    <p className="text-xs text-muted-foreground">{t("dashedBaselineSolidYour")}</p>
    <div className="mt-2 flex justify-between text-xs text-muted-foreground" dir="ltr"><span>{start}</span><span>{end}</span></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-live="polite"><div className="rounded-xl bg-muted p-3"><p className="text-sm">{t("scenarioLowPoint")}</p><strong className="block text-2xl"><bdi>{money(low.balance)}</bdi></strong><span className="text-xs">{low.date}</span></div><div className="rounded-xl bg-muted p-3"><p className="text-sm">{t("balanceAtTheEnd")}</p><strong className="block text-2xl"><bdi>{money(points.at(-1)!.balance)}</bdi></strong><span className="text-xs">{t("baseline")}{money(base.at(-1)!.balance)}</span></div></div>
    <details className="mt-4 text-sm"><summary className="min-h-11 cursor-pointer py-3">{t("assumptionsUpcomingTimeline")}</summary><p className="text-muted-foreground">{t("estimatedFromSyncedBalances")}</p><ol className="mt-3 divide-y">{events.slice(0, 18).map((event, i) => <li key={`${event.date}-${i}`} className="flex flex-wrap justify-between gap-2 py-3"><span>{event.date} · {event.kind === "income" ? t("estimatedIncome") : event.kind === "card" ? t("estimatedCardBill") : t("estimatedRecurringDebit")}</span><bdi>{money(event.amount)}</bdi></li>)}</ol></details>
    <Button variant="ghost" onClick={() => { setExpense(""); setSaving(""); setDate(""); }}>{t("resetExperiment")}</Button>
  </CardShell>;
}
