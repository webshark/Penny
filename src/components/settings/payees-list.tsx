"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { RotateCcw, Search, Store } from "lucide-react";
import { deleteExcludedMerchantRule, getMerchants, listExcludedMerchants } from "@/lib/api";
import { shekels } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingCard } from "@/components/settings/section-shell";

const PAGE = 50;

/** Payees: every merchant with how often and how much, and the ones kept out of the totals. */
export function PayeesList() {
  const t = useTranslations("settings.payees");
  const locale = useLocale();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["merchants"], queryFn: getMerchants });
  const excluded = useQuery({ queryKey: ["excluded-merchants"], queryFn: listExcludedMerchants });
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);
  const term = search.trim().toLowerCase();
  const list = (q.data?.merchants ?? []).filter((m) => m.merchant.toLowerCase().includes(term));
  const date = (d: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d.slice(0, 10)}T12:00:00`));

  async function restore(id: number) {
    try { await deleteExcludedMerchantRule(id); await qc.invalidateQueries({ queryKey: ["excluded-merchants"] }); toast.success(t("restored")); }
    catch { toast.error(t("failed")); }
  }

  return (
    <>
      <SettingCard title={t("listTitle", { n: q.data?.merchants.length ?? 0 })}>
        <label className="relative mb-3 block">
          <span className="sr-only">{t("search")}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} placeholder={t("search")} className="ps-9" />
        </label>
        {q.isError ? <p role="alert" className="text-sm">{t("failed")}</p>
          : !q.data ? <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>
          : list.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("noMatch")}</p>
          : <>
            <ul className="divide-y divide-border">
              {list.slice(0, shown).map((m) => (
                <li key={m.merchant}>
                  <Link href={`/transactions?search=${encodeURIComponent(m.merchant)}&month=${m.last.slice(0, 7)}`} className="flex min-h-14 items-center gap-3 py-2 hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-semibold text-primary" aria-hidden>{m.merchant.trim().charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{m.merchant}</span><span className="block text-xs text-muted-foreground">{t("meta", { n: m.count, date: date(m.last) })}</span></span>
                    <bdi className={`text-sm font-semibold tabular-nums ${m.total < 0 ? "" : "text-status-on-track"}`} data-money>{shekels(Math.round(m.total), locale)}</bdi>
                  </Link>
                </li>
              ))}
            </ul>
            {list.length > shown && <Button variant="outline" className="mt-3 w-full" onClick={() => setShown(shown + PAGE)}>{t("more", { n: list.length - shown })}</Button>}
          </>}
      </SettingCard>

      {(excluded.data?.rules.length ?? 0) > 0 && (
        <SettingCard title={t("excludedTitle")} description={t("excludedHint")}>
          <ul className="divide-y divide-border">
            {excluded.data!.rules.map((r) => (
              <li key={r.id} className="flex min-h-12 items-center gap-3 py-2">
                <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1 truncate">{r.merchantKey}</span>
                <Button size="sm" variant="ghost" onClick={() => void restore(r.id)}><RotateCcw aria-hidden />{t("restore")}</Button>
              </li>
            ))}
          </ul>
        </SettingCard>
      )}
    </>
  );
}
