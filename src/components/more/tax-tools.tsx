"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSuggestions } from "@/lib/api";
import { useLocale, useTranslations } from "next-intl";
import { CardShell } from "@/components/home/card-shell";
import { NumberField, numberError } from "@/components/ui/number-field";
import { Segmented } from "@/components/ui/segmented";
import { shekels } from "@/lib/money";
import { IL } from "@/lib/il-defaults";
import { creditCheck, depositPlan, type CreditAnswers } from "@/lib/tax-benefits";

/** Empty, negative or junk input counts as 0. */
const num = (raw: string) => { const x = Number(raw); return Number.isFinite(x) ? Math.max(0, x) : 0; };

const AGE_BANDS = ["born", "a1", "a3", "a4", "a6", "a18"] as const;
const DOCS = ["d106", "d867", "dDonations", "dInsurance", "dCertificates", "dBtl", "dBank"] as const;

function Result({ children }: { children: ReactNode }) {
  return <div className="mt-6 rounded-2xl bg-primary/8 p-4 sm:p-5" aria-live="polite">{children}</div>;
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-3 divide-y divide-border/60 text-footnote tabular-nums">
      {rows.map(([label, val]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 py-2 last:pb-0">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-semibold" dir="ltr">{val}</dd>
        </div>
      ))}
    </dl>
  );
}

function Footer({ guide }: { guide: [string, string] }) {
  const t = useTranslations("taxTools");
  return (
    <>
      <p className="mt-4 text-footnote"><Link href={guide[1]} className="font-medium text-primary underline-offset-4 hover:underline">{t(guide[0])}</Link></p>
      <p className="mt-4 text-caption text-muted-foreground">{t("disclaimer", { year: IL.year })}</p>
    </>
  );
}

