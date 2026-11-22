"use client";

import { usePlan } from "@/hooks/use-plan";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { getFi } from "@/lib/api";
import { fmt, shekels } from "@/lib/money";
import { useGentle } from "@/hooks/use-gentle";
import { carCost, coastCheck, fireVariants, fiBridge, fiNumber, fiOdds, yearsBySavingsRate, yearsToTarget, yearsToTargetWithEvents, type CarInputs } from "@/lib/fi";
import { amendment190, bracketTax, brokerOutcome, fundSwitch, gemelVsBroker, moneyMarket, payoffVsInvest, rentalYield, rentVsBuy } from "@/lib/tools";
import { projectBalance } from "@/lib/plan";
import { IL } from "@/lib/il-defaults";
import type { LifeEvent } from "@/lib/plan";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { translateCategoryName } from "@/lib/i18n-data";
import { CardShell } from "@/components/home/card-shell";
import { RotateCw } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { FiHero } from "@/components/ui/page-hero";
import { Segmented } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { NumberField, numberError } from "@/components/ui/number-field";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { FiPayload } from "@/lib/types";
import { FiExtras, PlanSettingsButton } from "./fi-extras";
import { LifetimeCard } from "./lifetime-card";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const TABS = ["fi", "safety", "tools"] as const;
type Tab = (typeof TABS)[number];
const TAB_KEY = "fi-tab";

/** The tab lives in ?tab=; with no param, the last one you used is remembered on this device. */
function useTab(): [Tab, (t: Tab) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = params.get("tab");
  const [stored, setStored] = useState<Tab>("fi");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TAB_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration
      if (raw && (TABS as readonly string[]).includes(raw)) setStored(raw as Tab);
    } catch {}
  }, []);
  const tab = fromUrl && (TABS as readonly string[]).includes(fromUrl) ? (fromUrl as Tab) : stored;
  return [
    tab,
    (next) => {
      setStored(next);
      try {
        localStorage.setItem(TAB_KEY, next);
      } catch {}
      router.replace(`${pathname}?tab=${next}`, { scroll: false });
    },
  ];
}

const RATES = [0.04, 0.035, 0.03];

/** Per-viewer convenience: remember what was typed. Falls back silently where storage is blocked. */
function useStored<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration
      if (raw) setValue({ ...initial, ...JSON.parse(raw) });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [
    value,
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {}
    },
  ];
}

export function FiView() {
  const t = useTranslations("fi");
  const query = useQuery({ queryKey: ["fi"], queryFn: getFi });
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
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl md:col-span-2" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  return <Body data={query.data} />;
}

interface Plan {
  spend: string;
  income: string;
  savings: string;
  returnPct: string;
  rate: number;
}

