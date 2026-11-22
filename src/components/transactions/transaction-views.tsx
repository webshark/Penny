"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bookmark, BookmarkPlus, X } from "lucide-react";
import { loadPreference, storePreference } from "@/lib/preference-sync";
import type { TransactionKindFilter } from "@/lib/api";

/** A saved set of filters; the month is left out so a view works on whichever month is open. */
export interface TransactionView { id: string; name: string; search: string; categoryIds: number[]; tag: string | null; kind: TransactionKindFilter; review: boolean }
type Filters = Omit<TransactionView, "id" | "name">;

const KINDS: TransactionKindFilter[] = ["all", "income", "expense"];
function parseViews(raw: unknown): TransactionView[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is TransactionView => !!v && typeof v.id === "string" && typeof v.name === "string" && typeof v.search === "string"
    && Array.isArray(v.categoryIds) && v.categoryIds.every((n: unknown) => Number.isInteger(n)) && (v.tag === null || typeof v.tag === "string")
    && KINDS.includes(v.kind) && typeof v.review === "boolean").slice(0, 20);
}

/** "Views": save the current filters under a name and bring them back with one click. Saved per profile. */
export function TransactionViews({ current, onApply }: { current: Filters; onApply: (f: Filters) => void }) {
  const t = useTranslations("transactionViews");
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["preference", "transaction-views"], queryFn: () => loadPreference("transaction-views") });
  const views = parseViews(q.data);
  const [naming, setNaming] = useState<string | null>(null);
  const hasFilters = !!current.search || current.categoryIds.length > 0 || !!current.tag || current.kind !== "all" || current.review;
  const same = (v: TransactionView) => v.search === current.search && v.tag === current.tag && v.kind === current.kind && v.review === current.review
    && v.categoryIds.length === current.categoryIds.length && v.categoryIds.every((id) => current.categoryIds.includes(id));

  function save(next: TransactionView[]) {
    qc.setQueryData(["preference", "transaction-views"], next);
    void storePreference("transaction-views", next).catch(() => toast.error(t("saveFailed")));
  }

  if (!views.length && !hasFilters) return null;
  return (
    <div role="group" aria-label={t("label")} className="flex flex-wrap items-center gap-2">
      <Bookmark className="size-4 text-muted-foreground" aria-hidden />
      {views.map((v) => (
        <span key={v.id} className={`inline-flex items-center rounded-full border text-sm ${same(v) ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
          <button type="button" aria-pressed={same(v)} onClick={() => onApply(v)} className="min-h-9 rounded-full ps-3 pe-1.5 focus-visible:outline-2 focus-visible:outline-ring">{v.name}</button>
          <button type="button" aria-label={t("remove", { name: v.name })} onClick={() => save(views.filter((x) => x.id !== v.id))} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-3.5" aria-hidden /></button>
        </span>
      ))}
      {naming !== null ? (
        <form className="inline-flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); const name = naming.trim(); if (!name) return; save([...views, { id: crypto.randomUUID(), name, ...current }]); setNaming(null); toast.success(t("saved")); }}>
          <input autoFocus required maxLength={30} aria-label={t("nameLabel")} placeholder={t("namePlaceholder")} value={naming} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setNaming(null)}
            className="h-9 w-40 rounded-full border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
          <button type="submit" className="min-h-9 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring">{t("save")}</button>
        </form>
      ) : hasFilters && !views.some(same) && (
        <button type="button" onClick={() => setNaming("")} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><BookmarkPlus className="size-4" aria-hidden />{t("saveCurrent")}</button>
      )}
    </div>
  );
}
