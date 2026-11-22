"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBudgetPeriod, setBudgetRollover } from "@/lib/api";
import { ROLLOVER_RULES, type RolloverRule } from "@/lib/finance-period";
import { shekels } from "@/lib/money";

const RULE_KEY: Record<RolloverRule, string> = {
  none: "ruleNone",
  positive: "rulePositive",
  negative: "ruleNegative",
  both: "ruleBoth",
};

/**
 * The household's own month: what the budget is after carry-in, what was actually spent, and how
 * each earlier month closed. Rollover is per category, because a leftover on groceries and an
 * overspend on a holiday are not the same thing.
 */
export function BudgetHistoryCard() {
  const t = useTranslations("budgetPeriod");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const period = useQuery({ queryKey: ["budget-period-lines"], queryFn: () => getBudgetPeriod() });

  const rollover = useMutation({
    mutationFn: ({ categoryId, rule }: { categoryId: number; rule: RolloverRule }) =>
      setBudgetRollover(categoryId, rule),
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: ["budget-period-lines"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: () => toast.error(t("failed")),
  });

  if (period.isPending) return null;
  if (period.isError || !period.data) return null;
  const { view, lines, history } = period.data;
  const money = (n: number) => shekels(Math.round(n), locale);
  const budgeted = lines.filter((l) => l.base > 0 || l.carryIn !== 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{t("lede")}</p>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: t("planned"), value: money(view.planned) },
            { label: t("spent"), value: money(view.spent) },
            { label: t("left"), value: money(view.leftover) },
            { label: t("carryIn"), value: money(lines.reduce((s, l) => s + l.carryIn, 0)) },
          ].map((f) => (
            <div key={f.label} className="rounded-xl bg-muted/50 p-3">
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                <bdi>{f.value}</bdi>
              </dd>
            </div>
          ))}
        </dl>

        <section>
          <h3 className="text-xs font-medium text-muted-foreground">{t("history")}</h3>
          <ul className="row-grid mt-1.5 text-sm">
            {history.map((h) => (
              <li key={h.period.key} className="flex items-baseline justify-between gap-3 py-1.5">
                <bdi className="tabular-nums text-muted-foreground">{/^\d{4}-\d{2}$/.test(h.period.key) ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${h.period.key}-15T12:00:00`)) : h.period.key}</bdi>
                <bdi className="tabular-nums">
                  {money(h.spent)} / {money(h.planned)}
                  <span className={h.leftover < 0 ? "ms-2 text-destructive" : "ms-2 text-muted-foreground"}>
                    {money(h.leftover)}
                  </span>
                </bdi>
              </li>
            ))}
          </ul>
        </section>

        {budgeted.length > 0 && (
          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">{t("rules")}</summary>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("rulesLede")}</p>
            <ul className="mt-2 grid gap-2">
              {budgeted.map((line) => (
                <li key={line.categoryId} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{line.name}</span>
                  <select
                    aria-label={`${t("rules")}: ${line.name}`}
                    value={line.rollover}
                    disabled={rollover.isPending}
                    onChange={(e) =>
                      rollover.mutate({ categoryId: line.categoryId, rule: e.target.value as RolloverRule })
                    }
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                  >
                    {ROLLOVER_RULES.map((rule) => (
                      <option key={rule} value={rule}>
                        {t(RULE_KEY[rule])}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
