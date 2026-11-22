"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getCategoryDetail,
  getInsights,
  getInsurance,
  getRecap,
  getSummary,
  getTagReport,
  listPensionReports,
} from "@/lib/api";
import { auditSubscriptions, isPensionStale, pensionAgeMonths } from "@/lib/guided-reviews";
import { lastCompleteMonth } from "@/lib/recap";
import { formatDate } from "@/lib/formatters";
import { shekels } from "@/lib/money";
import { translateCategoryName } from "@/lib/i18n-data";
import { cn } from "@/lib/utils";

const STEPS = ["month", "subscriptions", "category", "trip", "cover"] as const;
type Step = (typeof STEPS)[number];

/** A one-day tag reads as one date; a longer one as a range. */
const tripRange = (from: string, to: string) => {
  const start = formatDate(from);
  const end = formatDate(to);
  return start === end ? start : `${start} – ${end}`;
};

/** Five short reviews over existing reports: one question at a time, each with its numbers. */
export function ReviewsView() {
  const t = useTranslations("reviews");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const month = lastCompleteMonth(today);
  const from = `${month}-01`;
  const to = `${month}-31`;
  const wanted = params.get("step") as Step | null;
  const step: Step = wanted && STEPS.includes(wanted) ? wanted : "month";
  const index = STEPS.indexOf(step);
  const go = (next: Step) => router.replace(`${pathname}?step=${next}`, { scroll: false });

  const money = (n: number) => shekels(Math.round(n), locale);
  const catName = (name: string) => translateCategoryName(name, tCat);
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
    month: "long",
    year: "numeric",
  });

  const recap = useQuery({ queryKey: ["recap", month], queryFn: () => getRecap({ month }), enabled: step === "month" });
  const insights = useQuery({ queryKey: ["insights"], queryFn: getInsights, enabled: step === "subscriptions" });
  const summary = useQuery({ queryKey: ["summary", month], queryFn: () => getSummary({ from, to }), enabled: step === "category" });
  const tags = useQuery({ queryKey: ["tags"], queryFn: () => getTagReport(), enabled: step === "trip" });
  const insurance = useQuery({ queryKey: ["insurance"], queryFn: getInsurance, enabled: step === "cover" });
  const pension = useQuery({ queryKey: ["pension-reports"], queryFn: listPensionReports, enabled: step === "cover" });

  const [pickedCategory, setPickedCategory] = useState<string | null>(null);
  const [pickedTag, setPickedTag] = useState<string | null>(null);
  const categories = (summary.data?.categoryBreakdown ?? []).filter((c) => c.categoryId > 0);
  const category = categories.find((c) => String(c.categoryId) === pickedCategory) ?? categories[0];
  const detail = useQuery({
    queryKey: ["category-detail", category?.categoryId, month],
    queryFn: () => getCategoryDetail(category!.categoryId, { from, to }),
    enabled: step === "category" && !!category,
  });

  const tagList = tags.data?.tags ?? [];
  const tag = tagList.find((x) => x.tag === pickedTag) ?? tagList[0];
  const tagDetail = useQuery({
    queryKey: ["tags", tag?.tag],
    queryFn: () => getTagReport(tag!.tag),
    enabled: step === "trip" && !!tag,
  });

  const pending = (q: UseQueryResult) =>
    q.isPending ? (
      <p className="text-sm text-muted-foreground">{t("loading")}</p>
    ) : q.isError ? (
      <div className="grid gap-2">
        <p className="text-sm text-destructive" role="alert">{t("failed")}</p>
        <Button variant="outline" className="h-11 w-fit" onClick={() => void q.refetch()}>{t("retry")}</Button>
      </div>
    ) : null;

  function body() {
    switch (step) {
      case "month": {
        const state = pending(recap);
        if (state) return state;
        const r = recap.data?.mode === "month" ? recap.data.recap : null;
        if (!r) return <p className="text-sm text-muted-foreground">{t("month_none")}</p>;
        const diff = r.spent - r.prevSpent;
        const pct = r.prevSpent > 0 ? Math.round((Math.abs(diff) / r.prevSpent) * 100) : null;
        return (
          <StepCard title={t("month_title")} lede={t("month_lede", { month: monthLabel })} index={index}>
            <Figures
              items={[
                { label: t("month_spent"), value: money(r.spent) },
                { label: t("month_kept"), value: money(r.kept) },
                { label: t("month_income"), value: money(r.income) },
              ]}
            />
            <ul className="grid gap-1.5 text-sm leading-relaxed">
              <li>
                {diff === 0 || pct == null
                  ? t("month_spentOnly", { month: monthLabel, total: money(r.spent) })
                  : t(diff > 0 ? "month_more" : "month_less", { amount: money(Math.abs(diff)), pct })}
              </li>
              {r.kept < 0 && <li>{t("month_over", { amount: money(-r.kept) })}</li>}
              {r.top && <li>{t("month_top", { name: catName(r.top.name), total: money(r.top.spent) })}</li>}
              {r.improved && <li>{t("month_improved", { name: catName(r.improved.name), amount: money(r.improved.drop) })}</li>}
              {r.biggest && (
                <li>{t("month_biggest", { description: r.biggest.description, amount: money(r.biggest.amount) })}</li>
              )}
              <li>{t("month_noSpend", { days: r.noSpendDays, counted: r.daysCounted })}</li>
              {r.underBudgetMonths != null && r.underBudgetMonths > 1 && (
                <li>{t("month_underBudget", { months: r.underBudgetMonths })}</li>
              )}
              {r.trim && <li>{t("month_trim", { name: catName(r.trim.name), amount: money(r.trim.yearly) })}</li>}
            </ul>
            <Links items={[{ href: "/recap", label: t("linkRecap") }, { href: "/transactions", label: t("linkTransactions") }]} />
          </StepCard>
        );
      }

      case "subscriptions": {
        const state = pending(insights);
        if (state) return state;
        const series = (insights.data?.series ?? []).filter((s) => s.status !== "candidate");
        const audit = auditSubscriptions(series, today);
        const anomalies = insights.data?.anomalies.length ?? 0;
        return (
          <StepCard title={t("subs_title")} lede={t("subs_lede")} index={index}>
            {audit.count === 0 ? (
              <p className="text-sm text-muted-foreground">{t("subs_none")}</p>
            ) : (
              <>
                <Figures
                  items={[
                    { label: t("subs_count"), value: String(audit.count) },
                    { label: t("subs_monthly"), value: money(audit.monthly) },
                    { label: t("subs_yearly"), value: money(audit.yearly) },
                  ]}
                />
                <ul className="grid gap-1.5 text-sm leading-relaxed">
                  {audit.biggest && (
                    <li>{t("subs_biggest", { merchant: audit.biggest.merchant, monthly: money(audit.biggest.monthly) })}</li>
                  )}
                  {audit.raised.slice(0, 3).map((x) => (
                    <li key={`raised-${x.merchant}`}>{t("subs_raisedItem", { merchant: x.merchant, from: money(x.from), to: money(x.to) })}</li>
                  ))}
                  {audit.dormant.slice(0, 3).map((x) => (
                    <li key={`dormant-${x.merchant}`}>{t("subs_dormantItem", { merchant: x.merchant, date: x.lastDate })}</li>
                  ))}
                  {anomalies > 0 && <li>{t("subs_anomalies", { count: anomalies })}</li>}
                </ul>
                <Links items={[{ href: "/recurring", label: t("linkRecurring") }]} />
              </>
            )}
          </StepCard>
        );
      }

      case "category": {
        const state = pending(summary);
        if (state) return state;
        if (!category) return <p className="text-sm text-muted-foreground">{t("cat_none")}</p>;
        const detailState = pending(detail);
        const d = detail.data;
        const vs = d?.vsLastMonth;
        return (
          <StepCard title={t("cat_title")} lede={t("cat_lede")} index={index}>
            <Chips
              label={t("cat_pick")}
              items={categories.slice(0, 6).map((c) => ({ id: String(c.categoryId), label: catName(c.name) }))}
              value={String(category.categoryId)}
              onChange={setPickedCategory}
            />
            {detailState ??
              (d && (
                <>
                  <Figures
                    items={[
                      { label: t("cat_spent"), value: money(d.spent) },
                      { label: t("cat_count"), value: String(d.transactionCount) },
                      { label: t("cat_avg"), value: money(d.avgPerTransaction) },
                    ]}
                  />
                  <ul className="grid gap-1.5 text-sm leading-relaxed">
                    <li>
                      {vs == null || Math.round(vs) === 0
                        ? t("cat_vsSame")
                        : t(vs > 0 ? "cat_vsUp" : "cat_vsDown", { pct: Math.abs(Math.round(vs)) })}
                    </li>
                    {d.topMerchants.slice(0, 3).map((m) => (
                      <li key={m.merchant}>{t("cat_merchantItem", { merchant: m.merchant, total: money(m.amount), count: m.count })}</li>
                    ))}
                  </ul>
                  <Links items={[{ href: "/budget", label: t("linkBudget") }]} />
                </>
              ))}
          </StepCard>
        );
      }

      case "trip": {
        const state = pending(tags);
        if (state) return state;
        if (!tag) return <p className="text-sm text-muted-foreground">{t("trip_none")}</p>;
        const detailState = pending(tagDetail);
        const d = tagDetail.data;
        return (
          <StepCard title={t("trip_title")} lede={t("trip_lede")} index={index}>
            <Chips
              label={t("trip_pick")}
              items={tagList.slice(0, 8).map((x) => ({ id: x.tag, label: `#${x.tag}` }))}
              value={tag.tag}
              onChange={setPickedTag}
            />
            {detailState ??
              (d && (
                <>
                  <Figures
                    items={[
                      { label: t("trip_total"), value: money(tag.total) },
                      { label: t("trip_count"), value: String(tag.count) },
                      { label: t("trip_range"), value: tripRange(tag.from, tag.to) },
                    ]}
                  />
                  <ul className="grid gap-1.5 text-sm leading-relaxed">
                    {d.breakdown.slice(0, 3).map((b) => (
                      <li key={b.category ?? "none"}>
                        {t("trip_catItem", { category: b.category ? catName(b.category) : t("trip_uncategorized"), total: money(b.total) })}
                      </li>
                    ))}
                  </ul>
                  <Links items={[{ href: "/groups", label: t("linkTags") }]} />
                </>
              ))}
          </StepCard>
        );
      }

      case "cover": {
        const state = pending(insurance) ?? pending(pension);
        if (state) return state;
        const ins = insurance.data;
        if (!ins) return <p className="text-sm text-muted-foreground">{t("cover_none")}</p>;
        const months = pensionAgeMonths(pension.data?.reports[0]?.asOf ?? null, today);
        const missingDocs = ins.policies.filter((p) => p.documents.length === 0).length;
        const unlinkedTotal = ins.unlinked.reduce((sum, u) => sum + u.total, 0);
        return (
          <StepCard title={t("cover_title")} lede={t("cover_lede")} index={index}>
            <Figures
              items={[
                { label: t("cover_policies"), value: String(ins.totals.count) },
                { label: t("cover_monthly"), value: money(ins.totals.monthly) },
                { label: t("cover_paid"), value: money(ins.totals.paidLast12) },
                { label: t("cover_renewals"), value: String(ins.totals.renewalsSoon) },
                { label: t("cover_docs"), value: String(ins.totals.documents) },
              ]}
            />
            <ul className="grid gap-1.5 text-sm leading-relaxed">
              {ins.unlinked.length > 0 && (
                <li>{t("cover_unlinked", { count: ins.unlinked.length, total: money(unlinkedTotal) })}</li>
              )}
              {missingDocs > 0 && <li>{t("cover_missingDocs", { count: missingDocs })}</li>}
              <li>
                {months == null
                  ? t("cover_pensionNone")
                  : isPensionStale(months)
                    ? t("cover_pensionStale", { months })
                    : t("cover_pensionOk", { months })}
              </li>
            </ul>
            <Links items={[{ href: "/insurance", label: t("linkInsurance") }]} />
          </StepCard>
        );
      }
    }
  }

  return (
    <div className="space-y-4">
      <nav aria-label={t("steps")} className="flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            aria-current={s === step ? "step" : undefined}
            onClick={() => go(s)}
            className={cn(
              "min-h-11 rounded-full px-3.5 text-footnote font-medium focus-visible:outline-2 focus-visible:outline-ring",
              s === step ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent",
            )}
          >
            {i + 1}. {t(`step_${s}`)}
          </button>
        ))}
      </nav>
      {body()}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" className="h-11" disabled={index === 0} onClick={() => go(STEPS[index - 1])}>
          {t("back")}
        </Button>
        <Button className="h-11" disabled={index === STEPS.length - 1} onClick={() => go(STEPS[index + 1])}>
          {t("next")}
        </Button>
      </div>
    </div>
  );
}

function StepCard({ title, lede, index, children }: { title: string; lede: string; index: number; children: ReactNode }) {
  const t = useTranslations("reviews");
  return (
    <Card>
      <CardHeader>
        <p className="text-caption font-semibold text-primary">{t("stepOf", { n: index + 1, total: STEPS.length })}</p>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{lede}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function Figures({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((f) => (
        <div key={f.label} className="rounded-xl bg-muted/50 p-3">
          <dt className="text-xs text-muted-foreground">{f.label}</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">
            <bdi>{f.value}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Chips({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === value}
            onClick={() => onChange(item.id)}
            className={cn(
              "min-h-9 rounded-full px-3 text-footnote font-medium focus-visible:outline-2 focus-visible:outline-ring",
              item.id === value ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-accent",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Links({ items }: { items: { href: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-footnote font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
