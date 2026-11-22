"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { updateBudget } from "@/lib/api";
import { shekels } from "@/lib/money";
import { translateCategoryName } from "@/lib/i18n-data";
import type { CategoryWithData } from "@/lib/types";

/** The budget amount, edited in place: a tap turns it into a field; Enter or leaving it saves, Escape cancels. */
function AssignedCell({ c, money }: { c: CategoryWithData; money: (n: number) => string }) {
  const t = useTranslations("budgetTable");
  const tCat = useTranslations("categoriesSeeded");
  const label = t("editAssigned", { name: translateCategoryName(c.categoryName, tCat) });
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: (amount: number) => updateBudget(c.categoryId, amount),
    onSuccess: () => ["summary", "budgets", "budget-period", "home"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
    onError: () => toast.error(t("saveFailed")),
  });
  const commit = (raw: string) => {
    setEditing(false);
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n) || n < 0 || Math.round(n) === Math.round(c.budget)) return;
    save.mutate(Math.round(n));
  };
  if (editing) {
    return (
      <input type="number" inputMode="numeric" min={0} step={50} autoFocus defaultValue={Math.round(c.budget) || ""}
        aria-label={label}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(e.currentTarget.value); if (e.key === "Escape") setEditing(false); }}
        className="h-8 w-24 rounded-md border border-primary bg-background px-2 text-end text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-ring" />
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} disabled={save.isPending} aria-label={label}
      className="rounded-md px-1.5 py-0.5 tabular-nums hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60">
      <bdi data-money>{save.isPending ? money(save.variables ?? c.budget) : money(c.budget)}</bdi>
    </button>
  );
}

/**
 * Budget table: groups that open and close, each line with its budget (edited in place), spending,
 * what is left, and a bar marked with how much of the month has passed.
 */