function Check({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-sm">
      <input id={id} type="checkbox" className="size-4 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Field({ id, label, value, set, unit = "₪" }: { id: string; label: string; value: string; set: (v: string) => void; unit?: string }) {
  const t = useTranslations("calculators");
  return <NumberField id={id} label={label} value={value} onChange={set} unit={unit} error={numberError(value, t("invalid"))} />;
}

const group = "space-y-2";
const groupTitle = "text-headline font-semibold";

export function CreditPointsChecker() {
  const t = useTranslations("taxTools");
  const locale = useLocale();
  const m = (x: number) => shekels(x, locale);
  const [sex, setSex] = useState<CreditAnswers["sex"]>("woman");
  const [kids, setKids] = useState<string[]>(AGE_BANDS.map(() => "0"));
  const [degree, setDegree] = useState<CreditAnswers["degree"]>("none");
  const [service, setService] = useState<CreditAnswers["service"]>("none");
  const [aliyah, setAliyah] = useState(0);
  const [flags, setFlags] = useState({ singleParent: false, changedJobs: false, qualifyingTown: false });
  const [money, setMoney] = useState({ gross: "15000", donations: "0", lifeInsurance: "0", privatePension: "0" });
  // Last tax year's donations, found in the transactions, fill the field once (the person can still change it).
  const lastYear = new Date().getFullYear() - 1;
  const detected = useQuery({ queryKey: ["suggestions"], queryFn: getSuggestions }).data?.donations?.find((d) => d.year === lastYear)?.total;
  const [prefilled, setPrefilled] = useState(false);
  if (!prefilled && detected && money.donations === "0") {
    setPrefilled(true);
    setMoney({ ...money, donations: String(detected) });
  }

  const r = creditCheck({
    sex, children: kids.map(num), degree, service, aliyahYear: aliyah, ...flags,
    monthlyGross: num(money.gross), donations: num(money.donations), lifeInsurance: num(money.lifeInsurance), privatePension: num(money.privatePension),
  });
  const pts = (x: number) => x.toLocaleString(locale, { maximumFractionDigits: 2 });
  const flag = (k: keyof typeof flags) => <Check id={`cp-${k}`} label={t(`q_${k}`)} checked={flags[k]} onChange={(v) => setFlags({ ...flags, [k]: v })} />;
  const moneyField = (k: keyof typeof money) => <Field id={`cp-${k}`} label={t(`f_${k}`)} value={money[k]} set={(v) => setMoney({ ...money, [k]: v })} />;

  return (
    <CardShell>
      <p className="text-footnote text-pretty text-muted-foreground">{t("cpIntro")}</p>

      <div className="mt-5 space-y-6">
        <section className={group} aria-labelledby="cp-you">
          <h2 id="cp-you" className={groupTitle}>{t("you")}</h2>
          <Segmented label={t("q_sex")} value={sex} onChange={setSex} options={[{ value: "woman", label: t("woman") }, { value: "man", label: t("man") }]} />
          <div className="grid grid-cols-1 gap-4 min-[22rem]:grid-cols-2">{moneyField("gross")}</div>
        </section>

        <section className={group} aria-labelledby="cp-kids">
          <h2 id="cp-kids" className={groupTitle}>{t("kids")}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {AGE_BANDS.map((b, i) => (
              <Field key={b} id={`cp-kid-${b}`} label={t(`age_${b}`)} value={kids[i]} unit="" set={(v) => setKids(kids.map((k, j) => (j === i ? v : k)))} />
            ))}
          </div>
          {flag("singleParent")}
        </section>

        <section className={group} aria-labelledby="cp-life">
          <h2 id="cp-life" className={groupTitle}>{t("life")}</h2>
          <p className="text-sm">{t("q_degree")}</p>
          <Segmented label={t("q_degree")} value={degree} onChange={setDegree} options={(["none", "ba", "ma"] as const).map((v) => ({ value: v, label: t(`degree_${v}`) }))} />
          <p className="text-sm">{t("q_service")}</p>
          <Segmented label={t("q_service")} value={service} onChange={setService} options={(["none", "short", "full"] as const).map((v) => ({ value: v, label: t(`service_${v}`) }))} />
          <p className="text-sm">{t("q_aliyah")}</p>
          <Segmented label={t("q_aliyah")} value={aliyah} onChange={setAliyah} options={[0, 1, 2, 3, 4, 5].map((v) => ({ value: v, label: v === 0 ? t("aliyah_no") : t("aliyah_year", { n: v }) }))} />
          {flag("changedJobs")}
          {flag("qualifyingTown")}
        </section>

        <section className={group} aria-labelledby="cp-paid">
          <h2 id="cp-paid" className={groupTitle}>{t("paid")}</h2>
          <div className="grid grid-cols-1 gap-4 min-[22rem]:grid-cols-2 md:grid-cols-3">
            {moneyField("donations")}
            {prefilled && <p className="text-xs text-muted-foreground">{t("donationsDetected", { year: lastYear })}</p>}
            {moneyField("lifeInsurance")}{moneyField("privatePension")}
          </div>
        </section>
      </div>

      <Result>
        <p className="text-title font-semibold text-pretty tabular-nums">{r.refund > 0 ? t("cpHead", { amount: m(r.refund) }) : t("cpNone")}</p>
        <Rows rows={[[t("r_likely"), pts(r.likely)], [t("r_entitled"), pts(r.entitled)], [t("r_pointValue"), m(IL.creditPointMonthly * 12)]]} />
      </Result>

      {r.checks.length > 0 && (
        <section className="mt-6" aria-labelledby="cp-checks">
          <h2 id="cp-checks" className={groupTitle}>{t("checksTitle")}</h2>
          <ul className="mt-2 list-disc space-y-1.5 ps-5 text-sm text-pretty">{r.checks.map((c) => <li key={c}>{t(`check_${c}`)}</li>)}</ul>
        </section>
      )}
      <p className="mt-4 rounded-xl bg-muted p-3 text-sm text-pretty">{t("sixYears", { years: IL.taxRefundYears })}</p>

      <section className="mt-6" aria-labelledby="cp-docs">
        <h2 id="cp-docs" className={groupTitle}>{t("docsTitle")}</h2>
        <ul className="mt-2 list-disc space-y-1.5 ps-5 text-sm text-pretty">{DOCS.map((d) => <li key={d}>{t(d)}</li>)}</ul>
      </section>
      <Footer guide={["guideRefund", "/learn/tax-refund"]} />
    </CardShell>
  );
}

export function DepositOptimizer() {
  const t = useTranslations("taxTools");
  const locale = useLocale();
  const m = (x: number) => shekels(x, locale);
  const [selfEmployed, setSelfEmployed] = useState(false);
  const [v, setV] = useState({ income: "15000", pension: "500", study: "1000" });
  const r = depositPlan({ selfEmployed, monthlyIncome: num(v.income), pensionMonthly: num(v.pension), studyMonthly: num(v.study) });
  const kind = selfEmployed ? "se" : "sal";
  const field = (k: keyof typeof v) => <Field id={`dp-${k}`} label={t(`dp_${k}_${kind}`)} value={v[k]} set={(x) => setV({ ...v, [k]: x })} />;

  return (
    <CardShell>
      <p className="text-footnote text-pretty text-muted-foreground">{t(`dpIntro_${kind}`)}</p>
      <div className="mt-5 space-y-4">
        <Segmented label={t("dp_status")} value={kind} onChange={(k) => setSelfEmployed(k === "se")} options={[{ value: "sal", label: t("salaried") }, { value: "se", label: t("selfEmployed") }]} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{field("income")}{field("pension")}{field("study")}</div>
      </div>
      <Result>
        <p className="text-title font-semibold text-pretty tabular-nums">{r.missed > 0.5 ? t("dpHead", { amount: m(r.missed) }) : t("dpFull")}</p>
        {(["pension", "study"] as const).map((k) => (
          <div key={k} className="mt-4">
            <h2 className="text-headline font-semibold">{t(`dp_${k}`)}</h2>
            <Rows rows={[[t("r_max"), m(r[k].max)], [t("r_now"), m(r[k].now)], [t("r_unused"), m(r[k].unused)], [t("r_benefit"), m(r[k].benefit)], [t("r_benefitMax"), m(r[k].benefitMax)]]} />
          </div>
        ))}
      </Result>
      <p className="mt-4 text-sm text-pretty text-muted-foreground">{t(`dpNote_${kind}`, { rate: Math.round(r.marginal * 100), gainsFree: m(IL.selfEmployedDeposits.studyGainsFreeCap) })}</p>
      <Footer guide={["guideDeposits", "/learn/gemel-and-hishtalmut"]} />
    </CardShell>
  );
}
