"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { addMarketSymbol, getMarkets, removeMarketSymbol } from "@/lib/api";
import { normalizeSymbol } from "@/lib/markets";
import { CardShell } from "@/components/home/card-shell";
import { RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";
import type { MarketsPayload, Quote } from "@/lib/types";

const GROUPS = ["israel", "world", "fx", "commodities"] as const;
const pct = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : "−"}${(Math.abs(n) * 100).toFixed(1)}%`);
const tone = (n: number | null) => (n == null ? "text-muted-foreground" : n >= 0 ? "text-status-on-track" : "text-status-over");

/** Indices and rates are plain numbers; commodities and crypto are priced in dollars. */
function price(q: Quote, group: string, locale: string) {
  const digits = q.price < 20 ? 3 : q.price < 1000 ? 2 : 0;
  const n = q.price.toLocaleString(locale === "he" ? "he-IL" : "en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  return group === "commodities" && q.currency === "USD" ? `$${n}` : n;
}

export function MarketsView() {
  const t = useTranslations("markets");
  const query = useQuery({ queryKey: ["markets"], queryFn: getMarkets, refetchInterval: 15 * 60 * 1000 });

  if (query.isError) {
    return (
      <CardShell>
        <p className="text-footnote text-muted-foreground">{t("loadFailed")}</p>
        <IconButton label={t("retry")} variant="outline" className="mt-3 self-start" onClick={() => query.refetch()}><RotateCw className="size-4" aria-hidden /></IconButton>
      </CardShell>
    );
  }
  if (!query.data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
      </div>
    );
  }

  const items = query.data.items;
  const stale = items.some((i) => i.quote?.stale);
  // Watching comes first: it is the part of this page that belongs to the household.
  const groups = (["watch", ...GROUPS] as const).filter((g) => g === "watch" || items.some((i) => i.group === g));
  return (
    <div className="space-y-6 md:space-y-8">
      {stale && <p className="text-footnote text-status-heads-up" role="status">{t("staleNotice")}</p>}
      {groups.map((g) => {
        const rows = items.filter((i) => i.group === g);
        return (
          <section key={g} aria-labelledby={`mk-${g}`}>
            <h3 id={`mk-${g}`} className="mb-3 px-1 text-headline font-semibold">{t(`group_${g}`)}</h3>
            {g === "watch" && <WatchForm onAdded={() => void query.refetch()} />}
            {g === "watch" && rows.length === 0 && <p className="px-1 text-footnote text-muted-foreground">{t("watchEmpty")}</p>}
            {rows.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((i) => (
                  <Tile key={i.symbol} item={i} onRemove={g === "watch" ? () => { void removeMarketSymbol(i.symbol).then(() => query.refetch(), () => {}); } : undefined} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <p className="px-1 text-caption text-muted-foreground">{t("source")}</p>
    </div>
  );
}

/** One ticker to follow: typed the way Yahoo Finance spells it (AAPL, TEVA.TA, BTC-USD). */
function WatchForm({ onAdded }: { onAdded: () => void }) {
  const t = useTranslations("markets");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <form
      className="mb-3 flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const symbol = normalizeSymbol(value);
        if (!symbol) { setFailed(true); return; }
        setBusy(true);
        try {
          await addMarketSymbol(symbol);
          setValue("");
          setFailed(false);
          onAdded();
        } catch { setFailed(true); }
        finally { setBusy(false); }
      }}
    >
      <input
        value={value}
        onChange={(e) => { setValue(e.target.value); setFailed(false); }}
        placeholder={t("symbolPlaceholder")}
        aria-label={t("symbolPlaceholder")}
        aria-invalid={failed}
        dir="ltr"
        autoComplete="off"
        spellCheck={false}
        className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
      />
      <Button type="submit" disabled={busy} className="min-h-11">{t("addSymbol")}</Button>
      {failed && <p role="alert" className="w-full text-footnote text-destructive">{t("addFailed")}</p>}
    </form>
  );
}

function Tile({ item, onRemove }: { item: MarketsPayload["items"][number]; onRemove?: () => void }) {
  const t = useTranslations("markets");
  const locale = useLocale();
  const q = item.quote;
  // A followed ticker has no translation: the quote carries the company's own name, the symbol is the fallback.
  const name = item.group === "watch" ? q?.name ?? item.symbol : t(`symbols.${item.key}`);
  return (
    <li className="relative rounded-2xl bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-footnote font-semibold">{name}</h3>
          <p className="text-caption text-muted-foreground" dir="ltr">{item.symbol}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn("text-footnote font-semibold tabular-nums", tone(q?.changeDay ?? null))} dir="ltr">
            {pct(q?.changeDay ?? null)}
          </span>
          {onRemove && (
            <button type="button" onClick={onRemove} aria-label={t("removeSymbol", { symbol: item.symbol })} title={t("removeSymbol", { symbol: item.symbol })}
              className="-me-2 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
      {q ? (
        <>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="figure text-[1.75rem] leading-tight" dir="ltr">{price(q, item.group, locale)}</p>
            <Sparkline values={q.series} color={(q.change12m ?? 0) >= 0 ? "var(--status-on-track)" : "var(--status-over)"} label={t("trend12m", { name })} fitToRange className="h-9 w-28" />
          </div>
          <dl className="mt-3 flex gap-5 text-caption">
            <div>
              <dt className="text-muted-foreground">{t("ytd")}</dt>
              <dd className={cn("font-semibold tabular-nums", tone(q.changeYtd))} dir="ltr">{pct(q.changeYtd)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("twelveMonths")}</dt>
              <dd className={cn("font-semibold tabular-nums", tone(q.change12m))} dir="ltr">{pct(q.change12m)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="mt-3 text-footnote text-muted-foreground">{t("unavailable")}</p>
      )}
    </li>
  );
}

/** Three key markets in one line for Home. */
export function MarketStrip() {
  const t = useTranslations("markets");
  const locale = useLocale();
  const query = useQuery({ queryKey: ["markets"], queryFn: getMarkets, refetchInterval: 15 * 60 * 1000 });
  const items = query.data?.items.filter((i) => ["ta125", "sp500", "usdils"].includes(i.key) && i.quote) ?? [];
  if (items.length === 0) return null;
  return (
    <Link
      href="/investments#markets"
      aria-label={t("stripLabel")}
      className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-card px-4 py-3 text-footnote transition-colors hover:bg-accent md:mb-8"
    >
      {items.map((i) => (
        <span key={i.key} className="flex items-baseline gap-2">
          <span className="text-muted-foreground">{t(`symbols.${i.key}`)}</span>
          <span className="font-semibold tabular-nums" dir="ltr">{price(i.quote!, i.group, locale)}</span>
          <span className={cn("tabular-nums", tone(i.quote!.changeDay))} dir="ltr">{pct(i.quote!.changeDay)}</span>
        </span>
      ))}
    </Link>
  );
}
