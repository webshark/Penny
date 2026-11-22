"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Users, X } from "lucide-react";
import { addShare, deleteShare, getShares, setShareSettled } from "@/lib/api";
import { shekels } from "@/lib/money";

/** Who owes part of this expense, and whether they paid it back. */
export function SharesField({ transactionId, total }: { transactionId: number; total: number }) {
  const t = useTranslations("shares");
  const locale = useLocale();
  const qc = useQueryClient();
  const key = ["shares", transactionId];
  const q = useQuery({ queryKey: key, queryFn: () => getShares(transactionId) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: ["shares"] }); };
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState(String(Math.round((Math.abs(total) / 2) * 100) / 100));
  const fail = () => toast.error(t("failed"));
  const add = useMutation({ mutationFn: () => addShare(transactionId, person.trim(), Number(amount)), onSuccess: () => { refresh(); setPerson(""); setOpen(false); }, onError: fail });
  const settle = useMutation({ mutationFn: (s: { id: number; settled: boolean }) => setShareSettled(s.id, s.settled), onSuccess: refresh, onError: fail });
  const remove = useMutation({
    mutationFn: (s: { id: number; person: string; amount: number; settledAt: string | null }) => deleteShare(s.id),
    onSuccess: (_r, s) => {
      refresh();
      toast.success(t("removed", { person: s.person }), {
        action: {
          label: t("undo"),
          onClick: () => void addShare(transactionId, s.person, s.amount)
            .then((back) => (s.settledAt ? setShareSettled(back.id, true) : undefined))
            .then(refresh, fail),
        },
      });
    },
    onError: fail,
  });
  const shares = q.data?.shares ?? [];
  // Shares can't add up to more than the expense; the server refuses that too.
  const left = Math.round((Math.abs(total) - shares.reduce((sum, x) => sum + x.amount, 0)) * 100) / 100;
  const tooMuch = Number(amount) > left + 0.005;
  const valid = person.trim() !== "" && Number(amount) > 0 && !tooMuch;
  const field = "h-11 rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{t("title")}</span>
      {shares.length > 0 && (
        <ul className="flex flex-col gap-1">
          {shares.map((s) => (
            <li key={s.id} className="flex min-h-11 items-center gap-2 rounded-lg bg-muted/60 ps-3">
              <span className={`min-w-0 flex-1 truncate text-sm ${s.settledAt ? "text-muted-foreground line-through" : ""}`}>{t("owes", { person: s.person })}</span>
              <bdi className="tabular-nums text-sm" data-money>{shekels(s.amount, locale)}</bdi>
              <button type="button" aria-pressed={!!s.settledAt} aria-label={t(s.settledAt ? "unsettle" : "settle", { person: s.person })} disabled={settle.isPending}
                onClick={() => settle.mutate({ id: s.id, settled: !s.settledAt })}
                className={`grid size-11 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-ring ${s.settledAt ? "text-status-on-track" : "text-muted-foreground hover:text-foreground"}`}><Check className="size-4" aria-hidden /></button>
              <button type="button" aria-label={t("remove", { person: s.person })} disabled={remove.isPending} onClick={() => remove.mutate(s)}
                className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        // Not a <form>: this sits inside the transaction sheet's form, and a nested form's Enter submitted the outer one.
        <div role="group" aria-label={t("title")} className="flex flex-wrap items-end gap-2"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); e.stopPropagation(); if (valid && !add.isPending) add.mutate(); } }}>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">{t("person")}
            <input className={field} value={person} maxLength={80} autoFocus onChange={(e) => setPerson(e.target.value)} placeholder={t("personPlaceholder")} /></label>
          <label className="flex w-28 flex-col gap-1 text-xs text-muted-foreground">{t("amount")}
            <input className={field} inputMode="decimal" value={amount} aria-invalid={tooMuch} aria-describedby={tooMuch ? "share-too-much" : undefined} onChange={(e) => setAmount(e.target.value)} /></label>
          <button type="button" onClick={() => add.mutate()} disabled={!valid || add.isPending} className="h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring">{t("save")}</button>
          {tooMuch && <p id="share-too-much" role="alert" className="w-full text-sm text-expense">{t("tooMuch", { left: shekels(Math.max(0, left), locale) })}</p>}
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <Users className="size-4" aria-hidden />{t("add")}
        </button>
      )}
    </div>
  );
}
