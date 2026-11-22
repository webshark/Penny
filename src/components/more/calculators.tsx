"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShieldCheck, SearchCheck, HandHeart, Building2 } from "lucide-react";
import { Banknote, Calculator,ChevronLeft, Car, CreditCard, Briefcase, Coins, Receipt, TrendingDown,Compass, FileSearch, Flame, House, Landmark, LifeBuoy, PieChart, Percent, PiggyBank, Plane, Scale, Sunset, Target, TrendingUp, type LucideIcon } from "lucide-react";
import { CardShell } from "@/components/home/card-shell";
import { NumberField, numberError } from "@/components/ui/number-field";
import { shekels } from "@/lib/money";
import { IL } from "@/lib/il-defaults";
import { inflation, leaseVsBuy, loan, mortgage, savingsGoal, split503020, type CalcSlug } from "@/lib/calculators";
import { projectBalance, debtPayoff } from "@/lib/plan";
import { fiNumber, yearsToTarget } from "@/lib/fi";
import { BENCHMARK_FEES, feeCost } from "@/lib/plan";
import { annuityVsLump, severanceChoice } from "@/lib/retirement";
import { CMA_SITES } from "@/lib/funds";
import { netSalary } from "@/lib/net-salary";
import { lossOffset } from "@/lib/tax-benefits";

type N = (k: string) => number;
/** head: [message key, values]; rows: [label key, already-formatted value]. */
type Out = { head: [string, Record<string, string | number>]; rows: [string, string][] };
type Calc = { group: Group; Icon: LucideIcon; fields: [string, string, ("%" | undefined)?][]; run: (n: N, money: (x: number) => string) => Out; links?: [string, string][] };

export const GROUPS = ["savings", "loans", "income", "planning"] as const;
type Group = (typeof GROUPS)[number];

/** Official comparison sites, shown under the fees calculator. */
const FUND_LINKS = Object.entries(CMA_SITES).map(([k, href]): [string, string] => [`link${k}`, href]);

