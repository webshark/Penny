"use client";

import { accountLabel } from "@/lib/i18n-data";
import { studyFundLiquidFrom } from "@/lib/study-fund";
import { usePlan } from "@/hooks/use-plan";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileUp, Pencil, Plus, RotateCw, Trash2 } from "lucide-react";
import { fmt, shekels } from "@/lib/money";
import { createAssets, deleteAsset, getAssets, updateAsset } from "@/lib/api";
import { CardShell } from "@/components/home/card-shell";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";
import { AssetDialog } from "./asset-dialog";
import { ImportDialog } from "./import-dialog";
import { InvestmentsExtras } from "./investments-extras";
import { KidsInvestments } from "./kids-investments";
import { MarketsView } from "@/components/markets/markets-view";
import type { Asset, AssetsPayload } from "@/lib/types";

const pct = (n: number) => `${n >= 0 ? "+" : "−"}${(Math.abs(n) * 100).toFixed(1)}%`;

/** Allocation colours: the three brand tones first, then neutral steps. */
const ALLOC_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

export function InvestmentsView() {
  const t = useTranslations("investments");
  const [editing, setEditing] = useState<Asset | "new" | null>(null);
  const simple = usePlanSimple();
  const [importing, setImporting] = useState(false);
  const query = useQuery({ queryKey: ["assets"], queryFn: getAssets });

  return (
    <div className="space-y-4 md:space-y-6">
      {query.isError ? (
        <CardShell>
          <p className="text-footnote text-muted-foreground">{t("loadFailed")}</p>
          <IconButton showLabel label={t("retry")} variant="outline" className="mt-3 self-start" onClick={() => query.refetch()}><RotateCw className="size-4" aria-hidden /></IconButton>
        </CardShell>
      ) : !query.data ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-40 rounded-2xl md:col-span-2" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl md:col-span-3" />
        </div>
      ) : query.data.assets.length === 0 ? (
        <CardShell>
          <div className="mx-auto max-w-md py-8 text-center">
            <h2 className="text-title font-semibold">{t("emptyTitle")}</h2>
            <p className="mt-2 text-footnote text-pretty text-muted-foreground">{t("emptyBody")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <IconButton showLabel label={t("addAsset")} variant="default" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /></IconButton>
              <IconButton showLabel label={t("importCsv")} variant="outline" onClick={() => setImporting(true)}><FileUp className="size-4" aria-hidden /></IconButton>
            </div>
          </div>
        </CardShell>
      ) : (
        <Body data={query.data} onEdit={setEditing} actions={
          <div className="flex flex-wrap gap-2">
            <IconButton showLabel label={t("importCsv")} variant="outline" size="sm" onClick={() => setImporting(true)}><FileUp className="size-4" aria-hidden /></IconButton>
            <IconButton showLabel label={t("addAsset")} variant="default" size="sm" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /></IconButton>
          </div>
        } />
      )}

      <KidsInvestments />

      {!simple && <section id="markets" className="card-surface scroll-mt-20">
        <h2 className="text-headline font-semibold">{t("marketsTitle")}<span className="card-sub block font-normal">{t("marketsHint")}</span></h2>
        <div className="pt-6"><MarketsView /></div>
      </section>}

      {editing && <AssetDialog asset={editing} onClose={() => setEditing(null)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

function Body({ data, onEdit, actions }: { data: AssetsPayload; onEdit: (a: Asset) => void; actions: ReactNode }) {
  const t = useTranslations("investments");
  const locale = useLocale();
  const owned = data.assets.filter((a) => !a.isLiability);
  const owed = data.assets.filter((a) => a.isLiability);
  const missing = data.assets.filter((a) => a.valueIls == null);

  return (
    <>
      {/* Net worth itself lives in FutureHero at the top of the page. */}
      {missing.length > 0 && (
        <p className="rounded-2xl bg-card px-4 py-3 text-footnote text-status-heads-up" role="status">
          {t("missingPrices", { names: missing.map((a) => a.name).join(", ") })}
        </p>
      )}

      <HoldingsList title={t("assetsTitle")} assets={owned} onEdit={onEdit} action={actions} />

      <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        <div className="md:col-span-2 lg:col-span-1"><Benchmarks data={data} /></div>
        <Allocation title={t("byType")} parts={groupBy(owned, (a) => t(`type_${a.type}`))} />
        <Allocation title={t("byCurrency")} parts={groupBy(owned, (a) => currencyName(a.currency, locale))} />
      </div>

      {owed.length > 0 && <HoldingsList title={t("liabilitiesTitle")} assets={owed} onEdit={onEdit} />}
      {!usePlanSimple() && <InvestmentsExtras data={data} />}
    </>
  );
}

function groupBy(assets: Asset[], key: (a: Asset) => string) {
  const map = new Map<string, number>();
  for (const a of assets) map.set(key(a), (map.get(key(a)) ?? 0) + (a.valueIls ?? 0));
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function Allocation({ title, parts }: { title: string; parts: { label: string; value: number }[] }) {
  const locale = useLocale();
  const total = parts.reduce((s, p) => s + p.value, 0);
  // Fold the tail into "other" so colours stay distinct.
  const shown = parts.length > ALLOC_COLORS.length ? [...parts.slice(0, ALLOC_COLORS.length - 1), { label: "…", value: parts.slice(ALLOC_COLORS.length - 1).reduce((s, p) => s + p.value, 0) }] : parts;
  return (
    <CardShell label={title}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        {shown.map((p, i) => <span key={p.label} style={{ width: `${total ? (p.value / total) * 100 : 0}%`, backgroundColor: ALLOC_COLORS[i] }} />)}
      </div>
      <ul className="mt-4 space-y-2">
        {shown.map((p, i) => (
          <li key={p.label} className="flex items-baseline justify-between gap-3 text-footnote">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: ALLOC_COLORS[i] }} aria-hidden />
              <span className="truncate" title={p.label}>{p.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold">{total ? `${Math.round((p.value / total) * 100)}%` : "—"}</span>
              <span className="ms-2 text-muted-foreground">{shekels(p.value, locale)}</span>
            </span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function Benchmarks({ data }: { data: AssetsPayload }) {
  const t = useTranslations("investments");
  const tm = useTranslations("markets.symbols");
  const withCost = data.assets.filter((a) => !a.isLiability && a.gainIls != null && a.valueIls != null);
  const cost = withCost.reduce((s, a) => s + (a.valueIls! - a.gainIls!), 0);
  const gain = withCost.reduce((s, a) => s + a.gainIls!, 0);
  const rows = [
    { label: t("yourReturn"), value: cost > 0 ? gain / cost : null, note: t("yourReturnNote") },
    ...data.benchmarks.map((b) => ({ label: tm(b.symbol === "^GSPC" ? "sp500" : "ta125"), value: b.change12m, note: t("last12m") })),
  ];
  return (
    <CardShell label={t("vsMarket")}>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.label} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-footnote font-medium">{r.label}</span>
              <span className="text-caption text-muted-foreground">{r.note}</span>
            </span>
            <span dir="ltr" className={cn("text-headline font-semibold tabular-nums", r.value == null ? "text-muted-foreground" : r.value >= 0 ? "text-status-on-track" : "text-status-over")}>
              {r.value == null ? "—" : pct(r.value)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-caption text-pretty text-muted-foreground">{t("vsMarketHint")}</p>
    </CardShell>
  );
}

function HoldingsList({ title, assets, onEdit, action }: { title: string; assets: Asset[]; onEdit: (a: Asset) => void; action?: ReactNode }) {
  const t = useTranslations("investments");
  const tBanks = useTranslations("banks");
  const label = (a: Asset) => accountLabel(a, tBanks);
  const locale = useLocale();
  const queryClient = useQueryClient();
  // Delete at once and offer Undo, instead of asking "are you sure?" first.
  const remove = useMutation({
    mutationFn: (a: Asset) => deleteAsset(a.id),
    onSuccess: (_, a) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("deletedName", { name: label(a) }), {
        action: {
          label: t("undo"),
          onClick: () =>
            void createAssets([a]).then(() => queryClient.invalidateQueries({ queryKey: ["assets"] })),
        },
      });
    },
    onError: () => toast.error(t("deleteFailed")),
  });

  return (
    <CardShell label={title} action={action}>
      <ul className="-mt-3 -mb-3 divide-y divide-border/60">
        {assets.map((a) => (
          <li key={a.id} className="flex items-center gap-x-3 py-3 sm:gap-x-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-footnote font-medium" title={label(a)}>{label(a)}</p>
              <p className="text-caption text-pretty text-muted-foreground">
                {t(`type_${a.type}`)}
                {a.symbol && a.quantity != null && (
                  <> · <span dir="ltr">{fmt(a.quantity, locale, a.quantity % 1 ? 2 : 0)} × {a.symbol}</span></>
                )}
                {a.type === "study_fund" && a.purchaseMonth && !a.liquid
                  ? <> · {t("liquidFrom", { date: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${studyFundLiquidFrom(a.purchaseMonth)}-15T12:00:00`)) })}</>
                  : !a.liquid && !a.isLiability && <> · {t("illiquid")}</>}
                {a.quote?.stale && <> · {t("stalePrice")}</>}
                {a.source === "bank" && <> · {t("fromBank")}</>}
              </p>
              {a.estimate && <HomeEstimate asset={a} />}
            </div>
            {a.quote && a.quote.series.length > 1 && (
              <Sparkline values={a.quote.series} color="var(--chart-1)" label={t("priceTrend", { name: label(a) })} fitToRange className="hidden h-7 w-20 sm:block" />
            )}
            <div className="shrink-0 text-end">
              <p className={cn("text-footnote font-semibold tabular-nums", a.isLiability && "text-status-over")}>
                {a.valueIls == null ? "—" : shekels(a.isLiability ? -a.valueIls : a.valueIls, locale)}
              </p>
              <p className="text-caption tabular-nums text-muted-foreground" dir="ltr">
                {a.quote?.changeDay != null && (
                  <span className={a.quote.changeDay >= 0 ? "text-status-on-track" : "text-status-over"}>{pct(a.quote.changeDay)} </span>
                )}
                {a.gainIls != null && <span title={a.fxGainIls != null ? t("gainSplit", { price: shekels(a.gainIls - a.fxGainIls, locale), fx: shekels(a.fxGainIls, locale) }) : undefined}>{shekels(a.gainIls, locale)}</span>}
                {a.fxGainIls != null && <span className="block" dir="auto">{t("fxPart", { amount: shekels(a.fxGainIls, locale) })}</span>}
              </p>
            </div>
            <div className={cn("-me-2 flex shrink-0", a.source === "bank" && "invisible")} aria-hidden={a.source === "bank" || undefined}>
              <Button variant="ghost" size="icon" aria-label={t("editAsset", { name: label(a) })} onClick={() => onEdit(a)}>
                <Pencil className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("deleteAsset", { name: label(a) })}
                disabled={remove.isPending}
                onClick={() => remove.mutate(a)}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

/** Index-based estimate for a home, with one click to use it as the value (and Undo). */
function HomeEstimate({ asset }: { asset: Asset }) {
  const t = useTranslations("property");
  const ti = useTranslations("investments");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const e = asset.estimate!;
  const save = (manualValue: number | null) => updateAsset(asset.id, { ...asset, manualValue }).then(() => queryClient.invalidateQueries({ queryKey: ["assets"] }));
  const apply = useMutation({
    mutationFn: () => save(e.value),
    onSuccess: () => toast.success(t("applied"), { action: { label: ti("undo"), onClick: () => void save(asset.manualValue) } }),
    onError: () => toast.error(ti("saveFailed")),
  });
  const [y, m] = e.indexMonth.split("-").map(Number);
  return (
    <div className="mt-1 text-caption text-pretty text-muted-foreground">
      {t("estimateIndex", { value: shekels(e.value, locale), change: pct(e.change), month: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(y, m - 1, 15)) })}
      {" · "}{t("estimateOnly")}
      {asset.manualValue !== e.value && !asset.symbol && (
        <button type="button" className="ms-2 min-h-6 font-medium text-primary hover:underline disabled:opacity-50" disabled={apply.isPending} onClick={() => apply.mutate()}>
          {t("apply")}
        </button>
      )}
    </div>
  );
}

const usePlanSimple = () => usePlan().plan.simpleMode;

/** "שקל חדש" / "US Dollar" instead of a bare ISO code; the code itself when the browser has no name for it. */
function currencyName(code: string, locale: string): string {
  try { return new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code; } catch { return code; }
}
