"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Briefcase, Download } from "lucide-react";
import { getBusinessReport } from "@/lib/api";
import { shekels } from "@/lib/money";
import { translateCategoryName } from "@/lib/i18n-data";

const today = () => new Date().toISOString().slice(0, 10);
const yearAgoStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)).toISOString().slice(0, 10);
};

/**
 * The business side of the ledger: what part of spending and income belongs to work, per month,
 * category and merchant, with a CSV an accountant can take.
 */
export function BusinessReportView() {
  const t = useTranslations("business");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const [from, setFrom] = useState(yearAgoStart);
  const [to, setTo] = useState(today);

  const report = useQuery({
    queryKey: ["business", from, to],
    queryFn: () => getBusinessReport(from, to),
  });

  const money = (n: number) => shekels(Math.round(n), locale);
  const monthName = (m: string) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${m}-01T12:00:00`));
  const data = report.data;
  const empty = !!data && data.businessTransactions === 0;

  return (
    <div className="space-y-6">
      <p className="flex max-w-2xl items-start gap-2 text-footnote text-muted-foreground"><Briefcase className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />{t("description")}</p>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-muted/30 px-4 py-3">
        <label className="space-y-1 text-caption">
          <span className="block text-muted-foreground">{t("from")}</span>
          <input
            type="date"
            value={from}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
            className="rounded-lg border border-input bg-background px-2 py-1.5 text-footnote"
            dir="ltr"
          />
        </label>
        <label className="space-y-1 text-caption">
          <span className="block text-muted-foreground">{t("to")}</span>
          <input
            type="date"
            value={to}
            onChange={(e) => e.target.value && setTo(e.target.value)}
            className="rounded-lg border border-input bg-background px-2 py-1.5 text-footnote"
            dir="ltr"
          />
        </label>
        <a
          href={`/api/business?from=${from}&to=${to}&format=csv`}
          download
          className="ms-auto inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Download className="size-4" aria-hidden />
          {t("csv")}
        </a>
      </div>

      {report.isPending ? (
        <p role="status" className="text-footnote text-muted-foreground">{t("loading")}</p>
      ) : report.isError || !data ? (
        <p role="alert" className="text-footnote">{t("loadFailed")}</p>
      ) : empty ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-footnote text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: t("expenses"), value: money(data.expenses) },
              { label: t("income"), value: money(data.income) },
              { label: t("net"), value: money(data.net) },
              { label: t("rows"), value: data.businessTransactions.toLocaleString(locale) },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-border bg-card p-4">
                <div className="text-caption text-muted-foreground">{card.label}</div>
                <div className="text-title font-semibold tabular-nums" data-money><bdi>{card.value}</bdi></div>
              </div>
            ))}
          </div>

          <section className="space-y-2">
            <h2 className="text-footnote font-semibold text-muted-foreground">{t("monthsTitle")}</h2>
            <div className="overflow-x-auto rounded-2xl border">
              <table className="w-full text-footnote">
                <caption className="sr-only">{t("monthsTitle")}</caption>
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t("month")}</th>
                    <th scope="col" className="px-3 py-2 text-end font-medium">{t("expenses")}</th>
                    <th scope="col" className="px-3 py-2 text-end font-medium">{t("income")}</th>
                    <th scope="col" className="px-3 py-2 text-end font-medium">{t("net")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.months.map((m) => (
                    <tr key={m.month} className="border-t">
                      <td className="px-3 py-1.5">{monthName(m.month)}</td>
                      <td className="px-3 py-1.5 text-end tabular-nums" data-money>{money(m.expenses)}</td>
                      <td className="px-3 py-1.5 text-end tabular-nums" data-money>{money(m.income)}</td>
                      <td className="px-3 py-1.5 text-end tabular-nums" data-money>{money(m.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-2">
              <h2 className="text-footnote font-semibold text-muted-foreground">{t("categoriesTitle")}</h2>
              <ul className="divide-y rounded-2xl border text-footnote">
                {data.categories.map((c) => (
                  <li key={c.categoryId} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color ?? "#B5B3AC" }} aria-hidden />
                      <span className="truncate">{c.name ? translateCategoryName(c.name, tCat) : t("uncategorized")}</span>
                      <span className="text-caption text-muted-foreground">{c.count}</span>
                    </span>
                    <span className="tabular-nums" data-money>{money(c.expenses)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-footnote font-semibold text-muted-foreground">{t("merchantsTitle")}</h2>
              <ul className="divide-y rounded-2xl border text-footnote">
                {data.merchants.map((m) => (
                  <li key={m.merchant} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="truncate">{m.merchant}</span>
                    <span className="tabular-nums" data-money>{money(m.expenses)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <p className="text-caption text-muted-foreground">{t("hint")}</p>
        </>
      )}
    </div>
  );
}