const CALCS: Record<CalcSlug, Calc> = {
  compound: { group: "savings", Icon: TrendingUp, fields: [["initial", "50000"], ["monthly", "1000"], ["years", "20"], ["ret", "5", "%"]], run: (n, m) => {
    const end = projectBalance(n("initial"), n("monthly"), n("years"), n("ret") / 100, 0, 0);
    const dep = n("initial") + n("monthly") * Math.round(n("years") * 12);
    return { head: ["compoundHead", { amount: m(end), years: n("years") }], rows: [["deposited", m(dep)], ["growth", m(end - dep)]] };
  } },
  fees: { group: "savings", Icon: Percent, fields: [["balance", "300000"], ["monthly", "2500"], ["years", "25"], ["ret", "5", "%"], ["feeDeposit", "1.5", "%"], ["feeBalance", "0.3", "%"]], run: (n, m) => {
    const free = projectBalance(n("balance"), n("monthly"), n("years"), n("ret") / 100, 0, 0);
    const paid = projectBalance(n("balance"), n("monthly"), n("years"), n("ret") / 100, n("feeDeposit"), n("feeBalance"));
    // A deposit fee means a pension fund; none means study/provident, which charge on balance only.
    const vs = feeCost(n("feeDeposit") > 0 ? "pension" : "study_fund", n("balance"), n("monthly"), n("years"), n("feeDeposit"), n("feeBalance"), n("ret") / 100);
    return { head: ["feesHead", { amount: m(free - paid), years: n("years") }], rows: [["withFees", m(paid)], ["noFees", m(free)], ["vsMarket", m(vs?.cost ?? 0)]] };
  }, links: FUND_LINKS },
  inflation: { group: "savings", Icon: Banknote, fields: [["amount", "100000"], ["infl", "2.5", "%"], ["years", "10"]], run: (n, m) => {
    const r = inflation(n("amount"), n("infl"), n("years"));
    return { head: ["inflationHead", { amount: m(n("amount")), real: m(r.realValue), years: n("years") }], rows: [["needed", m(r.needed)]] };
  } },
  goal: { group: "savings", Icon: Target, fields: [["target", "100000"], ["saved", "10000"], ["months", "36"], ["ret", "3", "%"]], run: (n, m) => {
    const pm = savingsGoal(n("target"), n("saved"), n("months"), n("ret"));
    return { head: ["goalHead", { amount: m(pm), months: n("months") }], rows: [["deposited", m(pm * Math.max(1, Math.round(n("months"))))]] };
  } },
  mortgage: { group: "loans", Icon: House, fields: [["primeAmount", "500000"], ["primeRate", String(IL.typicalMortgageRate), "%"], ["fixedAmount", "500000"], ["fixedRate", "4.8", "%"], ["otherAmount", "0"], ["otherRate", "3", "%"], ["years", "25"]], run: (n, m) => {
    const r = mortgage(["prime", "fixed", "other"].map((t) => ({ amount: n(`${t}Amount`), ratePct: n(`${t}Rate`), years: n("years") })));
    return { head: ["paymentHead", { amount: m(r.monthly) }], rows: [["totalPaid", m(r.total)], ["interest", m(r.interest)]] };
  } },
  loan: { group: "loans", Icon: Landmark, fields: [["amount", "50000"], ["rate", "6", "%"], ["years", "5"]], run: (n, m) => {
    const r = loan({ amount: n("amount"), ratePct: n("rate"), years: n("years") });
    return { head: ["paymentHead", { amount: m(r.monthly) }], rows: [["totalPaid", m(r.total)], ["interest", m(r.interest)]] };
  } },
  credit: { group: "loans", Icon: CreditCard, fields: [["balance", "15000"], ["rate", "12", "%"], ["payment", "1000"]], run: (n, m) => {
    const r = debtPayoff(n("balance"), n("rate"), n("payment"));
    return r ? { head: ["creditHead", { months: r.months }], rows: [["interest", m(r.interest)]] } : { head: ["creditNever", {}], rows: [] };
  } },
  leaseBuy: { group: "loans", Icon: Car, fields: [["price", "150000"], ["residual", "55", "%"], ["years", "3"], ["rate", "5", "%"], ["leaseMonthly", "2400"], ["leaseUpfront", "10000"]], run: (n, m) => {
    const r = leaseVsBuy({ price: n("price"), residualPct: n("residual"), years: n("years"), ratePct: n("rate"), leaseMonthly: n("leaseMonthly"), leaseUpfront: n("leaseUpfront") });
    return { head: [r.diff > 0 ? "buyCheaper" : "leaseCheaper", { amount: m(Math.abs(r.diff)), years: n("years") }], rows: [["buyTotal", m(r.buy)], ["leaseTotal", m(r.lease)], ["buyMonthly", m(r.buyMonthly)]] };
  } },
  net: { group: "income", Icon: Calculator, fields: [["gross", "15000"], ["points", "2.25"], ["pension", "6", "%"], ["studyFund", "2.5", "%"]], run: (n, m) => {
    const r = netSalary({ gross: n("gross"), sex: "man", extraPoints: n("points") - IL.creditPoints.man, pensionRate: n("pension") / 100, studyFundRate: n("studyFund") / 100 });
    return { head: ["netHead", { amount: m(r.net) }], rows: [["incomeTax", m(r.incomeTax)], ["bituach", m(r.bituach)], ["pensionDed", m(r.pension)], ["studyFundDed", m(r.studyFund)]] };
  } },
  budget: { group: "income", Icon: PieChart, fields: [["net", "15000"]], run: (n, m) => {
    const s = split503020(n("net"));
    return { head: ["budgetHead", { amount: m(s.savings) }], rows: [["needs", m(s.needs)], ["wants", m(s.wants)], ["savings", m(s.savings)]] };
  } },
  emergency: { group: "planning", Icon: LifeBuoy, fields: [["expenses", "12000"], ["months", "6"], ["saved", "20000"]], run: (n, m) => {
    const target = n("expenses") * n("months");
    return { head: ["emergencyHead", { amount: m(target) }], rows: [["gap", m(Math.max(0, target - n("saved")))], ["covered", n("expenses") > 0 ? (n("saved") / n("expenses")).toFixed(1) : "0"]] };
  } },
  annuity: { group: "planning", Icon: Sunset, fields: [["balance", "1200000"], ["factor", "200"], ["age", "67"], ["untilAge", "87"], ["ret", "4", "%"], ["lumpTax", "0", "%"]], run: (n, m) => {
    const r = annuityVsLump({ balance: n("balance"), factor: n("factor"), age: n("age"), untilAge: n("untilAge"), returnPct: n("ret"), lumpTaxPct: n("lumpTax") });
    return { head: ["annuityHead", { annuity: m(r.annuity), lump: m(r.lumpMonthly), age: n("untilAge") }], rows: [["lumpNet", m(r.lumpNet)], ["breakEven", r.breakEvenAge == null ? "—" : r.breakEvenAge.toFixed(1)]] };
  }, links: [["linkA190", "/fi?tab=tools"], ["linkPayoutGuide", "/learn/pension-payout"]] },
  severance: { group: "planning", Icon: Briefcase, fields: [["amount", "120000"], ["serviceYears", "6"], ["salary", "18000"], ["yearsToRetire", "25"], ["ret", "5", "%"], ["tax", "31", "%"]], run: (n, m) => {
    const r = severanceChoice({ amount: n("amount"), serviceYears: n("serviceYears"), salary: n("salary"), yearsToRetire: n("yearsToRetire"), returnPct: n("ret"), taxPct: n("tax"), exemptPerYear: IL.severanceExemptPerYear });
    return { head: ["severanceHead", { amount: m(r.lost), years: n("yearsToRetire") }], rows: [["exempt", m(r.exempt)], ["taxNow", m(r.taxNow)], ["keepValue", m(r.keep)], ["withdrawValue", m(r.withdrawInvested)]] };
  }, links: [["linkSeveranceGuide", "/learn/severance"]] },
  lossOffset: { group: "savings", Icon: TrendingDown, fields: [["gains", "40000"], ["losses", "10000"]], run: (n, m) => {
    const r = lossOffset(n("gains"), n("losses"));
    return { head: ["lossOffsetHead", { amount: m(r.saved) }], rows: [["taxBefore", m(r.taxBefore)], ["taxAfter", m(r.taxAfter)], ["carryForward", m(r.carryForward)]] };
  }, links: [["linkInvestTaxGuide", "/learn/investment-tax"]] },
  fire: { group: "planning", Icon: Flame, fields: [["spend", "12000"], ["saved", "200000"], ["monthly", "4000"], ["ret", "5", "%"], ["withdraw", "4", "%"]], run: (n, m) => {
    const target = fiNumber(n("spend") * 12, n("withdraw") / 100);
    const y = yearsToTarget(n("saved"), n("monthly"), n("ret") / 100, target);
    return { head: [y == null ? "fireNever" : "fireHead", { amount: m(target), years: y == null ? 0 : Math.ceil(y) }], rows: [["fireTarget", m(target)]] };
  } },
};

