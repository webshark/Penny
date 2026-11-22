"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { NumField as Num } from "@/components/ui/num-field";
import { Segmented } from "@/components/ui/segmented";
import { CAR_DEFAULTS, SHARED_DEFAULTS, carCost, type CarCost, type CarInputs, type Powertrain } from "@/lib/car-cost";
import { shekels } from "@/lib/money";

const TYPES: Powertrain[] = ["gas", "hybrid", "phev", "ev"];
const PARTS = ["depreciation", "energy", "insurance", "maintenance", "license", "interest", "missedReturn"] as const;
const PART_COLOR: Record<(typeof PARTS)[number], string> = {
  depreciation: "bg-indigo-500",
  energy: "bg-amber-500",
  insurance: "bg-sky-500",
  maintenance: "bg-teal-500",
  license: "bg-slate-400",
  interest: "bg-rose-400",
  missedReturn: "bg-emerald-500",
};

const newCar = (type: Powertrain, price: number): CarInputs => ({ ...CAR_DEFAULTS[type], price, downShare: 1, loanRate: 0.07, loanYears: 5 });

export function CarCalculator() {
  const t = useTranslations("car");
  const locale = useLocale();
  const [cars, setCars] = useState<CarInputs[]>([newCar("gas", 140_000), newCar("ev", 160_000)]);
  const [shared, setShared] = useState(SHARED_DEFAULTS);

  const results = cars.map((c) => carCost(c, shared));
  const max = Math.max(...results.map((r) => r.total), 1);
  const [a, b] = results;
  const cheaper = a.total <= b.total ? 0 : 1;
  const saving = Math.abs(a.total - b.total);

  const setCar = (i: number, patch: Partial<CarInputs>) => setCars(cars.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  // Switching type keeps the price and financing, and loads that type's typical running costs.
  const setType = (i: number, type: Powertrain) => setCar(i, { ...CAR_DEFAULTS[type] });

  return (
    <div className="space-y-6">
      <section aria-labelledby="car-shared" className="rounded-2xl bg-card p-5 sm:p-6">
        <h2 id="car-shared" className="mb-4 text-headline font-semibold">{t("sharedTitle")}</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Num id="years" label={t("years")} value={shared.years} min={1} max={15} onChange={(v) => setShared({ ...shared, years: v })} />
          <Num id="km" label={t("kmPerYear")} value={shared.kmPerYear} step={1000} onChange={(v) => setShared({ ...shared, kmPerYear: v })} />
          <Num id="fuel" label={t("fuelPrice")} value={shared.fuelPrice} step={0.1} onChange={(v) => setShared({ ...shared, fuelPrice: v })} />
          <Num id="elec" label={t("electricityPrice")} value={shared.electricityPrice} step={0.01} onChange={(v) => setShared({ ...shared, electricityPrice: v })} />
          <Num id="ret" label={t("investReturn")} value={pct(shared.investReturn)} step={0.5} onChange={(v) => setShared({ ...shared, investReturn: v / 100 })} />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {cars.map((car, i) => (
          <section key={i} aria-labelledby={`car-${i}`} className="rounded-2xl bg-card p-5 sm:p-6">
            <h2 id={`car-${i}`} className="mb-3 text-headline font-semibold">{t(i === 0 ? "carA" : "carB")}</h2>
            <Segmented
              label={t("typeLabel")}
              options={TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }))}
              value={car.type}
              onChange={(v) => setType(i, v)}
              className="mb-4"
            />
            <div className="grid grid-cols-2 gap-4">
              <Num id={`price-${i}`} label={t("price")} value={car.price} step={5000} onChange={(v) => setCar(i, { price: v })} />
              <Num id={`down-${i}`} label={t("downShare")} value={pct(car.downShare)} min={0} max={100} step={5} onChange={(v) => setCar(i, { downShare: Math.min(1, Math.max(0, v / 100)) })} />
              {car.downShare < 1 && (
                <>
                  <Num id={`rate-${i}`} label={t("loanRate")} value={pct(car.loanRate)} step={0.25} onChange={(v) => setCar(i, { loanRate: v / 100 })} />
                  <Num id={`loanYears-${i}`} label={t("loanYears")} value={car.loanYears} min={1} max={8} onChange={(v) => setCar(i, { loanYears: v })} />
                </>
              )}
            </div>
            <details className="mt-4 group">
              <summary className="cursor-pointer rounded-lg py-2 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-ring">{t("moreAssumptions")}</summary>
              <div className="mt-3 grid grid-cols-2 gap-4">
                {car.type !== "ev" && <Num id={`l-${i}`} label={t("litersPer100")} value={car.litersPer100} step={0.1} onChange={(v) => setCar(i, { litersPer100: v })} />}
                {(car.type === "ev" || car.type === "phev") && <Num id={`k-${i}`} label={t("kwhPer100")} value={car.kwhPer100} step={0.5} onChange={(v) => setCar(i, { kwhPer100: v })} />}
                {car.type === "phev" && <Num id={`s-${i}`} label={t("electricShare")} value={pct(car.electricShare)} min={0} max={100} step={5} onChange={(v) => setCar(i, { electricShare: Math.min(1, Math.max(0, v / 100)) })} />}
                <Num id={`ins-${i}`} label={t("insuranceYearly")} value={car.insuranceYearly} step={100} onChange={(v) => setCar(i, { insuranceYearly: v })} />
                <Num id={`mnt-${i}`} label={t("maintenanceYearly")} value={car.maintenanceYearly} step={100} onChange={(v) => setCar(i, { maintenanceYearly: v })} />
                <Num id={`lic-${i}`} label={t("licenseYearly")} value={car.licenseYearly} step={100} onChange={(v) => setCar(i, { licenseYearly: v })} />
                <Num id={`res-${i}`} label={t("resaleAfter5")} value={pct(car.resaleAfter5)} min={0} max={100} step={1} onChange={(v) => setCar(i, { resaleAfter5: Math.min(1, Math.max(0, v / 100)) })} />
              </div>
            </details>
          </section>
        ))}
      </div>

      <section aria-labelledby="car-result" className="rounded-2xl bg-card p-5 sm:p-6" aria-live="polite">
        <h2 id="car-result" className="mb-1 text-headline font-semibold">{t("resultTitle", { years: shared.years })}</h2>
        <p className="mb-5 text-sm text-pretty">
          {saving < 1
            ? t("same")
            : t("verdict", { car: t(cheaper === 0 ? "carA" : "carB"), amount: shekels(saving, locale), perMonth: shekels(saving / (shared.years * 12), locale) })}
        </p>
        <div className="space-y-5">
          {results.map((r, i) => (
            <Breakdown key={i} name={`${t(i === 0 ? "carA" : "carB")} · ${t(`type.${cars[i].type}`)}`} r={r} max={max} />
          ))}
        </div>
        <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 text-footnote text-muted-foreground">
          {PARTS.map((p) => (
            <li key={p} className="inline-flex items-center gap-1.5">
              <span className={`size-2.5 rounded-full ${PART_COLOR[p]}`} aria-hidden />
              {t(`part.${p}`)}
            </li>
          ))}
        </ul>
        <div className="mt-5 rounded-xl bg-emerald-500/10 p-4 text-sm text-pretty">
          <p>{t("investNudge", { amount: shekels(saving / (shared.years * 12), locale) })}</p>
          <Link href="/investments" className="mt-2 inline-flex min-h-11 items-center font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            {t("investLink")}
          </Link>
        </div>
        <p className="mt-4 text-footnote text-muted-foreground">{t("disclaimer")}</p>
      </section>
    </div>
  );

  function Breakdown({ name, r, max }: { name: string; r: CarCost; max: number }) {
    return (
      <div>
        <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-medium">{name}</span>
          <span className="tabular-nums">
            <span className="text-lg font-semibold">{shekels(r.total, locale)}</span>
            <span className="text-footnote text-muted-foreground"> · {t("perMonth", { amount: shekels(r.perMonth, locale) })} · {t("perKm", { amount: r.perKm.toFixed(2) })}</span>
          </span>
        </div>
        <div className="flex h-4 overflow-hidden rounded-full bg-muted" style={{ width: `${(r.total / max) * 100}%` }} role="img" aria-label={PARTS.map((p) => `${t(`part.${p}`)} ${shekels(r[p], locale)}`).join(", ")}>
          {PARTS.map((p) => r[p] > 0 && <span key={p} className={PART_COLOR[p]} style={{ width: `${(r[p] / r.total) * 100}%` }} />)}
        </div>
        {r.monthlyLoanPayment > 0 && (
          <p className="mt-1 text-footnote text-muted-foreground">{t("loanPayment", { amount: shekels(r.monthlyLoanPayment, locale) })}</p>
        )}
      </div>
    );
  }
}

const pct = (v: number) => Math.round(v * 10000) / 100;
