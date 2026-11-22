"use client";

import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Gauge, LayoutList, BarChart3, Mail } from "lucide-react";
import { envelopeBalance } from "@/lib/envelope";
import { shekels } from "@/lib/money";
import { translateCategoryName } from "@/lib/i18n-data";
import type { DashboardSummary } from "@/lib/types";

function Panel({ title, Icon, children }: { title: string; Icon: typeof Gauge; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary"><Icon className="size-4" aria-hidden /></span>{title}</h3>
      {children}
    </section>
  );
}

/** "period overview" beside the budget: totals, pace, recent months, and what is over. */
export function BudgetSidePanel({ summary, month }: { summary: DashboardSummary; month: string }) {
  const t = useTranslations("budgetPanel");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const money = (n: number) => shekels(Math.round(n), locale);
  const available = summary.totalBudget - summary.budgetedSpent;
  const env = envelopeBalance(summary.income ?? 0, summary.categoriesWithData, summary.totalBudget);
  const over = summary.categoriesWithData.filter((c) => !c.isParent && c.budget > 0 && c.spent > c.budget).sort((a, b) => (b.spent - b.budget) - (a.spent - a.budget));
  const months = summary.monthlySpend.slice(-6);
  const max = Math.max(summary.totalBudget, ...months.map((m) => m.amount), 1);
  const monthLabel = (m: string) => new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(`${m}-01T12:00:00`));
  const bar = (pct: number, cls: string) => <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden><div className={`h-full rounded-full ${cls}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>;
  return (
    <aside aria-label={t("title")} className="space-y-3 xl:sticky xl:top-[calc(var(--app-header-h,0px)+16px)]">
      <div className="px-1"><h2 className="text-base font-semibold">{t("title")}</h2><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`))}</p></div>

      <Panel title={t("breakdown")} Icon={LayoutList}>
        <dl className="space-y-1.5 text-sm">
          {[[t("budget"), summary.totalBudget, ""], [t("spent"), -summary.budgetedSpent, ""], [t("uncategorized"), -summary.uncategorized.spent, "text-muted-foreground"]].map(([k, v, c]) => (
            <div key={k as string} className={`flex justify-between gap-2 ${c}`}><dt>{k}</dt><dd className="tabular-nums" data-money><bdi>{money(v as number)}</bdi></dd></div>
          ))}
          <div className="flex justify-between gap-2 border-t border-border pt-2 font-semibold"><dt>{t("available")}</dt><dd className={`rounded-md px-1.5 tabular-nums ${available < 0 ? "bg-expense/15 text-expense" : "bg-status-on-track/15 text-status-on-track"}`} data-money><bdi>{money(available)}</bdi></dd></div>
        </dl>
      </Panel>

      {env.income > 0 && (
        <Panel title={t("envelope")} Icon={Mail}>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><dt>{t("envIncome")}</dt><dd className="tabular-nums" data-money><bdi>{money(env.income)}</bdi></dd></div>
            <div className="flex justify-between gap-2"><dt>{t("envAssigned")}</dt><dd className="tabular-nums" data-money><bdi>{money(-env.assigned)}</bdi></dd></div>
            <div className="flex justify-between gap-2 border-t border-border pt-2 font-semibold"><dt>{t("envUnassigned")}</dt><dd className={`rounded-md px-1.5 tabular-nums ${env.unassigned < 0 ? "bg-expense/15 text-expense" : "bg-status-on-track/15 text-status-on-track"}`} data-money><bdi>{money(env.unassigned)}</bdi></dd></div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">{env.unassigned < 0 ? t("envOver") : Math.round(env.unassigned) === 0 ? t("envDone") : t("envLeft")}</p>
        </Panel>
      )}

      <Panel title={t("pace")} Icon={Gauge}>
        <div className="space-y-3 text-sm">
          <div><div className="mb-1 flex justify-between"><span>{t("spentOfBudget")}</span><bdi className="tabular-nums">{Math.round(summary.overallPercentSpent)}%</bdi></div>{bar(summary.overallPercentSpent, summary.overallPercentSpent > summary.timeElapsedPercent ? "bg-expense" : "bg-status-on-track")}</div>
          <div><div className="mb-1 flex justify-between text-muted-foreground"><span>{t("monthPassed")}</span><bdi className="tabular-nums">{Math.round(summary.timeElapsedPercent)}%</bdi></div>{bar(summary.timeElapsedPercent, "bg-muted-foreground/50")}</div>
          <p className="text-xs text-muted-foreground">{t("daysToPayday", { n: summary.daysUntilPayday })}</p>
        </div>
      </Panel>

      {months.length > 1 && summary.totalBudget > 0 && (
        <Panel title={t("budgetVsSpent")} Icon={BarChart3}>
          <div role="img" aria-label={t("chartLabel", { budget: money(summary.totalBudget) })}>
            {/* Bars and the budget line share one 88px box, so a month under budget always sits below the line. */}
            <div className="relative flex h-[88px] items-end gap-2">
              <div className="absolute inset-x-0 border-t border-dashed border-primary/60" style={{ bottom: `${(summary.totalBudget / max) * 100}%` }} aria-hidden />
              {months.map((m) => (
                <div key={m.month} className={`flex-1 rounded-t-md ${m.amount > summary.totalBudget ? "bg-expense/80" : "bg-primary/70"}`} style={{ height: `${(m.amount / max) * 100}%` }} title={money(m.amount)} />
              ))}
            </div>
            <div className="mt-1 flex gap-2">
              {months.map((m) => <span key={m.month} className="flex-1 text-center text-[10px] text-muted-foreground">{monthLabel(m.month)}</span>)}
            </div>
          </div>
        </Panel>
      )}

      {over.length > 0 && (
        <Panel title={t("overspent", { n: over.length })} Icon={AlertTriangle}>
          <ul className="space-y-1.5 text-sm">
            {over.slice(0, 5).map((c) => (
              <li key={c.categoryId} className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ background: c.categoryColor }} aria-hidden />
                <span className="flex-1 truncate">{translateCategoryName(c.categoryName, tCat)}</span>
                <bdi className="tabular-nums text-expense" data-money>{money(-(c.spent - c.budget))}</bdi>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </aside>
  );
}
