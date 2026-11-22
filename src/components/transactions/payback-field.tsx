"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getPayback, linkPayback, unlinkPayback } from "@/lib/api";
import { shekels } from "@/lib/money";
import type { TransactionWithCategory } from "@/lib/types";

/** Pairs a payback credit (a Bit transfer, say) with the expense it repays, and undoes it. */
export function PaybackField({ txn, refresh }: { txn: TransactionWithCategory; refresh: () => void }) {
  const t = useTranslations("manualTxn");
  const locale = useLocale();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ["payback", txn.id], queryFn: () => getPayback(txn.id) });

  if (txn.kind === "transfer") return null;

  const money = (n: number) => shekels(Math.abs(n), locale);
  const data = query.data;

  async function link() {
    const targetId = Number(target);
    if (!Number.isSafeInteger(targetId) || targetId <= 0) return;
    setBusy(true);
    try {
      await linkPayback(txn.id, targetId);
      setTarget("");
      refresh();
      toast.success(t("paybackLinked"));
    } catch {
      toast.error(t("paybackFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function unlink(creditId: number) {
    setBusy(true);
    try {
      await unlinkPayback(creditId);
      refresh();
      toast.success(t("paybackUnlinked"));
    } catch {
      toast.error(t("paybackFailed"));
    } finally {
      setBusy(false);
    }
  }

  const control = "h-11 w-full rounded-lg border bg-background px-3 text-base sm:text-sm";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{t("payback")}</span>
      {data && data.links.length > 0 && (
        <ul className="grid gap-1.5">
          {data.links.map((l) => {
            const other = l.credit.id === txn.id ? l.expense : l.credit;
            return (
              <li key={l.credit.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{other.description}</span>
                  <span className="block text-xs tabular-nums text-muted-foreground">
                    <bdi>{other.date} · {money(other.amount)}</bdi>
                  </span>
                </span>
                <Button type="button" variant="ghost" className="h-9 shrink-0 text-destructive" disabled={busy} onClick={() => void unlink(l.credit.id)}>
                  {t("paybackUnlink")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {data && data.coveredAbs > 0 && txn.chargedAmount < 0 && (
        <p className="text-xs tabular-nums text-muted-foreground">
          {t("paybackCovered", { covered: money(data.coveredAbs), total: money(txn.chargedAmount) })}
        </p>
      )}
      {data &&
        (data.candidates.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t("paybackPick")}
              className={`${control} min-w-0 flex-1`}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">{t("paybackPick")}</option>
              {data.candidates.map((c) => (
                <option key={c.id} value={c.id}>{`${c.date} · ${c.description} · ${money(c.amount)}`}</option>
              ))}
            </select>
            <Button type="button" className="h-11" disabled={!target || busy} onClick={() => void link()}>
              {t("paybackLink")}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("paybackNone")}</p>
        ))}
      <p className="text-xs text-pretty text-muted-foreground">{t("paybackHint")}</p>
    </div>
  );
}
