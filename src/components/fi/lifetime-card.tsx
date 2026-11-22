"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { usePlan } from "@/hooks/use-plan";
import { useHousehold } from "@/hooks/use-household";
import { getAssets } from "@/lib/api";
import { shekels } from "@/lib/money";
import { IL } from "@/lib/il-defaults";
import { cn } from "@/lib/utils";
import { CardShell } from "@/components/home/card-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlanSettingsButton } from "./fi-extras";
import {
  DEFAULT_PENSION_FACTOR,
  DEFAULT_REAL_RETURN,
  LIFETIME_END_AGE,
  simulateLifetime,
  type LifetimeRow,
} from "@/lib/lifetime";
import type { FiPayload } from "@/lib/types";

/** One screen for the whole-life question: does the money last to 90, and if not, when does it end. */
export function LifetimeCard({ data }: { data: FiPayload }) {
  const t = useTranslations("fi");
  const locale = useLocale();
  const { plan: saved } = usePlan();
  const { household, loading: householdLoading } = useHousehold();
  const assets = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const [statePension, setStatePension] = useState("");

  const thisYear = new Date().getFullYear();
  const me = household.members.find((member) => member.role === "me");
  const birthYear = saved.birthYear ?? me?.birthYear ?? null;
  const age = birthYear != null ? thisYear - birthYear : null;
  const monthlyStatePension = Math.max(0, Number(statePension) || 0);

  const frame = (children: ReactNode) => (
    <CardShell label={t("lifetime_title", { end: LIFETIME_END_AGE })}>
      {children}
    </CardShell>
  );

  if (assets.isError) {
    return frame(
      <>
        <p className="text-footnote text-muted-foreground">{t("lifetime_loadFailed")}</p>
        <button type="button" onClick={() => assets.refetch()} className="mt-2 w-fit text-footnote font-medium text-primary">
          {t("lifetime_retry")}
        </button>
      </>
    );
  }

  if (!assets.data || householdLoading) {
    return frame(<Skeleton className="h-56 w-full" />);
  }

  if (age == null || age < 0) {
    return frame(
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-md text-footnote text-pretty text-muted-foreground">
          {t("lifetime_needBirthYear", { end: LIFETIME_END_AGE })}
        </p>
        <PlanSettingsButton />
      </div>
    );
  }

  if (age >= LIFETIME_END_AGE) {
    return frame(
      <p className="text-footnote text-pretty text-muted-foreground">{t("lifetime_past", { end: LIFETIME_END_AGE })}</p>
    );
  }

  if (data.monthsOfData === 0 || data.monthlyExpenses <= 0) {
    return frame(<p className="text-footnote text-pretty text-muted-foreground">{t("lifetime_needData")}</p>);
  }

  const result = simulateLifetime({
    startAge: age,
    startYear: thisYear,
    retirementAge: saved.retirementAge,
    monthlyIncome: data.monthlyIncome,
    monthlyExpenses: data.monthlyExpenses,
    monthlyStatePension,
    assets: assets.data.assets,
    events: saved.events,
    realReturn: DEFAULT_REAL_RETURN,
    pensionFactor: DEFAULT_PENSION_FACTOR,
  });

  const lastLiquid = result.rows.at(-1)?.liquid ?? 0;
  const statAges = [IL.pensionAge, 80, LIFETIME_END_AGE].filter((value) => value >= age);

  return frame(
    <>
      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div>
          <p
            className={cn(
              "text-[1.9rem] font-semibold leading-tight text-pretty",
              result.ranOutAge != null ? "text-status-over" : "text-status-on-track"
            )}
          >
            {result.ranOutAge != null
              ? t("lifetime_runsOut", { age: result.ranOutAge })
              : t("lifetime_sustainable", { end: LIFETIME_END_AGE })}
          </p>
          <p className="mt-2 text-footnote text-pretty text-muted-foreground">
            {result.ranOutAge != null
              ? t("lifetime_runsOutHint", { age: result.ranOutAge })
              : t("lifetime_sustainableHint", { amount: shekels(lastLiquid, locale), end: LIFETIME_END_AGE })}
          </p>
          {result.annuityMonthly > 0 && (
            <p className="mt-2 text-footnote text-pretty text-muted-foreground">
              {t("lifetime_annuity", {
                amount: shekels(result.annuityMonthly, locale),
                age: result.pensionStartAge,
              })}
            </p>
          )}
          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {statAges.map((value) => {
              const row = result.rows.find((item) => item.age === value);
              return (
                <div key={value}>
                  <dt className="text-caption text-muted-foreground">{t("lifetime_at", { age: value })}</dt>
                  <dd className="figure mt-0.5 text-[1.15rem] leading-tight">
                    {row ? shekels(row.liquid, locale) : "-"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
        <div>
          <div dir="ltr">
            <LifetimeChart
              rows={result.rows}
              pensionStartAge={result.pensionStartAge}
              ranOutAge={result.ranOutAge}
              label={t("lifetime_chartLabel")}
            />
          </div>
          <p className="mt-1 text-caption text-muted-foreground">{t("lifetime_chartHint")}</p>
          {result.ranOutAge != null && (
            <p className="mt-0.5 text-caption text-muted-foreground">{t("lifetime_chartEndHint")}</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-border/60 pt-5">
        <div className="space-y-1.5">
          <Label htmlFor="lifetime-state-pension">{t("lifetime_statePension")}</Label>
          <Input
            id="lifetime-state-pension"
            type="number"
            min={0}
            inputMode="numeric"
            value={statePension}
            placeholder="0"
            onChange={(event) => setStatePension(event.target.value)}
            className="w-36"
          />
        </div>
        <p className="max-w-lg text-caption text-pretty text-muted-foreground">{t("lifetime_statePensionHint")}</p>
      </div>

      <p className="mt-4 text-caption text-pretty text-muted-foreground">
        {t("lifetime_assumptions", {
          ret: Math.round(DEFAULT_REAL_RETURN * 100),
          factor: DEFAULT_PENSION_FACTOR,
        })}
      </p>
    </>
  );
}

/** Liquid savings by age. SVG coordinates ignore direction, so age runs left to right. */
function LifetimeChart({
  rows,
  pensionStartAge,
  ranOutAge,
  label,
}: {
  rows: LifetimeRow[];
  pensionStartAge: number;
  ranOutAge: number | null;
  label: string;
}) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last || rows.length < 2) return null;

  const width = 640;
  const height = 180;
  const pad = 10;
  const max = Math.max(1, ...rows.map((row) => row.liquid));
  const span = Math.max(1, last.age - first.age);
  const x = (age: number) => pad + ((age - first.age) / span) * (width - pad * 2);
  const y = (value: number) => height - pad - (Math.max(0, Math.min(max, value)) / max) * (height - pad * 2);
  const points = rows.map((row) => [x(row.age), y(row.liquid)] as const);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  if (!firstPoint || !lastPoint) return null;
  const body = points.map(([px, py]) => `L ${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const area = `M ${firstPoint[0].toFixed(1)} ${height - pad} ${body} L ${lastPoint[0].toFixed(1)} ${height - pad} Z`;
  const line = points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  // Age labels are HTML, so they keep their size when the plot shrinks on a phone.
  const plotLeft = (pad / width) * 100;
  const plotWidth = 100 - plotLeft * 2;
  const labelLeft = (age: number) => plotLeft + ((age - first.age) / span) * plotWidth;
  const showPensionLine = pensionStartAge > first.age && pensionStartAge < last.age;
  const pensionLabel = showPensionLine && labelLeft(pensionStartAge) > plotLeft + 8 && labelLeft(pensionStartAge) < 100 - plotLeft - 8;

  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img" aria-label={label}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="var(--border)" strokeWidth={1} />
        <path d={area} fill="var(--primary)" fillOpacity={0.12} />
        <polyline
          points={line}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {showPensionLine && (
          <line
            x1={x(pensionStartAge)}
            y1={pad}
            x2={x(pensionStartAge)}
            y2={height - pad}
            stroke="var(--border)"
            strokeDasharray="3 4"
          />
        )}
        {ranOutAge != null && ranOutAge >= first.age && ranOutAge <= last.age && (
          <g>
            <line
              x1={x(ranOutAge)}
              y1={pad}
              x2={x(ranOutAge)}
              y2={height - pad}
              stroke="var(--status-over)"
              strokeDasharray="3 4"
            />
            <circle cx={x(ranOutAge)} cy={height - pad} r={3.5} fill="var(--status-over)" />
          </g>
        )}
      </svg>
      <div className="relative mt-1 h-4 text-caption tabular-nums text-muted-foreground">
        <span className="absolute" style={{ left: `${plotLeft}%` }}>
          {first.age}
        </span>
        {pensionLabel && (
          <span className="absolute -translate-x-1/2" style={{ left: `${labelLeft(pensionStartAge)}%` }}>
            {pensionStartAge}
          </span>
        )}
        <span className="absolute" style={{ right: `${plotLeft}%` }}>
          {last.age}
        </span>
      </div>
    </>
  );
}
