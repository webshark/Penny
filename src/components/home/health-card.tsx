"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { getCashflowHealth, getResilience } from "@/lib/api";
import { CardShell } from "./card-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/info-tip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const BAND_COLOR = { building: "var(--chart-5)", steady: "var(--chart-1)", strong: "var(--status-on-track, var(--chart-3))" } as const;

/**
 * The one financial-health card (Home and Overview): the resilience score as a ring, each factor as a bar,
 * and the cash-flow warning signs behind one button with their count. Band and signs are in words, so color is never the only signal.
 */
export function HealthCard({ details = true }: { details?: boolean }) {
  const t = useTranslations("resilience");
  const tc = useTranslations("cashflowHealth");
  const th = useTranslations("health");
  const res = useQuery({ queryKey: ["resilience"], queryFn: getResilience });
  const cash = useQuery({ queryKey: ["cashflow-health"], queryFn: getCashflowHealth });
  if (res.isError) return null;
  if (!res.data) return <Skeleton className={details ? "mb-6 h-40 rounded-2xl" : "h-40 rounded-2xl"} />;
  const d = res.data;
  const r = 44;
  const c = 2 * Math.PI * r;
  const color = BAND_COLOR[d.band];
  const signs = cash.data?.hasData ? cash.data.signs : null;

  return (
    <CardShell
      label={th("title")}
      className={details ? "mb-6 h-auto md:mb-8" : "h-auto"}
      action={
        <span className="flex items-center">
          <InfoTip text={`${t("howHint")} ${tc("hint")}`} className="-my-3" />
          {details && <Link href="/overview" className="-my-3.5 inline-block py-3.5 text-footnote font-medium text-primary">{th("details")}</Link>}
        </span>
      }
    >
      <div className="grid grid-cols-[auto_1fr] items-center gap-4 sm:gap-5">
        <div className="flex justify-center">
          <svg viewBox="0 0 100 100" className="size-[5.5rem] -rotate-90" role="img" aria-label={t("scoreLabel", { score: d.score })}>
            <circle cx="50" cy="50" r={r} fill="none" stroke="var(--muted)" strokeWidth="9" />
            <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(d.score / 100) * c} ${c}`} className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-700" />
            <text x="50" y="50" className="rotate-90 fill-foreground text-[30px] font-semibold tabular-nums" style={{ transformOrigin: "50px 50px" }} textAnchor="middle" dominantBaseline="central">{d.score}</text>
          </svg>
        </div>

        <div className="min-w-0 space-y-2.5">
          <p className="text-footnote font-semibold text-pretty">{t(`verdict_${d.band}`, { score: d.score })}</p>
          <ul className="space-y-1.5" aria-label={t("howTitle")}>
            {d.factors.map((f) => (
              <li key={f.key} className="grid grid-cols-[minmax(0,5.5rem)_1fr_auto] items-center gap-2 text-caption">
                <span className="truncate">{t(`factor_${f.key}`)}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className="block h-full rounded-full" style={{ width: `${(f.points / f.max) * 100}%`, backgroundColor: f.key === d.weakest && d.score < 100 ? "var(--status-heads-up)" : color }} />
                </span>
                <span className="tabular-nums text-muted-foreground" dir="ltr">{f.points}/{f.max}</span>
              </li>
            ))}
            {signs?.length === 0 && (
              <li className="flex items-center gap-2 text-footnote">
                <CircleCheck className="size-4 shrink-0 text-status-on-track" aria-hidden />
                {tc("level_healthy")}
              </li>
            )}
          </ul>
          {!!signs?.length && (
            // Every warning sits behind one button; Base UI's popover handles Escape and returns focus to the button.
            <Popover>
              <PopoverTrigger className="inline-flex min-h-11 items-center gap-2 rounded-full bg-status-heads-up/10 px-4 text-footnote font-medium hover:bg-status-heads-up/20 focus-visible:outline-2 focus-visible:outline-ring">
                <TriangleAlert className="size-4 shrink-0 text-status-heads-up" aria-hidden />
                {th("warnings", { n: signs.length })}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80" aria-label={th("warnings", { n: signs.length })}>
                <ul className="space-y-3">
                  {signs.map((s) => (
                    <li key={s} className="flex gap-2 text-footnote">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-heads-up" aria-hidden />
                      <span>
                        <span className="font-medium">{tc(`sign_${s}`)}</span>
                        <span className="block text-caption text-muted-foreground">{tc(`fix_${s}`)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          )}
          {d.score < 100 && <p className="text-footnote"><span className="font-medium">{t("nextStep")}</span> {t(`next_${d.weakest}`)}</p>}
          {d.ageOfMoney != null && (
            <p className="flex items-center gap-1 pt-1 text-caption">
              <span className="font-semibold tabular-nums">{t("ageOfMoney", { days: d.ageOfMoney })}</span>
              <InfoTip text={t("ageOfMoneyHint")} className="-my-3" />
            </p>
          )}
        </div>
      </div>
    </CardShell>
  );
}
