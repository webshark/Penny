"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Gauge, X } from "lucide-react";
import { addCreditScore, deleteCreditScore, getCreditScores } from "@/lib/api";
import { creditTrend, type CreditScore } from "@/lib/credit-score";

const todayIso = () => new Date().toLocaleDateString("en-CA");

/** Credit score from Israel's credit data reports, typed in by the user: the latest, its trend, and a yearly free-report reminder. */
export function CreditScoreCard() {
  const t = useTranslations("creditScore");
  const locale = useLocale();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["credit-scores"], queryFn: getCreditScores });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["credit-scores"] });
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso);
  const [score, setScore] = useState("");
  const [bureau, setBureau] = useState("");
  const add = useMutation({ mutationFn: () => addCreditScore({ date, score: Number(score), bureau }), onSuccess: () => { refresh(); setOpen(false); setScore(""); }, onError: () => toast.error(t("failed")) });
  const remove = useMutation({
    mutationFn: (s: CreditScore) => deleteCreditScore(s.id),
    onSuccess: (_r, s) => {
      refresh();
      toast.success(t("removed"), {
        action: { label: t("undo"), onClick: () => void addCreditScore({ date: s.date, score: s.score, bureau: s.bureau, note: s.note }).then(refresh, () => toast.error(t("failed"))) },
      });
    },
    onError: () => toast.error(t("failed")),
  });
  const trend = creditTrend(q.data?.scores ?? [], todayIso());
  const fmtDate = (d: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(new Date(`${d}T12:00:00`));
  const valid = /^\d{1,4}$/.test(score) && Number(score) <= 1000 && date !== "";
  const field = "h-11 rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

  return (
    <section aria-labelledby="credit-title" className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="credit-title" className="flex items-center gap-2 text-base font-semibold"><Gauge className="size-4 text-primary" aria-hidden />{t("title")}</h2>
        {!open && !q.isError && <button type="button" onClick={() => setOpen(true)} className="h-11 rounded-lg border border-border px-3 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{t("add")}</button>}
      </div>

      {trend.latest ? (
        <div className="mb-3 flex items-baseline gap-3">
          <bdi className="text-3xl font-semibold tabular-nums">{trend.latest.score}</bdi>
          {trend.change != null && trend.change !== 0 && (
            <span className={`text-sm font-medium ${trend.change > 0 ? "text-status-on-track" : "text-expense"}`}>{t(trend.change > 0 ? "up" : "down", { n: Math.abs(trend.change) })}</span>
          )}
          <span className="text-xs text-muted-foreground">{[trend.latest.bureau, fmtDate(trend.latest.date)].filter(Boolean).join(" · ")}</span>
        </div>
      ) : (
        q.isError ? <p className="mb-3 text-sm text-expense">{t("loadFailed")}</p> : !q.isPending && <p className="mb-3 text-sm text-muted-foreground">{t("empty")}</p>
      )}
      {trend.reportDue && <p className="mb-3 rounded-lg bg-primary/10 p-3 text-sm text-pretty">{t("reportDue")}</p>}

      {open && (
        <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (valid) add.mutate(); }}>
          <label className="flex w-36 flex-col gap-1 text-xs text-muted-foreground">{t("date")}<input type="date" className={field} value={date} max={todayIso()} required onChange={(e) => setDate(e.target.value)} /></label>
          <label className="flex w-24 flex-col gap-1 text-xs text-muted-foreground">{t("score")}<input className={field} inputMode="numeric" value={score} required autoFocus onChange={(e) => setScore(e.target.value.trim())} /></label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">{t("bureau")}<input className={field} value={bureau} maxLength={60} placeholder={t("bureauPlaceholder")} onChange={(e) => setBureau(e.target.value)} /></label>
          <button type="submit" disabled={!valid || add.isPending} className="h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring">{t("save")}</button>
          <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{t("cancel")}</button>
        </form>
      )}

      {trend.history.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {trend.history.map((s) => (
            <li key={s.id} className="flex min-h-11 items-center gap-3">
              <span className="w-24 text-muted-foreground">{fmtDate(s.date)}</span>
              <bdi className="tabular-nums font-medium">{s.score}</bdi>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.bureau}</span>
              <button type="button" aria-label={t("remove", { date: fmtDate(s.date) })} disabled={remove.isPending} onClick={() => remove.mutate(s)}
                className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
