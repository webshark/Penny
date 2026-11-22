"use client";

import { useState } from "react";
import { localizeBankLabel } from "@/lib/i18n-data";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CardShell } from "@/components/home/card-shell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getBalanceForecast, setCardBankLink } from "@/lib/api";
import type { AccountForecast, AccountPoint } from "@/lib/balance-forecast";
import { shekels } from "@/lib/money";
import { useGentle } from "@/hooks/use-gentle";

const NONE = "__none";

/**
 * The same 90 days as the balance card above, but each bank account on its own: the expected
 * line, a low/high band for estimates, the amount needed to stay above the reserve, and which
 * bank pays each card.
 */
export function AccountForecastCard() {
  const t = useTranslations("ahead");
  const tBanks = useTranslations("banks");
  const locale = useLocale();
  const gentle = useGentle();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["balance-forecast"], queryFn: getBalanceForecast });
  const data = query.data?.accounts;
  const [selected, setSelected] = useState("total");

  const mapping = useMutation({
    mutationFn: ({ card, bank }: { card: string; bank: string | null }) => setCardBankLink(card, bank),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["balance-forecast"] });
      toast.success(t("mappingSaved"));
    },
    onError: (e: Error) => toast.error(e.message || t("saveMappingFailed")),
  });

  if (!data || data.accounts.length === 0) return null;

  const money = (n: number) => shekels(Math.round(n), locale);
  const date = (d: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  // If the selected account disappears (a sync removed it), fall back to the total.
  const chosen = selected === "total" || data.accounts.some((a) => a.account === selected) ? selected : "total";
  const view = chosen === "total" ? data.total : data.accounts.find((a) => a.account === chosen) ?? data.total;
  const label = (s: string) => localizeBankLabel(s, tBanks);
  const name = (a: AccountForecast) => (a.account === "total" ? t("allAccounts") : label(a.name));

  return (
    <CardShell label={t("accountsTitle")}>
      <p className="mb-3 text-caption text-pretty text-muted-foreground">{t("accountsHint")}</p>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <label className="flex items-center gap-2 text-caption text-muted-foreground">
          {t("accountSelect")}
          <Select value={chosen} onValueChange={(v) => v && setSelected(v)}>
            <SelectTrigger className="w-52">
              <SelectValue>{(v: string) => (v === "total" ? t("allAccounts") : data.accounts.find((a) => a.account === v)?.name ?? t("allAccounts"))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total">{t("allAccounts")}</SelectItem>
              {data.accounts.map((a) => (
                <SelectItem key={a.account} value={a.account}>{label(a.name)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <p className="text-caption text-muted-foreground">{t("bandNote")}</p>
      </div>

      <BandChart points={view.points} />
      <div dir="ltr" className="mt-1 flex justify-between text-caption text-muted-foreground tabular-nums" aria-hidden>
        <span>{date(data.asOf)}</span>
        <span>{date(data.horizonEnd)}</span>
      </div>

      <ul className="sr-only">
        <li>{t("accountLowest", { amount: money(view.lowest.amount), date: date(view.lowest.date) })}</li>
        <li>{t("accountEnd", { amount: money(view.endBalance) })}</li>
      </ul>

      <ul className="mt-4 divide-y divide-border">
        {data.accounts.map((a) => {
          const short = a.shortfall.amount > 0;
          return (
            <li key={a.account}>
              <button
                type="button"
                onClick={() => setSelected(a.account)}
                aria-pressed={chosen === a.account}
                className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="min-w-0">
                  <span className="block text-footnote font-medium">{name(a)}</span>
                  <span className="block text-caption text-muted-foreground tabular-nums">
                    {t("accountLowest", { amount: money(a.lowest.amount), date: date(a.lowest.date) })}
                  </span>
                </span>
                <span className="flex flex-col items-end text-caption tabular-nums">
                  <span className="text-footnote font-semibold">{money(a.endBalance)}</span>
                  <span className="text-muted-foreground">{t("accountEndLabel")}</span>
                </span>
              </button>
              {short && !gentle && (
                <p className="pb-2 text-caption text-[var(--status-heads-up)]">
                  {a.shortfall.by
                    ? t("accountShortfall", { amount: money(a.shortfall.amount), date: date(a.shortfall.by) })
                    : t("accountShortfallNoDate", { amount: money(a.shortfall.amount) })}
                </p>
              )}
              {a.stale && (
                <p className="pb-2 text-caption text-muted-foreground">
                  {a.balanceDate ? t("accountStale", { date: date(a.balanceDate) }) : t("accountStaleNever")}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {data.cardBanks.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-footnote font-semibold">{t("cardsTitle")}</p>
          <p className="mb-2 mt-0.5 text-caption text-pretty text-muted-foreground">{t("cardsHint")}</p>
          <ul className="space-y-2">
            {data.cardBanks.map((link) => (
              <li key={link.card} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-footnote">{label(link.cardName)}</span>
                  {link.inferred && <span className="text-caption text-muted-foreground">{t("cardInferred")}</span>}
                </span>
                <Select
                  value={link.bank || NONE}
                  onValueChange={(v) => v && !mapping.isPending && mapping.mutate({ card: link.card, bank: v === NONE ? null : v })}
                >
                  <SelectTrigger className="w-52" aria-label={`${label(link.cardName)} — ${t("cardsTitle")}`}>
                    <SelectValue>
                      {(v: string) => (v === NONE ? t("allAccounts") : label(data.accounts.find((a) => a.account === v)?.name ?? v))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("allAccounts")}</SelectItem>
                    {data.accounts.map((a) => (
                      <SelectItem key={a.account} value={a.account}>{label(a.name)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </div>
      )}
    </CardShell>
  );
}

const W = 600;
const H = 140;

/** Expected line over a band between the low and high case; zero is marked when it is in range. */
function BandChart({ points }: { points: AccountPoint[] }) {
  if (points.length < 2) return null;
  const values = points.flatMap((p) => [p.low, p.high]);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => 4 + ((max - v) / range) * (H - 8);
  const upper = points.map((p, i) => `${x(i)},${y(p.high)}`).join(" ");
  const lower = points
    .map((_, i) => i)
    .reverse()
    .map((i) => `${x(i)},${y(points[i].low)}`)
    .join(" ");
  const line = points.map((p, i) => `${x(i)},${y(p.expected)}`).join(" ");
  const lowIndex = points.findIndex((p) => p.expected === Math.min(...points.map((q) => q.expected)));
  const belowZero = min < 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-36 w-full overflow-visible" aria-hidden>
      {belowZero && <rect x="0" y={y(0)} width={W} height={H - y(0)} fill="var(--status-over)" opacity="0.08" />}
      <polygon points={`${upper} ${lower}`} fill="var(--primary)" opacity="0.12" />
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.2" vectorEffect="non-scaling-stroke" />
      <polyline points={line} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {lowIndex >= 0 && (
        <line
          x1={x(lowIndex)}
          x2={x(lowIndex)}
          y1={y(points[lowIndex].expected)}
          y2={y(points[lowIndex].expected)}
          stroke={points[lowIndex].expected < 0 ? "var(--status-over)" : "var(--primary)"}
          strokeWidth="8"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
