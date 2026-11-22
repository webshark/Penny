"use client";

import Link from "next/link";
import { MerchantMark } from "@/components/transactions/merchant-mark";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Pencil, Trash2 } from "lucide-react";
import { deleteAsset, getAssets, getTransactions } from "@/lib/api";
import { accountLabel, translateCategoryName } from "@/lib/i18n-data";
import { ACCOUNT_GROUPS, accountGroupOf, type AccountGroupKey } from "@/lib/account-groups";
import { storePreference } from "@/lib/preference-sync";
import { shekels } from "@/lib/money";
import { useSidebarAccountsPref } from "@/components/layout/sidebar-accounts";
import { AssetDialog } from "@/components/investments/asset-dialog";
import { CardError, CardSkeleton } from "@/components/home/card-shell";
import { Button } from "@/components/ui/button";
import type { Asset, AssetType } from "@/lib/types";
import { HoldingTrades } from "@/components/accounts/holding-trades";

const TRADED = new Set<AssetType>(["stock", "fund", "bond", "crypto", "metal"]);

type Tab = "details" | "connection" | "settings";

/** Account page: the account card with its details, beside the account's own transactions. */
export function AccountDetail({ id }: { id: number }) {
  const t = useTranslations("accountDetail");
  const tInv = useTranslations("investments");
  const tGroups = useTranslations("accountsView.groups");
  const tBanks = useTranslations("banks");
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const assets = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const asset = assets.data?.assets.find((a) => a.id === id);
  const [tab, setTab] = useState<Tab>("details");
  const [editing, setEditing] = useState(false);
  const { hidden, moves } = useSidebarAccountsPref();
  const remove = useMutation({
    mutationFn: () => deleteAsset(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["assets"] }); toast.success(t("deleted")); router.push("/accounts"); },
    onError: () => toast.error(t("failed")),
  });

  if (assets.isError) return <CardError label={t("title")} />;
  if (!assets.data) return <CardSkeleton label={t("title")} height={320} />;
  if (!asset) return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <p className="font-medium">{t("notFound")}</p>
      <Link href="/accounts" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline"><ArrowRight className="size-4 ltr:rotate-180" aria-hidden />{t("back")}</Link>
    </div>
  );

  const synced = asset.source === "bank";
  const name = accountLabel(asset, tBanks);
  const money = (n: number | null | undefined) => (n == null ? "—" : shekels(Math.round(n), locale));
  const value = asset.valueIls == null ? null : asset.isLiability ? -asset.valueIls : asset.valueIls;
  const natural = accountGroupOf(asset);
  const group = moves[asset.id] ?? natural;
  const date = (d?: string) => (d ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(d.includes("T") ? d : `${d.replace(" ", "T")}Z`)) : "—");
  const tabs: Tab[] = synced ? ["details", "connection", "settings"] : ["details", "settings"];

  function moveTo(to: AccountGroupKey) {
    const next = { ...moves };
    if (to === natural) delete next[id]; else next[id] = to;
    qc.setQueryData(["preference", "sidebar-accounts"], { hidden, moves: next });
    void storePreference("sidebar-accounts", { hidden, moves: next }).catch(() => toast.error(t("failed")));
  }

  const row = (k: string, v: React.ReactNode): [string, React.ReactNode] => [k, v];
  const rows: [string, React.ReactNode][] = synced
    ? [row(t("bank"), name.split(" · ")[0]), row(t("accountNumber"), <bdi dir="ltr">{asset.accountNumber}</bdi>), row(t("type"), tInv(`type_${asset.type}`)), row(t("updated"), date(asset.updatedAt))]
    : [
        row(t("type"), tInv(`type_${asset.type}`)),
        row(t("currency"), asset.currency),
        row(t("value"), <bdi data-money>{money(value)}</bdi>),
        ...(asset.costBasis != null ? [row(t("cost"), <bdi data-money>{asset.currency === "ILS" ? money(asset.costBasis) : `${asset.costBasis} ${asset.currency}`}</bdi>)] : []),
        ...(asset.gainIls != null ? [row(t("gain"), <bdi data-money className={asset.gainIls < 0 ? "text-expense" : "text-status-on-track"}>{money(asset.gainIls)}</bdi>)] : []),
        row(t("liquid"), asset.liquid ? t("yes") : t("no")),
        ...(asset.note ? [row(t("note"), asset.note)] : []),
      ];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section aria-label={name} className="rounded-2xl border border-border bg-card">
        <header className="flex items-start gap-3 p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-sm font-semibold text-primary" aria-hidden>{name.slice(0, 2)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{name}</h2>
            <p className={`text-3xl font-semibold tabular-nums ${value != null && value < 0 ? "text-expense" : ""}`} data-money><bdi>{money(value)}</bdi></p>
          </div>
          {!synced && <Button variant="ghost" size="icon" aria-label={t("edit")} onClick={() => setEditing(true)}><Pencil aria-hidden /></Button>}
        </header>
        <div role="tablist" aria-label={t("title")} className="mx-5 flex gap-1 rounded-xl bg-muted p-1">
          {tabs.map((k) => (
            <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`min-h-9 flex-1 rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring ${tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{t(`tab_${k}`)}</button>
          ))}
        </div>
        <div role="tabpanel" className="p-5 pt-3">
          {tab === "details" && (
            <dl className="divide-y divide-border">
              {rows.map(([k, v]) => <div key={k} className="flex min-h-12 items-center gap-4 py-2 text-sm"><dt className="w-36 shrink-0 text-muted-foreground">{k}</dt><dd className="min-w-0 flex-1 font-medium">{v}</dd></div>)}
            </dl>
          )}
          {tab === "connection" && (
            <div className="space-y-3 py-2 text-sm">
              <p>{t("connectionHint", { bank: name.split(" · ")[0] })}</p>
              <p className="text-muted-foreground">{t("updated")}: {date(asset.updatedAt)}</p>
              <Link href="/settings/bank" className="inline-flex min-h-11 items-center rounded-lg bg-primary/15 px-4 font-medium text-primary hover:bg-primary/25 focus-visible:outline-2 focus-visible:outline-ring">{t("manageConnection")}</Link>
            </div>
          )}
          {tab === "settings" && (
            <div className="space-y-4 py-2 text-sm">
              <label className="flex min-h-12 items-center gap-4">
                <span className="w-36 shrink-0 text-muted-foreground">{t("group")}</span>
                <select value={group} disabled={asset.isLiability} onChange={(e) => moveTo(e.target.value as AccountGroupKey)}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 focus-visible:outline-2 focus-visible:outline-ring">
                  {ACCOUNT_GROUPS.filter((k) => (asset.isLiability ? k === "liabilities" : k !== "liabilities")).map((k) => <option key={k} value={k}>{tGroups(k)}</option>)}
                </select>
              </label>
              {!synced && (
                <Button variant="outline" className="min-h-11 text-destructive" disabled={remove.isPending}
                  onClick={() => { if (window.confirm(t("confirmDelete", { name }))) remove.mutate(); }}><Trash2 aria-hidden />{t("delete")}</Button>
              )}
            </div>
          )}
        </div>
      </section>
      {/* A holding keeps its buys and sells; a bank account shows its transactions. */}
      {!synced && !asset.isLiability && TRADED.has(asset.type) ? <HoldingTrades asset={asset} /> : <AccountTransactions asset={asset} />}
      {editing && <AssetDialog asset={asset} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </div>
  );
}

/** The right panel: this account's recent transactions (synced accounts); a manual account has none. */
function AccountTransactions({ asset }: { asset: Asset }) {
  const t = useTranslations("accountDetail");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const q = useQuery({
    queryKey: ["transactions", "account", asset.accountNumber],
    queryFn: () => getTransactions({ account: asset.accountNumber, limit: 30, sort: "date", order: "desc" }),
    enabled: !!asset.accountNumber,
  });
  const fmt = (n: number, cur: string | null) => new Intl.NumberFormat(locale, { style: "currency", currency: cur || "ILS", maximumFractionDigits: 2 }).format(n);
  return (
    <section aria-label={t("transactions")} className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{t("transactions")}</h2>
        {asset.accountNumber && <Link href="/transactions" className="text-sm text-primary hover:underline">{t("allTransactions")}</Link>}
      </div>
      {!asset.accountNumber ? <p className="py-8 text-center text-sm text-muted-foreground">{t("manualNoTransactions")}</p>
        : q.isError ? <p role="alert" className="text-sm">{t("failed")}</p>
        : !q.data ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
        : q.data.transactions.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t("noTransactions")}</p>
        : <ul className="-mx-2">
            {q.data.transactions.map((r) => (
              <li key={r.id} className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5">
                <MerchantMark name={r.description} size={30} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.categoryName ? translateCategoryName(r.categoryName, tCat) : t("uncategorized")}</span><span className="block truncate text-xs text-muted-foreground" title={r.description}>{r.description}</span></span>
                <span className="text-end"><bdi data-money className={`block text-sm font-semibold tabular-nums ${r.kind === "income" ? "text-status-on-track" : r.kind === "expense" ? "text-expense" : ""}`}>{fmt(r.chargedAmount, r.chargedCurrency)}</bdi><span className="block text-[11px] text-muted-foreground">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(r.date))}</span></span>
              </li>
            ))}
          </ul>}
    </section>
  );
}