export function BudgetTable({ categories, frame, elapsed = 0 }: { categories: CategoryWithData[]; frame: number; elapsed?: number }) {
  const t = useTranslations("budgetTable");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const [closed, setClosed] = useState<string[]>([]);
  const money = (n: number) => shekels(Math.round(n), locale);
  const name = (c: CategoryWithData) => translateCategoryName(c.categoryName, tCat);
  const parents = categories.filter((c) => c.isParent);
  const loose = categories.filter((c) => !c.isParent && c.parentId == null && (c.budget > 0 || c.spent > 0));
  const groups = [
    ...parents.map((p) => ({ key: String(p.categoryId), title: name(p), color: p.categoryColor, rows: categories.filter((c) => c.parentId === p.categoryId && (c.budget > 0 || c.spent > 0)) })),
    ...(loose.length ? [{ key: "loose", title: t("ungrouped"), color: "#9ca3af", rows: loose }] : []),
  ].filter((g) => g.rows.length > 0);
  const sum = (rows: CategoryWithData[], f: (c: CategoryWithData) => number) => rows.reduce((s, c) => s + f(c), 0);
  const all = groups.flatMap((g) => g.rows);
  const label = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
  const avail = (n: number) => <bdi className={`rounded-md px-1.5 py-0.5 tabular-nums ${n < 0 ? "bg-expense/15 text-expense" : "bg-status-on-track/15 text-status-on-track"}`} data-money>{money(n)}</bdi>;

  if (!all.length) return <p className="rounded-2xl border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  const noLines = sum(all, (c) => c.budget) === 0;
  return (
    <div className="space-y-3">
    {/* Only a monthly frame, no category budgets: say so, instead of a column of zeros with no reason. */}
    {noLines && <p className="rounded-xl border border-[var(--status-heads-up)]/30 bg-[var(--status-heads-up)]/10 px-4 py-3 text-sm">{frame > 0 ? t("onlyFrame", { frame: money(frame) }) : t("noBudgets")}</p>}
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">{t("caption")}</caption>
        <thead>
          <tr>{["line", "assigned", "activity", "available"].map((k, i) => <th key={k} scope="col" className={`px-4 py-3 ${label} ${i ? "w-32 text-end" : "text-start"}`}>{t(`col_${k}`)}</th>)}</tr>
        </thead>
        {groups.map((g) => {
          const isOpen = !closed.includes(g.key);
          return (
          <tbody key={g.key} className="border-t border-border">
            <tr className="bg-muted/40">
              <th scope="rowgroup" className="px-2 py-1.5 text-start">
                <button type="button" aria-expanded={isOpen} onClick={() => setClosed(isOpen ? [...closed, g.key] : closed.filter((k) => k !== g.key))}
                  className={`flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-start ${label} hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring`}>
                  <ChevronDown className={`size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${isOpen ? "" : "-rotate-90 rtl:rotate-90"}`} aria-hidden />
                  <span className="size-2 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden />
                  {g.title}
                  <span className="font-normal normal-case tracking-normal">· {t("lines", { n: g.rows.length })}</span>
                </button>
              </th>
              <td className="px-4 py-1.5 text-end font-semibold tabular-nums" data-money><bdi>{money(sum(g.rows, (c) => c.budget))}</bdi></td>
              <td className="px-4 py-1.5 text-end tabular-nums text-muted-foreground" data-money><bdi>{money(-sum(g.rows, (c) => c.spent))}</bdi></td>
              <td className="px-4 py-1.5 text-end">{avail(sum(g.rows, (c) => c.budget - c.spent))}</td>
            </tr>
            {isOpen && g.rows.map((c) => {
              const pct = c.budget > 0 ? (c.spent / c.budget) * 100 : c.spent > 0 ? 100 : 0;
              const over = c.budget > 0 && c.spent > c.budget;
              // Spending ahead of the month's pace gets the heads-up colour before it is over.
              const ahead = !over && c.budget > 0 && elapsed > 0 && pct > elapsed + 15;
              return (
                <tr key={c.categoryId} className="border-t border-border/50 hover:bg-accent/40">
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/transactions?category=${c.categoryId}`} className="flex min-w-0 items-center gap-2 font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: c.categoryColor }} aria-hidden />
                        <span className="truncate">{name(c)}</span>
                      </Link>
                      <span className={`shrink-0 text-xs ${over ? "text-expense" : ahead ? "text-[var(--status-heads-up)]" : "text-muted-foreground"}`}>
                        {c.budget <= 0 ? t("noBudget") : over ? t("overBy", { amount: money(c.spent - c.budget) }) : pct >= 100 ? <span className="inline-flex items-center gap-1 text-status-on-track"><CheckCircle2 className="size-3.5" aria-hidden />{t("funded")}</span> : t("used", { pct: Math.round(pct) })}
                      </span>
                    </div>
                    <div className="relative mt-1.5 h-1.5 rounded-full bg-muted" aria-hidden>
                      <div className={`h-full rounded-full transition-[width] duration-500 ease-[var(--ease-soft)] motion-reduce:transition-none ${over ? "bg-expense" : ahead ? "bg-[var(--status-heads-up)]" : "bg-status-on-track"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      {c.budget > 0 && elapsed > 0 && elapsed < 100 && <span className="absolute -top-0.5 h-2.5 w-px bg-foreground/50" style={{ insetInlineStart: `${elapsed}%` }} />}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-end"><AssignedCell c={c} money={money} /></td>
                  <td className="px-4 py-2 text-end tabular-nums text-muted-foreground" data-money><bdi>{money(-c.spent)}</bdi></td>
                  <td className="px-4 py-2 text-end">{avail(c.budget - c.spent)}</td>
                </tr>
              );
            })}
          </tbody>
          );
        })}
        <tfoot className="border-t-2 border-border">
          <tr>
            <th scope="row" className="px-4 py-3 text-start font-semibold">{t("total", { n: all.length })}</th>
            <td className="px-4 py-3 text-end font-semibold tabular-nums" data-money><bdi>{money(sum(all, (c) => c.budget))}</bdi></td>
            <td className="px-4 py-3 text-end font-semibold tabular-nums" data-money><bdi>{money(-sum(all, (c) => c.spent))}</bdi></td>
            <td className="px-4 py-3 text-end">{avail(sum(all, (c) => c.budget - c.spent))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    {elapsed > 0 && elapsed < 100 && <p className="px-1 text-xs text-muted-foreground">{t("paceHint", { pct: Math.round(elapsed) })}</p>}
    </div>
  );
}
