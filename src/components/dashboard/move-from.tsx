"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { addBudgetMove, undoBudgetMove } from "@/lib/api";
import { roomToMove, type BudgetMove } from "@/lib/budget-moves";
import { translateCategoryName } from "@/lib/i18n-data";
import { shekels } from "@/lib/money";
import type { CategoryWithData } from "@/lib/types";

/** An over category takes budget, for this month only, from one that still has room. */
export function MoveFrom({ target, card, rows, month, moves }: { target: CategoryWithData; card: CategoryWithData; rows: CategoryWithData[]; month: string; moves: BudgetMove[] }) {
  const t = useTranslations("moveBudget");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const qc = useQueryClient();
  const sources = roomToMove(rows, target.categoryId);
  const [fromId, setFromId] = useState<number | null>(null);
  const over = target.spent - target.budget;
  // A grouped card moves into its most-over subcategory; say which one.
  const into = target.categoryId !== card.categoryId ? target : null;
  const source = sources.find((s) => s.categoryId === fromId) ?? sources[0];
  const amount = source ? Math.ceil(Math.min(over, source.room)) : 0;

  // Budgets read from the summary already include the move, so refresh it with the moves list.
  const refresh = (next: unknown) => {
    qc.setQueryData(["budget-moves", month], next);
    void qc.invalidateQueries({ queryKey: ["summary"] });
    void qc.invalidateQueries({ queryKey: ["budget-period-lines"] });
  };
  const undo = useMutation({ mutationFn: () => undoBudgetMove(month, moves.length), onSuccess: refresh });
  const move = useMutation({
    mutationFn: () => addBudgetMove(month, { from: source!.categoryId, to: target.categoryId, amount }),
    onSuccess: (moves) => {
      refresh(moves);
      toast.success(t("moved", { amount: shekels(amount, locale) }), { action: { label: t("undo"), onClick: () => undo.mutate() } });
    },
    onError: () => toast.error(t("failed")),
  });

  const name = (n: string) => translateCategoryName(n, tCat);
  return (
    <div className="border-t border-border/60 px-5 pb-4 pt-3 text-sm">
      <p className="leading-relaxed text-muted-foreground">
        {into ? t("overChild", { name: name(into.categoryName), amount: shekels(over, locale) }) : t("over", { amount: shekels(over, locale) })} {sources.length ? t("canMoveFrom") : t("noRoom")}
      </p>
      {source && (
        <div className="mt-2 grid gap-2">
          <label className="sr-only" htmlFor={`move-from-${target.categoryId}`}>{t("fromLabel")}</label>
          <select
            id={`move-from-${target.categoryId}`}
            value={source.categoryId}
            onChange={(e) => setFromId(Number(e.target.value))}
            className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {sources.map((s) => (
              <option key={s.categoryId} value={s.categoryId}>
                {t("option", { name: name(s.categoryName), room: shekels(Math.floor(s.room), locale) })}
              </option>
            ))}
          </select>
          <Button disabled={move.isPending || amount <= 0} onClick={() => move.mutate()} className="justify-self-start">
            {t("move", { amount: shekels(amount, locale) })}
          </Button>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("thisMonthOnly")}</p>
    </div>
  );
}

/** Moves this card received this month, each with its own undo. */
export function MovedIn({ card, rows, month, moves }: { card: CategoryWithData; rows: CategoryWithData[]; month: string; moves: BudgetMove[] }) {
  const t = useTranslations("moveBudget");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const qc = useQueryClient();
  const undo = useMutation({
    mutationFn: (index: number) => undoBudgetMove(month, index),
    onSuccess: (m) => {
      qc.setQueryData(["budget-moves", month], m);
      void qc.invalidateQueries({ queryKey: ["summary"] });
      void qc.invalidateQueries({ queryKey: ["budget-period-lines"] });
    },
  });
  const ids = new Set([card.categoryId, ...rows.filter((r) => r.parentId === card.categoryId).map((r) => r.categoryId)]);
  const nameOf = (id: number) => translateCategoryName(rows.find((r) => r.categoryId === id)?.categoryName ?? "", tCat);
  const mine = moves.map((m, index) => ({ ...m, index })).filter((m) => ids.has(m.to));
  if (!mine.length) return null;
  return (
    <ul className="grid gap-1 border-t border-border/60 px-5 pb-4 pt-3 text-xs text-muted-foreground">
      {mine.map((m) => (
        <li key={m.index} className="flex items-center justify-between gap-2">
          <span>{t("movedFrom", { amount: shekels(m.amount, locale), name: nameOf(m.from) })}</span>
          <Button variant="ghost" size="sm" disabled={undo.isPending} onClick={() => undo.mutate(m.index)} className="text-primary">
            {t("undo")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
