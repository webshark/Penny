"use client";

import { useLocale, useTranslations } from "next-intl";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import { moneyFlow, type FlowNode } from "@/lib/money-flow";
import { shekels } from "@/lib/money";
import { translateCategoryName } from "@/lib/i18n-data";
import { CardShell } from "@/components/home/card-shell";
import type { OverviewPayload } from "@/lib/types";

/** Money flow: where the period's income went, as a Sankey of income → expenses/savings → categories. */
export function MoneyFlowCard({ data }: { data: OverviewPayload }) {
  const t = useTranslations("moneyFlow");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const money = (n: number) => shekels(Math.round(n), locale);
  const flow = moneyFlow(data.totals.income, data.categories.map((c) => ({ name: translateCategoryName(c.name, tCat), spent: c.spent, color: c.color })));
  if (!flow || flow.links.length < 2) return null;
  const label = (n: FlowNode) => (n.kind === "category" ? n.name : t(n.kind));
  const nodeValue = (i: number) => Math.max(
    flow.links.filter((l) => l.source === i).reduce((s, l) => s + l.value, 0),
    flow.links.filter((l) => l.target === i).reduce((s, l) => s + l.value, 0),
  );
  const summary = t("summary", { income: money(data.totals.income), expenses: money(flow.expenses), saved: money(Math.max(0, data.totals.income - flow.expenses)) });

  return (
    <CardShell label={t("title")}>
      <p className="mb-3 text-sm text-muted-foreground">{summary}</p>
      <div className="h-80" dir="ltr" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={{ nodes: flow.nodes, links: flow.links }}
            nodePadding={14}
            nodeWidth={10}
            margin={{ top: 24, right: 150, bottom: 8, left: 8 }}
            link={{ stroke: "var(--primary)", strokeOpacity: 0.18 }}
            node={({ x, y, width, height, index }: { x: number; y: number; width: number; height: number; index: number }) => {
              const n = flow.nodes[index];
              const end = n.kind === "category" || n.kind === "other" || n.kind === "saved";
              return (
                <g>
                  <rect x={x} y={y} width={width} height={Math.max(2, height)} rx={2} fill={n.color} />
                  {/* End nodes are labelled beside them; income and expenses above, so the label never sits on the flows. */}
                  <text x={end ? x + width + 6 : x} y={end ? y + height / 2 : y - 6} dy={end ? "0.35em" : 0} fontSize={12} fill="var(--foreground)">
                    {label(n)} <tspan fill="var(--muted-foreground)">{money(nodeValue(index))}</tspan>
                  </text>
                </g>
              );
            }}
          >
            <Tooltip formatter={(v) => money(Number(v))} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" }} />
          </Sankey>
        </ResponsiveContainer>
      </div>
    </CardShell>
  );
}
