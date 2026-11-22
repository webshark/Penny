"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { addTrade, deleteTrade, getTrades } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Asset } from "@/lib/types";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());

/** Portfolio transactions on a holding's page: each buy and sell, and what they add up to. */
export function HoldingTrades({ asset }: { asset: Asset }) {
  const t = useTranslations("holdingTrades");
  const locale = useLocale();
  const qc = useQueryClient();
  const key = ["trades", asset.id];
  const q = useQuery({ queryKey: key, queryFn: () => getTrades(asset.id) });
  const [draft, setDraft] = useState<{ date: string; kind: "buy" | "sell"; quantity: string; price: string; fee: string } | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: ["assets"] }); };
  const add = useMutation({
    mutationFn: () => addTrade(asset.id, { date: draft!.date, kind: draft!.kind, quantity: Number(draft!.quantity), price: Number(draft!.price), fee: Number(draft!.fee || 0), note: null }),
    onSuccess: () => { refresh(); setDraft(null); toast.success(t("added")); },
    onError: () => toast.error(t("failed")),
  });
  const remove = useMutation({ mutationFn: deleteTrade, onSuccess: refresh, onError: () => toast.error(t("failed")) });
  const cur = asset.currency;
  const money = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n);
  const num = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(n);
  const date = (d: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d}T12:00:00`));
  const valid = !!draft && Number(draft.quantity) > 0 && Number(draft.price) >= 0 && draft.price !== "" && Number(draft.fee || 0) >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(draft.date);
  const s = q.data?.summary;
  const trades = q.data?.trades ?? [];

  return (
    <section aria-label={t("title")} className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{t("title")}</h2>
        {!draft && <Button size="sm" variant="outline" onClick={() => setDraft({ date: today(), kind: "buy", quantity: "", price: "", fee: "" })}><Plus aria-hidden />{t("add")}</Button>}
      </div>

      {s && trades.length > 0 && (
        <dl className="mb-4 grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">{t("held")}</dt><dd className="font-semibold tabular-nums"><bdi>{num(s.quantity)}</bdi></dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("avgCost")}</dt><dd className="font-semibold tabular-nums"><bdi>{s.quantity > 0 ? money(s.costBasis / s.quantity) : "—"}</bdi></dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("realized")}</dt><dd className={`font-semibold tabular-nums ${s.realized < 0 ? "text-expense" : s.realized > 0 ? "text-status-on-track" : ""}`}><bdi>{money(s.realized)}</bdi></dd></div>
        </dl>
      )}

      {draft && (
        <form className="mb-4 space-y-3 rounded-xl border border-border p-3" onSubmit={(e) => { e.preventDefault(); if (valid) add.mutate(); }}>
          <div role="radiogroup" aria-label={t("kind")} className="flex gap-1 rounded-lg bg-muted p-1">
            {(["buy", "sell"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={draft.kind === k} onClick={() => setDraft({ ...draft, kind: k })}
                className={`min-h-9 flex-1 rounded-md text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring ${draft.kind === k ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{t(k)}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">{t("date")}<Input type="date" dir="ltr" required value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
            <label className="space-y-1 text-sm">{t("quantity")}<Input type="number" inputMode="decimal" min="0" step="any" dir="ltr" required value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} /></label>
            <label className="space-y-1 text-sm">{t("price", { currency: cur })}<Input type="number" inputMode="decimal" min="0" step="any" dir="ltr" required value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></label>
            <label className="space-y-1 text-sm">{t("fee", { currency: cur })}<Input type="number" inputMode="decimal" min="0" step="any" dir="ltr" value={draft.fee} onChange={(e) => setDraft({ ...draft, fee: e.target.value })} /></label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={!valid || add.isPending}>{t("save")}</Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>{t("cancel")}</Button>
          </div>
        </form>
      )}

      {q.isError ? <p role="alert" className="text-sm">{t("failed")}</p>
        : !q.data ? <p role="status" className="py-6 text-center text-sm text-muted-foreground">{t("loading")}</p>
        : trades.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
        : <ul className="divide-y divide-border">
            {trades.map((tr) => (
              <li key={tr.id} className="flex min-h-12 items-center gap-3 py-2 text-sm">
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${tr.kind === "buy" ? "bg-status-on-track/15 text-status-on-track" : "bg-expense/15 text-expense"}`}>{t(tr.kind)}</span>
                <span className="min-w-0 flex-1"><bdi className="tabular-nums">{num(tr.quantity)} × {money(tr.price)}</bdi>{tr.fee > 0 && <span className="text-xs text-muted-foreground"> · {t("feeShort", { amount: money(tr.fee) })}</span>}<span className="block text-xs text-muted-foreground">{date(tr.date)}</span></span>
                <bdi className="font-semibold tabular-nums">{money(tr.quantity * tr.price)}</bdi>
                <Button size="icon" variant="ghost" aria-label={t("delete")} disabled={remove.isPending} onClick={() => { if (window.confirm(t("confirmDelete"))) remove.mutate(tr.id); }}><Trash2 aria-hidden /></Button>
              </li>
            ))}
          </ul>}
      <p className="mt-3 text-xs text-muted-foreground">{t("hint")}</p>
    </section>
  );
}