function Body({ data }: { data: FiPayload }) {
  const { plan: saved, update } = usePlan();
  const simple = saved.simpleMode;
  const gentle = useGentle();
  const t = useTranslations("fi");
  const tt = useTranslations("tools");
  const thisYear = new Date().getFullYear();
  const locale = useLocale();
  // Empty fields fall back to the figures from your own data.
  const [plan, setPlan] = useStored<Plan>("fi-plan", { spend: "", income: "", savings: "", returnPct: "5", rate: 0.04 });
  const set = (k: keyof Plan, v: string | number) => setPlan({ ...plan, [k]: v });
  const num = (s: string, fallback: number) => (s.trim() === "" || !Number.isFinite(Number(s)) ? fallback : Number(s));

  const spend = num(plan.spend, Math.round(data.monthlyExpenses));
  const income = num(plan.income, Math.round(data.monthlyIncome));
  const savings = num(plan.savings, Math.round(Math.max(0, data.liquidNetWorth)));
  const annualReturn = num(plan.returnPct, 5) / 100;
  const target = fiNumber(spend * 12, plan.rate);
  const monthlySaving = income - spend;
  const plainYears = yearsToTarget(savings, Math.max(0, monthlySaving), annualReturn, target);
  const events = saved.events;
  const years = events.length ? yearsToTargetWithEvents(savings, Math.max(0, monthlySaving), annualReturn, target, events, thisYear) : plainYears;
  const age = saved.birthYear ? thisYear - saved.birthYear : null;
  const horizon = age != null ? Math.max(1, saved.retirementAge - age) : 20;
  // React Compiler memoizes this; the seeded run is deterministic anyway.
  const odds =(Number.isFinite(target) ? fiOdds(savings, Math.max(0, monthlySaving), annualReturn, target, horizon, events, thisYear) : null);
  const progress = target > 0 && Number.isFinite(target) ? Math.min(1, Math.max(0, savings / target)) : 0;
  const savingsRate = income > 0 ? monthlySaving / income : null;

  // Gentle mode keeps the years and odds one tap away instead of as the headline.
  const heroNumbers = (
    <>
        <p className="figure text-[3.5rem] leading-none">
          {years == null ? t("never") : years === 0 ? t("already") : t("years", { years: fmt(years, locale, 1) })}
        </p>
        <p className="mt-3 text-footnote text-muted-foreground">
          {years == null
            ? t("neverHint")
            : t("heroHint", { target: shekels(target, locale), rate: Math.round(plan.rate * 1000) / 10 })}
        </p>
        {odds && (
          <p className="mt-2 text-footnote tabular-nums">
            {age != null ? tt("oddsByAge", { age: saved.retirementAge, pct: Math.round(odds.probability * 100) }) : tt("oddsInYears", { years: horizon, pct: Math.round(odds.probability * 100) })}{" "}
            {odds.p10 != null && odds.p90 != null && (
              <span className="text-muted-foreground">{tt("oddsRange", { good: fmt(odds.p10, locale, 0), bad: fmt(odds.p90, locale, 0) })}</span>
            )}
          </p>
        )}
    </>
  );

  const [tab, setTab] = useTab();
  const fiTab = (
    <>
      <CardShell wallet label={t("heroLabel")} className="lg:col-span-2">
        {gentle ? (
          <>
            <p className="text-2xl font-semibold leading-relaxed text-pretty">{t("gentleHero")}</p>
            <details className="mt-3 text-footnote">
              <summary className="min-h-11 w-fit cursor-pointer content-center font-medium text-muted-foreground">{t("gentleMore")}</summary>
              {heroNumbers}
            </details>
          </>
        ) : heroNumbers}
        <div className="mt-8">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={t("progressLabel")}>
            <div className="h-full rounded-full bg-foreground" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-caption text-muted-foreground tabular-nums">
            <span>{t("youHave", { amount: shekels(savings, locale), pct: Math.round(progress * 100) })}</span>
            <span>{shekels(target, locale)}</span>
          </div>
        </div>
        <dl className="mt-8 grid grid-cols-3 gap-4 sm:gap-6">
          <Stat label={t("savingsRate")} value={savingsRate == null ? "—" : `${Math.round(savingsRate * 100)}%`} ltr />
          <Stat label={t("yearsOfLiving")} value={spend > 0 ? fmt(savings / (spend * 12), locale, 1) : "—"} hint={t("yearsOfLivingHint")} />
          <Stat label={t("safeWithdrawal")} value={shekels((savings * plan.rate) / 12, locale)} hint={t("safeWithdrawalHint")} />
        </dl>
      </CardShell>

      <CardShell label={t("assumptions")}>
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <Field id="fi-spend" label={t("monthlySpend")} value={plan.spend} placeholder={fmt(data.monthlyExpenses, locale)} onChange={(v) => set("spend", v)} />
          <Field id="fi-income" label={t("monthlyIncome")} value={plan.income} placeholder={fmt(data.monthlyIncome, locale)} onChange={(v) => set("income", v)} />
          <Field id="fi-savings" label={t("invested")} value={plan.savings} placeholder={fmt(Math.max(0, data.liquidNetWorth), locale)} onChange={(v) => set("savings", v)} />
          <Field id="fi-return" label={t("expectedReturn")} value={plan.returnPct} onChange={(v) => set("returnPct", v)} suffix="%" />
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{t("withdrawalRate")}</legend>
            <Segmented label={t("withdrawalRate")} value={plan.rate} options={RATES.map((r) => ({ value: r, label: `${Math.round(r * 1000) / 10}%` }))} onChange={(r) => set("rate", r)} />
          </fieldset>
          <p className="text-caption text-pretty text-muted-foreground">
            {t("dataNote", { months: data.monthsOfData })}
            {!data.hasAssets && <> {t("noAssetsNote")}</>}
          </p>
        </form>
      </CardShell>

      <LifeEvents events={events} plainYears={plainYears} years={years} onSave={(e) => update({ events: e })} />
      <FireVariants spend={spend} savings={savings} monthlySaving={monthlySaving} annualReturn={annualReturn} rate={plan.rate} yearsToRetirement={age != null ? Math.max(0, saved.retirementAge - age) : null} />
      <FiExtras data={data} tab="fi" />
      {!simple && (
        <div className="grid gap-4 lg:col-span-3 lg:grid-cols-2">
          <AggressiveSaving spend={spend} income={income} savings={savings} annualReturn={annualReturn} rate={plan.rate} />
          <Inflation data={data.inflation} />
          <Bridge age={age} years={years} spend={spend} income={income} savings={savings} annualReturn={annualReturn} rate={plan.rate} />
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      {/* The FI tab opens with its own purple card; the others get the progress summary. */}
      {tab !== "fi" && <FiHero savings={savings} target={target} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab> label={t("tabsLabel")} value={tab} onChange={setTab} options={TABS.map((k) => ({ value: k, label: t(`tab_${k}`) }))} />
        <PlanSettingsButton />
      </div>
      <LifetimeCard data={data} />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {tab === "fi" && fiTab}
        {tab === "safety" && <FiExtras data={data} tab="safety" />}
        {tab === "tools" && (simple ? (
          <CardShell className="lg:col-span-3"><p className="text-footnote text-muted-foreground">{t("toolsSimple")}</p></CardShell>
        ) : (
          <>
            <Calculators returnPct={annualReturn} />
            <CarCalculator rate={plan.rate} />
          </>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, ltr }: { label: string; value: string; hint?: string; /** Percentages and figures keep their own direction inside Hebrew. */ ltr?: boolean }) {
  return (
    <div title={hint} className="flex flex-col">
      <dt className="text-caption text-pretty text-muted-foreground">{label}</dt>
      <dd className="figure mt-auto pt-1 text-[1.75rem] leading-tight">{ltr ? <bdi dir="ltr">{value}</bdi> : value}</dd>
    </div>
  );
}

/** Counts and ages, not money: no ₪ unit. */
const UNITLESS = /(years|Years|trades|age|factor|-km\w+)$/;

function Field({ id, label, value, placeholder, onChange, suffix }: { id: string; label: string; value: string; placeholder?: string; onChange: (v: string) => void; suffix?: string }) {
  const tc = useTranslations("calculators");
  // Some labels carry their own trailing "₪"; the unit sits in the field instead.
  const unit = suffix ?? (UNITLESS.test(id) ? undefined : "₪");
  return <NumberField id={id} label={label.replace(/\s*₪\s*$/, "")} unit={unit} value={value} placeholder={placeholder} onChange={onChange} error={numberError(value, tc("invalid"))} />;
}

function AggressiveSaving({ spend, income, savings, annualReturn, rate }: { spend: number; income: number; savings: number; annualReturn: number; rate: number }) {
  const t = useTranslations("fi");
  const locale = useLocale();
  const [cut, setCut] = useState(1000);
  const after = Math.max(0, spend - cut);
  const before = { target: fiNumber(spend * 12, rate), years: yearsToTarget(savings, Math.max(0, income - spend), annualReturn, fiNumber(spend * 12, rate)) };
  const next = { target: fiNumber(after * 12, rate), years: yearsToTarget(savings, Math.max(0, income - after), annualReturn, fiNumber(after * 12, rate)) };
  const yearsText = (y: number | null) => (y == null ? t("never") : y === 0 ? t("already") : t("years", { years: fmt(y, locale, 1) }));

  return (
    <CardShell label={t("cutTitle")}>
      <Label htmlFor="fi-cut">{t("cutLabel", { amount: shekels(cut, locale) })}</Label>
      <input
        id="fi-cut"
        type="range"
        min={0}
        max={Math.max(500, Math.round(spend / 2 / 100) * 100)}
        step={100}
        value={cut}
        onChange={(e) => setCut(Number(e.target.value))}
        className="mt-3 w-full accent-[var(--foreground)]"
      />
      <dl className="mt-5 space-y-3 text-footnote">
        <Row label={t("yourNumber")} before={shekels(before.target, locale)} after={shekels(next.target, locale)} />
        <Row label={t("timeToFi")} before={yearsText(before.years)} after={yearsText(next.years)} />
      </dl>
      <p className="mt-4 text-footnote">
        {t("cutResult", { factor: Math.round(12 / rate), amount: shekels(before.target - next.target, locale) })}
      </p>
    </CardShell>
  );
}

/** Assumed inflation for turning the nominal return into a real one. shortcut: fixed 2.5%; upgrade to data.inflation if it drifts. */
const BRIDGE_INFLATION = 0.025;

/** Early retirement: the gap years until pensions start, whether you can stop saving now, and years to FI by savings rate. */
function Bridge({ age, years, spend, income, savings, annualReturn, rate }: { age: number | null; years: number | null; spend: number; income: number; savings: number; annualReturn: number; rate: number }) {
  const t = useTranslations("fi");
  const locale = useLocale();
  const [v, setV] = useStored("fi-bridge", { age: "", pension: "" });
  const myAge = v.age.trim() !== "" && Number.isFinite(Number(v.age)) ? Number(v.age) : age ?? 40;
  const pension = Number(v.pension) || 0;
  const real = Math.max(0, annualReturn - BRIDGE_INFLATION);
  const fiAge = years == null ? null : myAge + years;
  const b = fiBridge({ fiAge: fiAge ?? IL.pensionAge, pensionAge: IL.pensionAge, monthlySpend: spend, monthlyPension: pension, withdrawalRate: rate, realReturn: real });
  const coast = coastCheck(savings, real, IL.pensionAge - myAge, b.after);
  const table = yearsBySavingsRate(income, savings, annualReturn, rate);
  const current = income > 0 ? (income - spend) / income : 0;
  const closest = table.reduce((a, r) => (Math.abs(r.rate - current) < Math.abs(a.rate - current) ? r : a), table[0]);

  return (
    <CardShell label={t("bridgeTitle")} className="lg:col-span-2">
      <p className="text-caption text-pretty text-muted-foreground">{t("bridgeIntro", { age: IL.pensionAge })}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field id="bridge-age" label={t("bridgeAge")} value={v.age} placeholder={String(myAge)} onChange={(x) => setV({ ...v, age: x })} />
        <Field id="bridge-pension" label={t("bridgePension", { age: IL.pensionAge })} value={v.pension} placeholder="0" onChange={(x) => setV({ ...v, pension: x })} />
      </div>
      <div className="mt-5 grid gap-6 md:grid-cols-3" aria-live="polite">
        <div>
          <h3 className="text-footnote font-semibold">{t("bridgeGapTitle")}</h3>
          <p className="mt-1 text-footnote text-pretty">
            {fiAge == null ? t("bridgeNoFi") : b.gapYears === 0 ? t("bridgeNoGap", { age: IL.pensionAge }) : t("bridgeGap", { fiAge: Math.round(fiAge), years: fmt(b.gapYears, locale, 0), age: IL.pensionAge })}
          </p>
          {fiAge != null && b.gapYears > 0 && (
            <dl className="mt-2 space-y-1.5 text-footnote tabular-nums">
              <ResultRow label={t("bridgeCapital")} value={shekels(b.bridge, locale)} />
              <ResultRow label={t("bridgeAfter", { age: IL.pensionAge })} value={shekels(b.after, locale)} />
              <ResultRow label={t("bridgeTotal")} value={shekels(b.total, locale)} />
            </dl>
          )}
        </div>
        <div>
          <h3 className="text-footnote font-semibold">{t("coastTitle")}</h3>
          <p className="mt-1 text-footnote text-pretty">
            {myAge >= IL.pensionAge ? t("coastPast", { age: IL.pensionAge }) : coast.canStop
              ? t("coastYes", { amount: shekels(coast.atTarget, locale), age: IL.pensionAge })
              : t("coastNo", { need: shekels(coast.coastNumber, locale), have: shekels(savings, locale) })}
          </p>
          <p className="mt-1 text-caption text-pretty text-muted-foreground">{t("coastHint")}</p>
        </div>
        <div>
          <h3 className="text-footnote font-semibold">{t("rateTitle")}</h3>
          <table className="mt-1 w-full text-footnote tabular-nums">
            <thead className="sr-only"><tr><th>{t("rateCol")}</th><th>{t("rateYearsCol")}</th></tr></thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.rate} className={cn(r === closest && "font-semibold text-primary")} aria-current={r === closest || undefined}>
                  <td className="py-0.5"><bdi dir="ltr">{Math.round(r.rate * 100)}%</bdi></td>
                  <td className="py-0.5 text-end">{r.years == null ? t("never") : r.years === 0 ? t("already") : t("years", { years: fmt(r.years, locale, 1) })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-4 text-caption text-pretty text-muted-foreground">{t("bridgeNote", { infl: BRIDGE_INFLATION * 100 })}</p>
    </CardShell>
  );
}

function Row({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">
        <span className="text-muted-foreground line-through decoration-1">{before}</span>
        <span className="ms-2 font-semibold">{after}</span>
      </dd>
    </div>
  );
}

function Inflation({ data }: { data: FiPayload["inflation"] }) {
  const t = useTranslations("fi");
  const tCat = useTranslations("categoriesSeeded");
  const pct = (n: number) => `${n >= 0 ? "+" : "−"}${(Math.abs(n) * 100).toFixed(1)}%`;
  return (
    <CardShell label={t("inflationTitle")}>
      {data.rate == null ? (
        <p className="text-footnote text-muted-foreground">{t("inflationEmpty")}</p>
      ) : (
        <>
          <p className="figure text-[2.5rem] leading-none" dir="ltr">{pct(data.rate)}</p>
          <p className="mt-2 text-caption text-muted-foreground">{t("inflationHint")}</p>
          <ul className="mt-5 space-y-2">
            {data.categories.slice(0, 6).map((c) => (
              <li key={c.categoryId} className="flex items-baseline justify-between gap-3 text-footnote">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
                  <span className="truncate">{translateCategoryName(c.name, tCat)}</span>
                </span>
                <span className={cn("shrink-0 font-medium tabular-nums", c.change > 0 ? "text-status-over" : "text-status-on-track")} dir="ltr">{pct(c.change)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </CardShell>
  );
}

const CAR_FIELDS: (keyof CarInputs)[] = ["purchasePrice", "currentValue", "kmDriven", "kmPerYear", "kmPerLiter", "fuelPrice", "annualTest", "annualInsurance", "annualMaintenance"];

function CarCalculator({ rate }: { rate: number }) {
  const t = useTranslations("fi");
  const locale = useLocale();
  const [car, setCar] = useStored<Record<keyof CarInputs, string>>("fi-car", {
    purchasePrice: "", currentValue: "", kmDriven: "", kmPerYear: "", kmPerLiter: "", fuelPrice: "7.2", annualTest: "", annualInsurance: "", annualMaintenance: "",
  });
  const values = Object.fromEntries(CAR_FIELDS.map((k) => [k, Number(car[k]) || 0])) as unknown as CarInputs;
  const result = carCost(values);

  return (
    <CardShell label={t("carTitle")}>
      <div className="grid grid-cols-2 gap-3">
        {CAR_FIELDS.map((k) => (
          <Field key={k} id={`car-${k}`} label={t(`car_${k}`)} value={car[k]} onChange={(v) => setCar({ ...car, [k]: v })} />
        ))}
      </div>
      {result && result.perYear > 0 ? (
        <div className="mt-5 space-y-1">
          <p className="figure text-[2rem] leading-tight">{t("carPerYear", { amount: shekels(result.perYear, locale) })}</p>
          <p className="text-footnote text-muted-foreground">
            {t("carDetail", { perKm: fmt(result.perKm, locale, 2), years: fmt(result.years, locale, 1), fi: shekels(fiNumber(result.perYear, rate), locale) })}
          </p>
        </div>
      ) : (
        <p className="mt-5 text-footnote text-muted-foreground">{t("carEmpty")}</p>
      )}
    </CardShell>
  );
}

const PRESETS: { key: string; amount: number; monthlyChange: number }[] = [
  { key: "apartment", amount: -400_000, monthlyChange: 0 },
  { key: "child", amount: -20_000, monthlyChange: 2_000 },
  { key: "sabbatical", amount: -120_000, monthlyChange: 0 },
  { key: "mortgageEnd", amount: 0, monthlyChange: -6_500 },
  { key: "car", amount: -150_000, monthlyChange: 500 },
];

function LifeEvents({ events, plainYears, years, onSave }: { events: LifeEvent[]; plainYears: number | null; years: number | null; onSave: (e: LifeEvent[]) => void }) {
  const tt = useTranslations("tools");
  const locale = useLocale();
  // Typing edits a local copy; it is saved when a field loses focus, so the plan isn't written on every key.
  const [rows, setRows] = useState(events);
  useEffect(() => setRows(events), [events]); // eslint-disable-line react-hooks/set-state-in-effect -- follow saved plan
  const edit = (i: number, k: keyof LifeEvent, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: k === "name" ? v : Number(v) || 0 } : r)));
  const add = (r: LifeEvent) => onSave([...rows, r].slice(0, 12));
  const delta = years == null || plainYears == null ? null : years - plainYears;

  return (
    <CardShell label={tt("eventsTitle")} className="lg:col-span-2">
      <p className="text-footnote text-pretty">
        {!events.length
          ? tt("eventsEmpty")
          : years == null
            ? tt("eventsNever")
            : delta == null || Math.abs(delta) < 0.05
              ? tt("eventsNoEffect")
              : delta > 0
                ? tt("eventsDelay", { years: fmt(delta, locale, 1) })
                : tt("eventsSooner", { years: fmt(-delta, locale, 1) })}
      </p>
      {rows.length > 0 && (
        <ul className="mt-4 space-y-3">
          {rows.map((r, i) => (
            <li key={i} className="grid grid-cols-[1fr_5rem_7rem_7rem_auto] items-end gap-2" onBlur={() => onSave(rows)}>
              <EventInput id={`ev-name-${i}`} label={tt("eventName")} value={r.name} onChange={(v) => edit(i, "name", v)} text />
              <EventInput id={`ev-year-${i}`} label={tt("eventYear")} value={String(r.year)} onChange={(v) => edit(i, "year", v)} />
              <EventInput id={`ev-amount-${i}`} label={tt("eventAmount")} value={String(r.amount)} onChange={(v) => edit(i, "amount", v)} />
              <EventInput id={`ev-monthly-${i}`} label={tt("eventMonthly")} value={String(r.monthlyChange)} onChange={(v) => edit(i, "monthlyChange", v)} />
              <IconButton label={tt("eventRemove", { name: r.name || "" })} variant="ghost" onClick={() => onSave(rows.filter((_, j) => j !== i))}><X className="size-4" aria-hidden /></IconButton>
            </li>
          ))}
        </ul>
      )}
      {rows.length < 12 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.key} type="button" variant="outline" size="sm" onClick={() => add({ name: tt(`preset_${p.key}`), year: new Date().getFullYear() + 2, amount: p.amount, monthlyChange: p.monthlyChange })}>
              <Plus className="size-3.5" aria-hidden />
              {tt(`preset_${p.key}`)}
            </Button>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => add({ name: "", year: new Date().getFullYear() + 1, amount: 0, monthlyChange: 0 })}>
            <Plus className="size-3.5" aria-hidden />
            {tt("eventCustom")}
          </Button>
        </div>
      )}
      <p className="mt-3 text-caption text-muted-foreground">{tt("eventsNote")}</p>
    </CardShell>
  );
}

function EventInput({ id, label, value, onChange, text }: { id: string; label: string; value: string; onChange: (v: string) => void; text?: boolean }) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-caption text-muted-foreground">{label}</Label>
      <Input id={id} type={text ? "text" : "number"} inputMode={text ? undefined : "numeric"} dir={text ? undefined : "ltr"} maxLength={40} value={value} onChange={(e) => onChange(e.target.value)} className="tabular-nums" />
    </div>
  );
}

type CalcKind = (typeof SIMPLE_CALCS)[number] | "rentBuy" | "a190";
const SIMPLE_CALCS = ["switch", "gemel", "broker", "compound", "payoff", "rental", "mm"] as const;

function Calculators({ returnPct }: { returnPct: number }) {
  const tt = useTranslations("tools");
  const tRent = useTranslations("rentBuy");
  const tA190 = useTranslations("amendment190");
  const locale = useLocale();
  const [kind, setKind] = useState<CalcKind>("switch");
  const [v, setV] = useStored<Record<string, string>>("fi-tools", {
    balance: "200000", monthly: "2000", years: "20",
    curDeposit: "1", curBalance: "0.8", altDeposit: "0", altBalance: "0.3",
    initial: "50000", inflation: "2", gemelFee: "0.65", etfFee: "0.1", custody: "0",
    invest: "2000", trades: "1", aTrade: "5", aPct: "0", aCustody: "0", bTrade: "0", bPct: "0.1", bCustody: "15",
    fee: "0.5", lump: "50000", loanRate: "5", price: "1500000", equity: "500000", rent: "5000", costs: "600", mRate: "5", mYears: "25",
    amount: "50000", mmYield: "4.2", mmFee: "0.25",
  });
  const n = (k: string) => { const x = Number(v[k]); return Number.isFinite(x) ? x : 0; }; // "1e400" → 0, never Infinity in the text
  const field = (k: string, suffix?: string) => <Field key={k} id={`tool-${k}`} label={tt(`f_${k}`)} value={v[k] ?? ""} onChange={(x) => setV({ ...v, [k]: x })} suffix={suffix} />;
  const r = returnPct;

  let fields: ReactNode[] = [];
  let result: ReactNode = null;
  if (kind === "switch") {
    fields = [field("balance"), field("monthly"), field("years"), field("curDeposit", "%"), field("curBalance", "%"), field("altDeposit", "%"), field("altBalance", "%")];
    const s = fundSwitch(n("balance"), n("monthly"), n("years"), r, { depositPct: n("curDeposit"), balancePct: n("curBalance") }, { depositPct: n("altDeposit"), balancePct: n("altBalance") });
    result = <p className="text-footnote">{tt(s.diff >= 0 ? "switchGain" : "switchLoss", { amount: shekels(Math.abs(s.diff), locale), years: n("years") })}</p>;
  } else if (kind === "gemel") {
    fields = [field("initial"), field("monthly"), field("years"), field("inflation", "%"), field("gemelFee", "%"), field("etfFee", "%"), field("custody")];
    const g = gemelVsBroker({ initial: n("initial"), monthly: n("monthly"), years: n("years"), grossReturn: r, inflation: n("inflation") / 100, gemelFeePct: n("gemelFee"), etfFeePct: n("etfFee"), custodyMonthly: n("custody") });
    result = (
      <dl className="space-y-2 text-footnote tabular-nums">
        <ResultRow label={tt("gemelLump")} value={shekels(g.gemelLump, locale)} />
        <ResultRow label={tt("gemelAnnuity")} value={shekels(g.gemelAnnuity, locale)} />
        <ResultRow label={tt("brokerNet")} value={shekels(g.broker, locale)} />
        <ResultRow label={tt("deposited")} value={shekels(g.deposited, locale)} />
      </dl>
    );
  } else if (kind === "broker") {
    fields = [field("invest"), field("trades"), field("aTrade"), field("aPct", "%"), field("aCustody"), field("bTrade"), field("bPct", "%"), field("bCustody")];
    const a = brokerOutcome({ perTrade: n("aTrade"), pct: n("aPct"), custodyMonthly: n("aCustody") }, n("invest"), n("trades"), 10, r);
    const b = brokerOutcome({ perTrade: n("bTrade"), pct: n("bPct"), custodyMonthly: n("bCustody") }, n("invest"), n("trades"), 10, r);
    result = (
      <>
        <p className="text-footnote">{Math.abs(a.value - b.value) < 1 ? tt("brokersEqual") : tt("brokerWins", { name: a.value > b.value ? "A" : "B", amount: shekels(Math.abs(a.value - b.value), locale) })}</p>
        <dl className="mt-2 space-y-2 text-footnote tabular-nums">
          <ResultRow label={tt("brokerFees", { name: "A" })} value={shekels(a.fees, locale)} />
          <ResultRow label={tt("brokerFees", { name: "B" })} value={shekels(b.fees, locale)} />
        </dl>
      </>
    );
  }

  else if (kind === "compound") {
    fields = [field("initial"), field("monthly"), field("years"), field("fee", "%")];
    const end = projectBalance(n("initial"), n("monthly"), n("years"), r, 0, n("fee"));
    const deposited = n("initial") + n("monthly") * Math.round(n("years") * 12);
    result = (
      <dl className="space-y-2 text-footnote tabular-nums">
        <ResultRow label={tt("endValue", { years: n("years") })} value={shekels(end, locale)} />
        <ResultRow label={tt("deposited")} value={shekels(deposited, locale)} />
        <ResultRow label={tt("growth")} value={shekels(end - deposited, locale)} />
      </dl>
    );
  } else if (kind === "payoff") {
    fields = [field("lump"), field("loanRate", "%"), field("years")];
    const p = payoffVsInvest(n("lump"), n("loanRate") / 100, r, n("years"));
    result = (
      <>
        <p className="text-footnote">{tt(p.diff > 0 ? "payoffInvest" : "payoffPrepay", { amount: shekels(Math.abs(p.diff), locale), years: n("years") })}</p>
        <dl className="mt-2 space-y-2 text-footnote tabular-nums">
          <ResultRow label={tt("payoffSaved")} value={shekels(p.saved, locale)} />
          <ResultRow label={tt("payoffEarned")} value={shekels(p.earned, locale)} />
        </dl>
      </>
    );
  } else if (kind === "rental") {
    fields = [field("price"), field("equity"), field("rent"), field("costs"), field("mRate", "%"), field("mYears")];
    const y = rentalYield({ price: n("price"), equity: n("equity"), rent: n("rent"), costs: n("costs"), rate: n("mRate") / 100, years: n("mYears") || 25 });
    const pct = (x: number) => `${fmt(x * 100, locale, 1)}%`;
    result = (
      <dl className="space-y-2 text-footnote tabular-nums">
        <ResultRow label={tt("yieldGross")} value={pct(y.gross)} />
        <ResultRow label={tt("yieldNet")} value={pct(y.net)} />
        <ResultRow label={tt("rentPayment")} value={shekels(y.payment, locale)} />
        <ResultRow label={tt("rentCashflow")} value={shekels(y.cashflow, locale)} />
        <ResultRow label={tt("cashOnCash")} value={pct(y.cashOnCash)} />
      </dl>
    );
  } else if (kind === "mm") {
    fields = [field("amount"), field("years"), field("mmYield", "%"), field("mmFee", "%"), field("inflation", "%")];
    const m = moneyMarket(n("amount"), n("years"), n("mmYield"), n("mmFee"), n("inflation"));
    result = <p className="text-footnote">{tt("mmResult", { amount: shekels(m.gain, locale), years: n("years"), total: shekels(m.net, locale) })}</p>;
  }

  return (
    <CardShell label={tt("calcTitle")} className="lg:col-span-3">
      <Segmented label={tt("calcTitle")} value={kind} onChange={setKind} className="flex-wrap" options={[
        ...SIMPLE_CALCS.map((k) => ({ value: k, label: tt(`calc_${k}`) })),
        { value: "rentBuy" as const, label: tRent("tab") },
        { value: "a190" as const, label: tA190("tab") },
      ]} />
      {kind === "rentBuy" ? <RentVsBuy returnPct={r} /> : kind === "a190" ? <Amendment190 /> : (
        <>
          <p className="mt-3 text-caption text-pretty text-muted-foreground">{tt(`calcHint_${kind}`, { ret: fmt(r * 100, locale, 1) })}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{fields}</div>
          <div className="mt-5" aria-live="polite">{result}</div>
          <p className="mt-4 text-caption text-muted-foreground">{tt("notAdvice")}</p>
        </>
      )}
    </CardShell>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
const RENT_FIELDS = ["price", "down", "mortgageRate", "mortgageYears", "purchaseTax", "oneOffs", "ownerMonthly", "appreciation", "rent", "rentGrowth", "investReturn", "years"] as const;
const RENT_PCT = new Set<string>(["mortgageRate", "appreciation", "rentGrowth", "investReturn"]);

function RentVsBuy({ returnPct }: { returnPct: number }) {
  const t = useTranslations("rentBuy");
  const locale = useLocale();
  const [v, setV] = useStored<Record<(typeof RENT_FIELDS)[number], string>>("fi-rent-buy", {
    price: "2500000", down: "750000", mortgageRate: String(IL.typicalMortgageRate), mortgageYears: "25", purchaseTax: "",
    oneOffs: "60000", ownerMonthly: "500", appreciation: "3", rent: "7000", rentGrowth: "3", investReturn: "", years: "15",
  });
  const n = (k: (typeof RENT_FIELDS)[number]) => Number(v[k]) || 0;
  const pct = (k: (typeof RENT_FIELDS)[number]) => n(k) / 100;
  const autoTax = bracketTax(n("price"), IL.purchaseTaxSingleHome);
  const res = rentVsBuy({
    price: n("price"), down: n("down"), mortgageRate: pct("mortgageRate"), mortgageYears: n("mortgageYears") || 25,
    purchaseTax: v.purchaseTax.trim() === "" ? autoTax : n("purchaseTax"), oneOffs: n("oneOffs"), ownerMonthly: n("ownerMonthly"),
    appreciation: pct("appreciation"), rent: n("rent"), rentGrowth: pct("rentGrowth"),
    investReturn: v.investReturn.trim() === "" ? returnPct : pct("investReturn"), years: Math.min(40, Math.max(1, Math.round(n("years")) || 15)),
  });
  const years = res.yearly.length;
  const placeholders: Partial<Record<string, string>> = { purchaseTax: fmt(autoTax, locale), investReturn: fmt(returnPct * 100, locale, 1) };

  return (
    <>
      <p className="mt-3 text-caption text-pretty text-muted-foreground">{t("hint")}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {RENT_FIELDS.map((k) => (
          <Field key={k} id={`rb-${k}`} label={t(`f_${k}`)} value={v[k]} placeholder={placeholders[k]} onChange={(x) => setV({ ...v, [k]: x })} suffix={RENT_PCT.has(k) ? "%" : undefined} />
        ))}
      </div>
      <p className="mt-2 text-caption text-pretty text-muted-foreground">{t("taxNote", { year: IL.year })}</p>
      <div className="mt-5" aria-live="polite">
        <p className="text-footnote font-semibold text-pretty">
          {Math.abs(res.diff) < 1000 ? t("resultEven", { years }) : t(res.diff > 0 ? "resultBuy" : "resultRent", { years, amount: shekels(Math.abs(res.diff), locale) })}{" "}
          {res.breakEven != null ? t("breakEven", { year: res.breakEven }) : t("noBreakEven", { years })}
        </p>
        <dl className="mt-3 space-y-2 text-footnote tabular-nums">
          <ResultRow label={t("netBuy", { years })} value={shekels(res.buy, locale)} />
          <ResultRow label={t("netRent", { years })} value={shekels(res.rent, locale)} />
          <ResultRow label={t("monthlyBuy")} value={shekels(res.firstMonth.buy, locale)} />
          <ResultRow label={t("monthlyRent")} value={shekels(res.firstMonth.rent, locale)} />
        </dl>
      </div>
      <p className="mt-4 text-caption text-pretty text-muted-foreground">{t("disclaimer")}</p>
    </>
  );
}

const A190_FIELDS = ["balance", "realGain", "age", "pension", "factor"] as const;

function Amendment190() {
  const t = useTranslations("amendment190");
  const locale = useLocale();
  const [v, setV] = useStored<Record<(typeof A190_FIELDS)[number], string>>("fi-a190", { balance: "1000000", realGain: "40", age: "62", pension: "6000", factor: "200" });
  const n = (k: (typeof A190_FIELDS)[number]) => Number(v[k]) || 0;
  const res = amendment190({ balance: n("balance"), realGainShare: n("realGain") / 100, age: n("age"), qualifyingPension: n("pension"), annuityFactor: n("factor"), ...IL.amendment190 });

  return (
    <>
      <p className="mt-3 text-caption text-pretty text-muted-foreground">{t("hint")}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {A190_FIELDS.map((k) => (
          <Field key={k} id={`a190-${k}`} label={t(`f_${k}`)} value={v[k]} onChange={(x) => setV({ ...v, [k]: x })} suffix={k === "realGain" ? "%" : undefined} />
        ))}
      </div>
      <div className="mt-5" aria-live="polite">
        <p className="text-footnote font-semibold text-pretty">
          {res.eligible
            ? t("resultEligible", { monthly: shekels(res.monthly, locale), saved: shekels(res.taxSaved, locale) })
            : !res.ageOk
              ? t("resultAge", { age: IL.amendment190.minAge })
              : t("resultPension", { min: shekels(IL.amendment190.minQualifyingPension, locale) })}
        </p>
        <dl className="mt-3 space-y-2 text-footnote tabular-nums">
          <ResultRow label={t("monthly")} value={shekels(res.monthly, locale)} />
          <ResultRow label={t("lumpNet")} value={shekels(res.lumpNet, locale)} />
          <ResultRow label={t("taxSaved")} value={shekels(res.taxSaved, locale)} />
        </dl>
      </div>
      <p className="mt-4 text-caption text-pretty text-muted-foreground">{t("disclaimer", { min: shekels(IL.amendment190.minQualifyingPension, locale), year: IL.year })}</p>
    </>
  );
}
/** FIRE variants as cards: lean, today's life, fat, and coast. */
function FireVariants({ spend, savings, monthlySaving, annualReturn, rate, yearsToRetirement }: { spend: number; savings: number; monthlySaving: number; annualReturn: number; rate: number; yearsToRetirement: number | null }) {
  const t = useTranslations("fi");
  const locale = useLocale();
  const v = fireVariants({ monthlySpend: spend, savings, monthlySaving, annualReturn, withdrawalRate: rate, yearsToRetirement });
  const money = (n: number) => shekels(Math.round(n), locale);
  const when = (y: number | null) => (y == null ? t("variantNever") : y === 0 ? t("variantReached") : t("variantIn", { years: Math.round(y * 10) / 10 }));
  const cards = [
    { key: "lean", ...v.lean, hint: t("variantLeanHint") },
    { key: "regular", ...v.regular, hint: t("variantRegularHint") },
    { key: "fat", ...v.fat, hint: t("variantFatHint") },
  ];
  return (
    <CardShell label={t("variantsTitle")} className="lg:col-span-3">
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <li key={c.key} className={`rounded-xl border p-4 ${c.key === "regular" ? "border-primary bg-primary/5" : "border-border"}`}>
            <p className="text-xs font-semibold text-muted-foreground">{t(`variant_${c.key}`)}</p>
            <bdi data-money className="mt-1 block text-xl font-semibold tabular-nums">{Number.isFinite(c.target) ? money(c.target) : "—"}</bdi>
            <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
            <p className="mt-2 text-sm font-medium">{when(c.years)}</p>
          </li>
        ))}
        <li className="rounded-xl border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground">{t("variant_coast")}</p>
          {v.coast ? <>
            <bdi data-money className="mt-1 block text-xl font-semibold tabular-nums">{money(v.coast.coastNumber)}</bdi>
            <p className="mt-1 text-xs text-muted-foreground">{t("variantCoastHint")}</p>
            <p className={`mt-2 text-sm font-medium ${v.coast.canStop ? "text-status-on-track" : ""}`}>{v.coast.canStop ? t("variantCoastDone") : t("variantCoastLeft", { amount: money(v.coast.coastNumber - savings) })}</p>
          </> : <p className="mt-2 text-sm text-muted-foreground">{t("variantCoastNeedsAge")}</p>}
        </li>
      </ul>
    </CardShell>
  );
}
