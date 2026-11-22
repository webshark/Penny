"use client";

import { accountLabel } from "@/lib/i18n-data";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Plus, Trash2 } from "lucide-react";
import { getPlan, savePlan, savePlanItem } from "@/lib/api";
import { ALLOCATION_CLASSES, BENCHMARK_FEES, CLASS_OF, debtPayoff, feeCost, type AllocationClass, type FinancialPlan } from "@/lib/plan";
import { shekels } from "@/lib/money";
import { CMA_SITES } from "@/lib/funds";
import { amortizationSchedule, refinanceCheck, referenceRate, REFINANCE_GAP } from "@/lib/loans";
import { useUndoableDelete } from "@/hooks/use-undoable-delete";
import { CardShell } from "@/components/home/card-shell";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Asset, AssetsPayload } from "@/lib/types";

/** Fees, debts, target allocation and past net worth, under the holdings on the Investments page. */
export function InvestmentsExtras({ data: raw }: { data: AssetsPayload }) {
  const plan = useQuery({ queryKey: ["plan"], queryFn: getPlan });
  const tBanks = useTranslations("banks");
  // Synced accounts arrive with English bank names; show them in the user's language.
  const data = { ...raw, assets: raw.assets.map((a) => ({ ...a, name: accountLabel(a, tBanks) })) };
  if (!plan.data) return null;
  const years = plan.data.plan.birthYear ? plan.data.plan.birthYear + plan.data.plan.retirementAge - new Date().getFullYear() : null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FeesCard assets={data.assets} years={years} />
      <DebtsCard assets={data.assets.filter((a) => a.isLiability)} />
      <AllocationTarget assets={data.assets} plan={plan.data.plan} />
      <PastNetWorth history={data.history} />
    </div>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Median fees of similar funds, when the asset is linked to its fund in the public data. */
function peerFees(a: Asset) {
  const p = a.fund?.peers;
  // Study and provident funds report no deposit fee: that's 0, not unknown.
  return p && p.feeBalance != null ? { balance: p.feeBalance, deposit: p.feeDeposit ?? 0 } : undefined;
}

function FeesCard({ assets, years }: { assets: Asset[]; years: number | null }) {
  const t = useTranslations("plan");
  const locale = useLocale();
  const funds = assets.filter((a) => a.type in BENCHMARK_FEES);
  const rows = funds.map((a) => ({
    a,
    result:
      years && a.valueIls != null
        ? feeCost(a.type, a.valueIls, a.monthlyDeposit ?? 0, years, a.feeDeposit ?? 0, a.feeBalance ?? 0, 0.05, peerFees(a))
        : null,
  }));
  const total = rows.reduce((s, r) => s + (r.result?.cost ?? 0), 0);

  return (
    <CardShell label={t("feesTitle")}>
      {funds.length === 0 ? (
        <>
          <p className="text-footnote text-muted-foreground">{t("feesEmpty")}</p>
          <Link href="/calculators/fees" className="mt-2 text-footnote font-medium text-primary underline-offset-4 hover:underline">{t("feesTypeIn")}</Link>
        </>
      ) : (
        <>
          {years == null ? (
            <p className="text-footnote text-muted-foreground">{t("feesNeedAge")}</p>
          ) : (
            <>
              <p className={cn("figure text-[2rem] leading-tight", total > 0 && "text-status-over")}>{shekels(total, locale)}</p>
              <p className="mt-1 text-caption text-muted-foreground">{t("feesHint", { years })}</p>
            </>
          )}
          <ul className="mt-4 divide-y divide-border">
            {rows.map(({ a, result }) => {
              const bench = peerFees(a) ?? BENCHMARK_FEES[a.type];
              const missing = a.feeBalance == null && a.feeDeposit == null;
              return (
                <li key={a.id} className="flex items-baseline justify-between gap-3 py-2.5 text-footnote">
                  <span className="min-w-0">
                    <span title={a.name} className="block truncate font-medium">{a.name}</span>
                    <span className="text-caption text-muted-foreground">
                      {missing
                        ? t("feesMissing")
                        : t(a.fund ? "feesLinePeers" : "feesLine", { balance: a.feeBalance ?? 0, deposit: a.feeDeposit ?? 0, bBalance: round2(bench.balance), bDeposit: round2(bench.deposit) })}
                    </span>
                    {a.fund?.fund.avg5y != null && (
                      <span className="block text-caption text-muted-foreground">
                        {t("fundReturns", {
                          avg5y: a.fund.fund.avg5y,
                          median: a.fund.peers.avg5y != null ? round2(a.fund.peers.avg5y) : "—",
                          rank: a.fund.rank5y ?? "—",
                          count: a.fund.peers.count,
                        })}
                      </span>
                    )}
                  </span>
                  {result && !missing && (
                    <span className={cn("shrink-0 font-semibold tabular-nums", result.cost > 0 ? "text-status-over" : "text-status-on-track")}>
                      {result.cost > 0 ? shekels(-result.cost, locale) : t("feesFine")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-caption text-pretty text-muted-foreground">{t("feesNote")}</p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption">
            {Object.entries(CMA_SITES).map(([k, href]) => <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">{t(`fees${k}`)}</a>)}
          </p>
        </>
      )}
    </CardShell>
  );
}

function DebtsCard({ assets }: { assets: Asset[] }) {
  const t = useTranslations("plan");
  const td = useTranslations("debts2");
  const locale = useLocale();
  const [extra, setExtra] = useState("10000");
  // Avalanche: the highest rate first saves the most interest.
  const debts = assets
    .filter((a) => a.valueIls != null)
    .sort((a, b) => (b.interestRate ?? -1) - (a.interestRate ?? -1));
  const first = debts.find((d) => d.interestRate != null && d.monthlyPayment);
  const lump = Math.max(0, Number(extra) || 0);
  const saved =
    first && lump > 0
      ? (() => {
          const now = debtPayoff(first.valueIls!, first.interestRate!, first.monthlyPayment!);
          const after = debtPayoff(Math.max(0, first.valueIls! - lump), first.interestRate!, first.monthlyPayment!);
          return now && after ? { interest: now.interest - after.interest, months: now.months - after.months } : null;
        })()
      : null;

  return (
    <CardShell label={t("debtsTitle")}>
      {debts.length === 0 ? (
        <p className="text-footnote text-muted-foreground">{t("debtsEmpty")}</p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {debts.map((d, i) => {
              const payoff = d.interestRate != null && d.monthlyPayment ? debtPayoff(d.valueIls!, d.interestRate, d.monthlyPayment) : undefined;
              return (
                <li key={d.id} className="py-2.5 text-footnote">
                  <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="truncate" title={d.name}>{d.name}</span>
                      {i === 0 && d.interestRate != null && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-caption">{t("payFirst")}</span>}
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {d.interestRate == null || !d.monthlyPayment
                        ? t("debtsMissing")
                        : payoff === null
                          ? t("debtNever")
                          : t("debtLine", { rate: d.interestRate, months: payoff!.months, interest: shekels(payoff!.interest, locale) })}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{shekels(d.valueIls!, locale)}</span>
                  </div>
                  {payoff && <LoanDetails debt={d} t={td} locale={locale} />}
                </li>
              );
            })}
          </ul>
          {first && (
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="debt-extra">{t("prepayLabel", { name: first.name })}</Label>
              <Input id="debt-extra" type="number" min="0" step="1000" dir="ltr" value={extra} onChange={(e) => setExtra(e.target.value)} />
              {saved && <p className="text-footnote">{t("prepayResult", { interest: shekels(saved.interest, locale), months: saved.months })}</p>}
            </div>
          )}
        </>
      )}
    </CardShell>
  );
}

function LoanDetails({ debt, t, locale }: { debt: Asset; t: ReturnType<typeof useTranslations>; locale: string }) {
  const balance = debt.valueIls!, rate = debt.interestRate!, payment = debt.monthlyPayment!;
  const ref = referenceRate(debt.type);
  const refi = rate - ref >= REFINANCE_GAP ? refinanceCheck(balance, rate, payment, ref) : null;
  const rows = amortizationSchedule(balance, rate, payment);
  return (
    <>
      {refi && refi.interestSaved > 0 && (
        <p className="mt-1.5 text-caption text-pretty">
          {t("refinance", { rate, ref, amount: shekels(refi.interestSaved, locale), months: refi.monthsSaved })}
        </p>
      )}
      <details className="mt-1.5">
        <summary className="cursor-pointer text-caption text-primary">{t("schedule")}</summary>
        <table className="mt-2 w-full text-caption tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-start font-normal">{t("year")}</th>
              <th className="py-1 text-end font-normal">{t("interest")}</th>
              <th className="py-1 text-end font-normal">{t("principal")}</th>
              <th className="py-1 text-end font-normal">{t("balance")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year} className="border-t border-border">
                <td className="py-1">{r.year}</td>
                <td className="py-1 text-end">{shekels(r.interest, locale)}</td>
                <td className="py-1 text-end">{shekels(r.principal, locale)}</td>
                <td className="py-1 text-end">{shekels(r.balance, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

function AllocationTarget({ assets, plan }: { assets: Asset[]; plan: FinancialPlan }) {
  const t = useTranslations("plan");
  const queryClient = useQueryClient();
  const [target, setTarget] = useState(plan.allocation);
  const save = useMutation({
    mutationFn: () => savePlan({ ...plan, allocation: target }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan"] });
      toast.success(t("saved"));
    },
    onError: () => toast.error(t("saveFailed")),
  });
  const totals: Record<AllocationClass, number> = { equity: 0, bonds: 0, cash: 0 };
  for (const a of assets) {
    const c = CLASS_OF[a.type];
    if (c && !a.isLiability && a.liquid) totals[c] += a.valueIls ?? 0;
  }
  const sum = totals.equity + totals.bonds + totals.cash;
  const targetSum = target.equity + target.bonds + target.cash;

  return (
    <CardShell label={t("allocationTitle")}>
      <ul className="space-y-3">
        {ALLOCATION_CLASSES.map((c) => {
          const actual = sum ? (totals[c] / sum) * 100 : 0;
          const drift = actual - target[c];
          return (
            <li key={c} className="grid grid-cols-[1fr_auto_5rem] items-center gap-3 text-footnote">
              <span>
                <span className="block font-medium">{t(`class_${c}`)}</span>
                <span className={cn("text-caption tabular-nums", Math.abs(drift) > 5 ? "text-status-heads-up" : "text-muted-foreground")}>
                  {t("allocationActual", { pct: Math.round(actual), drift: `${drift >= 0 ? "+" : "−"}${Math.round(Math.abs(drift))}` })}
                </span>
              </span>
              <Label htmlFor={`alloc-${c}`} className="sr-only">{t("allocationTarget", { name: t(`class_${c}`) })}</Label>
              <span className="text-caption text-muted-foreground">{t("target")}</span>
              <div className="relative">
                <Input id={`alloc-${c}`} type="number" min="0" max="100" dir="ltr" className="pr-7" value={target[c]} onChange={(e) => setTarget({ ...target, [c]: Number(e.target.value) || 0 })} />
                <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-caption text-muted-foreground">%</span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className={cn("text-caption", targetSum === 100 ? "text-muted-foreground" : "text-status-over")}>{t("allocationSum", { sum: targetSum })}</p>
        <IconButton label={t("save")} variant="default" disabled={targetSum !== 100 || save.isPending} onClick={() => save.mutate()}><Check className="size-4" aria-hidden /></IconButton>
      </div>
      <p className="mt-3 text-caption text-pretty text-muted-foreground">{t("allocationHint")}</p>
    </CardShell>
  );
}

function PastNetWorth({ history }: { history: AssetsPayload["history"] }) {
  const t = useTranslations("plan");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState("");
  const [value, setValue] = useState("");
  const manual = history.filter((h) => h.manual);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["assets"] });
  const add = useMutation({
    mutationFn: () => savePlanItem("netWorth", { date: `${month}-01`, netWorth: Number(value) }),
    onSuccess: () => {
      setMonth("");
      setValue("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || t("saveFailed")),
  });
  const remove = useUndoableDelete<{ date: string; netWorth: number }>("netWorth", "assets", (h) => h.date, (h) =>
    new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${h.date}T12:00:00`))
  );

  return (
    <CardShell label={t("pastTitle")}>
      <p className="text-caption text-pretty text-muted-foreground">{t("pastHint")}</p>
      <form
        className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="past-month">{t("month")}</Label>
          <Input id="past-month" type="month" required dir="ltr" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="past-value">{t("netWorth")}</Label>
          <Input id="past-value" type="number" required step="any" dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <IconButton label={t("add")} variant="default" type="submit" disabled={add.isPending}><Plus className="size-4" aria-hidden /></IconButton>
      </form>
      {manual.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {manual.map((h) => (
            <li key={h.date} className="flex items-center justify-between gap-3 py-1.5 text-footnote">
              <span>{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${h.date}T12:00:00`))}</span>
              <span className="flex items-center gap-1">
                <span className="tabular-nums">{shekels(h.netWorth, locale)}</span>
                <Button variant="ghost" size="icon" aria-label={t("remove")} onClick={() => remove.mutate({ date: h.date, netWorth: h.netWorth })}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}