/** Counts, not money: no ₪ unit. */
const UNITLESS = new Set(["years", "months", "points", "age", "untilAge", "factor", "serviceYears", "yearsToRetire"]);


/** Calculators that already live on the investments page. */
const ELSEWHERE = [
  { key: "rentBuy", Icon: Scale, group: "planning" },
  { key: "investTools", Icon: PiggyBank, group: "savings" },
  { key: "vacation", Icon: Plane, group: "savings", href: "/journey#vacation" },
  { key: "creditPoints", Icon: Receipt, group: "income", href: "/calculators/credit-points" },
  { key: "deposits", Icon: Coins, group: "savings", href: "/calculators/deposits" },
  { key: "track", Icon: Compass, group: "savings", href: "/calculators/track" },
  { key: "clearingHouse", Icon: FileSearch, group: "savings", href: "/calculators/clearing-house" },
  { key: "insurance", Icon: ShieldCheck, group: "planning", href: "/fi?tab=safety" },
  { key: "lostMoney", Icon: SearchCheck, group: "savings", href: "/calculators/lost-money" },
  { key: "rights", Icon: HandHeart, group: "income", href: "/calculators/rights" },
  { key: "bankFees", Icon: Building2, group: "income", href: "/calculators/bank-fees" },
] as const;

/** The order a household meets money decisions in: month → safety → debt → goals → invest → big moves → freedom. */
const STAGES = [
  ["month", ["budget", "net", "creditPoints", "rights", "bankFees"]],
  ["safety", ["emergency", "insurance", "lostMoney"]],
  ["debt", ["credit", "loan"]],
  ["goals", ["goal", "inflation", "vacation"]],
  ["invest", ["deposits", "compound", "fees", "lossOffset","track", "clearingHouse", "investTools"]],
  ["decisions", ["mortgage", "rentBuy", "leaseBuy", "severance"]],
  ["freedom", ["fire", "annuity"]],
] as const;

function tool(key: string): { Icon: LucideIcon; href: string } {
  const e = ELSEWHERE.find((x) => x.key === key);
  return e ? { Icon: e.Icon, href: "href" in e ? e.href : "/investments?tab=tools" } : { Icon: CALCS[key as CalcSlug].Icon, href: `/calculators/${key}` };
}

/** One row of an inset grouped list: icon, title, one-line hint, chevron. */
export function NavRow({ href, Icon, title, hint, color }: { href: string; Icon: LucideIcon; title: string; hint: string; color?: string }) {
  return (
    <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-[background-color] duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground" style={color ? { backgroundColor: color, color: "#fff" } : undefined} aria-hidden><Icon className="size-[1.125rem]" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-footnote text-pretty text-muted-foreground">{hint}</span>
      </span>
      <ChevronLeft className="size-4 shrink-0 text-muted-foreground/70 ltr:rotate-180" aria-hidden />
    </Link>
  );
}

export const groupedList = "overflow-hidden rounded-2xl border border-border/60 bg-card divide-y divide-border/60";

/** One saturated colour per life stage, so the seven groups read apart at a glance (white icons stay above 3:1). */
const STAGE_COLORS = ["#0a7ea4", "#2b8a4e", "#c8384f", "#b86e00", "#5541cc", "#0b63c4", "#8a3fb0"];

export function CalculatorTiles() {
  const t = useTranslations("calculators");
  return (
    <section aria-labelledby="calc-title" className="space-y-4">
      <div className="px-1">
        <h2 id="calc-title" className="text-title font-semibold">{t("title")}</h2>
        <p className="mt-1 text-footnote text-pretty text-muted-foreground">{t("stagesIntro")}</p>
      </div>
      <ol className="grid gap-x-6 gap-y-6 lg:grid-cols-2">
        {STAGES.map(([stage, keys], i) => (
          <li key={stage} aria-labelledby={`stage-${stage}`}>
            <div className="mb-2 flex items-start gap-3 px-1">
              <span style={{ backgroundColor: STAGE_COLORS[i % STAGE_COLORS.length] }} className="mt-px grid size-6 shrink-0 place-items-center rounded-full text-white text-caption font-semibold tabular-nums" aria-hidden>{i + 1}</span>
              <div className="min-w-0">
                <h3 id={`stage-${stage}`} className="text-headline font-semibold">
                  <span className="sr-only">{t("stageN", { n: i + 1 })} </span>{t(`stage_${stage}`)}
                </h3>
                <p className="text-footnote text-pretty text-muted-foreground">{t(`stage_${stage}_why`)}</p>
              </div>
            </div>
            <ul className={groupedList}>
              {keys.map((key) => {
                const { Icon, href } = tool(key);
                return <li key={key}><NavRow href={href} Icon={Icon} title={t(`${key}_title`)} hint={t(`${key}_q`)} color={STAGE_COLORS[i % STAGE_COLORS.length]} /></li>;
              })}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CalculatorView({ slug }: { slug: CalcSlug }) {
  const t = useTranslations("calculators");
  const locale = useLocale();
  const c = CALCS[slug];
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(c.fields.map(([k, d]) => [k, d])));
  // Every field is min="0": empty, non-numeric, negative and overflow (1e400) all count as 0, so no NaN/Infinity reaches the text.
  const n: N = (k) => { const x = Number(v[k]); return Number.isFinite(x) ? Math.max(0, x) : 0; };
  const out = c.run(n, (x) => shekels(Number.isFinite(x) ? x : 0, locale));
  return (
    <CardShell>
      <p className="text-footnote text-pretty text-muted-foreground">{t(`${slug}_explain`, { year: IL.year, prime: IL.primeRate, pDep: BENCHMARK_FEES.pension.deposit, pBal: BENCHMARK_FEES.pension.balance, gBal: BENCHMARK_FEES.study_fund.balance, exempt: IL.severanceExemptPerYear.toLocaleString(locale) })}</p>
      <div className="mt-5 grid grid-cols-1 gap-4 min-[22rem]:grid-cols-2 md:grid-cols-3">
        {c.fields.map(([k, , suffix]) => (
          <NumberField key={k} id={`calc-${k}`} label={t(`f_${k}`)} value={v[k]} onChange={(x) => setV({ ...v, [k]: x })}
            unit={suffix ?? (UNITLESS.has(k) ? undefined : "₪")} error={numberError(v[k], t("invalid"))} />
        ))}
      </div>
      <div className="mt-6 rounded-2xl bg-primary/8 p-4 sm:p-5" aria-live="polite">
        <p className="text-title font-semibold text-pretty tabular-nums">{t(out.head[0], out.head[1])}</p>
        {out.rows.length > 0 && (
          <dl className="row-grid mt-3 text-footnote tabular-nums">
            {out.rows.map(([k, val]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="text-muted-foreground">{t(`r_${k}`)}</dt>
                <dd className="font-semibold" dir="ltr">{val}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {c.links && (
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-footnote">
          {c.links.map(([k, href]) => (
            <li key={k}>
              {href.startsWith("http")
                ? <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">{t(k)}</a>
                : <Link href={href} className="font-medium text-primary underline-offset-4 hover:underline">{t(k)}</Link>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-caption text-muted-foreground">{t("notAdvice")}{IL_BASED.has(slug) && ` ${t("asOf", { year: IL.year })}`}</p>
    </CardShell>
  );
}

/** Calculators whose numbers come from il-defaults, so they show the year they are correct for. */
const IL_BASED = new Set<string>(["net", "mortgage", "lossOffset", "severance"]);
