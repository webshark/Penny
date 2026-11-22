"use client";

import { Children, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { shekels } from "@/lib/money";
import { Segmented } from "@/components/ui/segmented";
import { translateCategoryName } from "@/lib/i18n-data";
import { ChevronDown, Layers, ListChecks, MoreVertical, Pencil, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { SectionShell } from "@/components/settings/section-shell";
import { CategoryDetailSheet } from "@/components/settings/category-detail-sheet";
import { NewCategoryDialog } from "@/components/settings/new-category-dialog";
import { getMonthRange } from "@/lib/formatters";
import {
  getCategories,
  getSummary,
} from "@/lib/api";
import type { Category, CategoryKind, CategoryWithData } from "@/lib/types";

export default function CategoriesSettingsPage() {
  const t = useTranslations("settings.categories");
  const tc = useTranslations("common");
  const tCat = useTranslations("categoriesSeeded");
  const { from, to } = getMonthRange();
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
  });
  const { data: summary } = useQuery({
    queryKey: ["summary", from, to],
    queryFn: () => getSummary({ from, to }),
  });

  const [search, setSearch] = useState("");
  const [activeKind, setActiveKind] = useState<CategoryKind>("expense");
  const [openId, setOpenId] = useState<number | null>(null);
  // Closed, or open (optionally inside a group, from that group's menu).
  const [creating, setCreating] = useState<false | { group?: number }>(false);

  const dataByCategoryId = useMemo(() => {
    const m = new Map<number, CategoryWithData>();
    summary?.categoriesWithData.forEach((c) => m.set(c.categoryId, c));
    return m;
  }, [summary]);

  const filtered = useMemo(() => {
    if (!categories) return [];
    return categories
      .filter((c) => c.kind === activeKind)
      .filter((c) =>
        search.trim().length === 0
          ? true
          : `${c.name} ${translateCategoryName(c.name, tCat)}`.toLowerCase().includes(search.toLowerCase())
      );
  }, [categories, activeKind, search, tCat]);

  const { parents, childrenByParent, orphans } = useMemo(() => {
    const parentIds = new Set<number>();
    filtered.forEach((c) => {
      if (c.parentId != null) parentIds.add(c.parentId);
    });
    const parents = filtered
      .filter((c) => c.parentId == null && parentIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    const childrenByParent = new Map<number, Category[]>();
    filtered.forEach((c) => {
      if (c.parentId != null) {
        const list = childrenByParent.get(c.parentId) ?? [];
        list.push(c);
        childrenByParent.set(c.parentId, list);
      }
    });
    childrenByParent.forEach((list) =>
      list.sort((a, b) => a.name.localeCompare(b.name))
    );
    const orphans = filtered
      .filter((c) => c.parentId == null && !parentIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { parents, childrenByParent, orphans };
  }, [filtered]);

  return (
    <>
      <SectionShell
        title={t("title")}
        description={t("description")}
        icon={<Layers aria-hidden />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            variant="track"
            label={t("title")}
            value={activeKind}
            onChange={setActiveKind}
            options={[{ value: "expense", label: t("tabExpense") }, { value: "income", label: t("tabIncome") }]}
          />
          <div className="relative flex-1 min-w-[180px]">
            <Search aria-hidden className="pointer-events-none absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="ps-8"
            />
          </div>
          <IconButton label={t("newCategoryButton")} variant="outline" onClick={() => setCreating({})}>
            <Plus aria-hidden className="size-4" />
          </IconButton>
          <NewCategoryDialog key={creating ? (creating.group ?? "new") : "closed"} open={!!creating} onOpenChange={(o) => { if (!o) setCreating(false); }} kind={activeKind} defaultGroup={creating ? creating.group : undefined} />
        </div>

        {!categories ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {tc("loading")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {t("noMatching")}
          </div>
        ) : (
          <section aria-label={t("title")} className="overflow-hidden rounded-2xl border border-border bg-card">
            <p className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">{t("treeCount", { count: filtered.length })}</p>
            {parents.map((parent) => (
              <GroupBlock
                key={parent.id}
                title={translateCategoryName(parent.name, tCat)}
                color={parent.color}
                parent={parent}
                onSelect={setOpenId}
                onAddSub={() => setCreating({ group: parent.id })}
                dataById={dataByCategoryId}
                startOpen={search.trim() !== ""}
              >
                {childrenByParent.get(parent.id)?.map((child) => (
                  <CategoryRow
                    key={child.id}
                    category={child}
                    data={dataByCategoryId.get(child.id) ?? null}
                    onSelect={() => setOpenId(child.id)}
                  />
                ))}
              </GroupBlock>
            ))}
            {orphans.length > 0 ? (
              <GroupBlock
                title={t("ungrouped")}
                color="#9ca3af"
                onSelect={setOpenId}
                dataById={dataByCategoryId}
                startOpen
              >
                {orphans.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    data={dataByCategoryId.get(cat.id) ?? null}
                    onSelect={() => setOpenId(cat.id)}
                  />
                ))}
              </GroupBlock>
            ) : null}
          </section>
        )}
      </SectionShell>

      <CategoryDetailSheet
        categoryId={openId}
        data={openId != null ? (dataByCategoryId.get(openId) ?? null) : null}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

/** Edit, and see the transactions: the same two things a row click and a link would do, in one place. */
function RowMenu({ id, name, onEdit, onAddSub }: { id: number; name: string; onEdit: () => void; onAddSub?: () => void }) {
  const t = useTranslations("settings.categories");
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t("rowMenu", { name })} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <MoreVertical className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}><Pencil className="size-4" aria-hidden />{t("menuEdit")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push(`/transactions?category=${id}`)}><ListChecks className="size-4" aria-hidden />{t("menuTransactions")}</DropdownMenuItem>
        {onAddSub && <DropdownMenuItem onClick={onAddSub}><Plus className="size-4" aria-hidden />{t("menuAddSub")}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One group in the tree: a row that opens and closes its subcategories, with the group's spending this month. */
function GroupBlock({
  title,
  color,
  parent,
  children,
  onSelect,
  onAddSub,
  dataById,
  startOpen = false,
}: {
  title: string;
  color: string;
  parent?: Category;
  dataById: Map<number, CategoryWithData>;
  children: React.ReactNode;
  onSelect: (id: number) => void;
  onAddSub?: () => void;
  startOpen?: boolean;
}) {
  const tp = useTranslations("categoryPicker");
  const t = useTranslations("settings.categories");
  const locale = useLocale();
  const [open, setOpen] = useState(startOpen);
  // Searching opens every group with a match; clearing the search keeps whatever the person opened.
  const [lastStart, setLastStart] = useState(startOpen);
  if (startOpen !== lastStart) {
    setLastStart(startOpen);
    if (startOpen) setOpen(true);
  }
  const listId = useId();
  const kids = Children.toArray(children) as React.ReactElement<{ category: Category }>[];
  const spent = kids.reduce((sum, k) => sum + (dataById.get(k.props.category.id)?.spent ?? 0), 0);
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex min-h-12 items-center gap-1 pe-2 ps-1 hover:bg-muted/40">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={t(open ? "collapseGroup" : "expandGroup", { name: title })}
          onClick={() => setOpen((o) => !o)}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronDown aria-hidden className={`size-4 transition-transform motion-reduce:transition-none ${open ? "" : "-rotate-90 rtl:rotate-90"}`} />
        </button>
        <button
          type="button"
          onClick={() => (parent ? onSelect(parent.id) : setOpen((o) => !o))}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 text-start focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="size-3 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
          <span title={title} className="truncate text-sm font-semibold">{title}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{tp("subcount", { count: kids.length })}</span>
        </button>
        {spent > 0 && <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline" data-money>{t("spentLabel", { amount: shekels(Math.round(spent), locale) })}</span>}
        {parent && <RowMenu id={parent.id} name={title} onEdit={() => onSelect(parent.id)} onAddSub={onAddSub} />}
      </div>
      <div className="reveal" data-open={open} inert={!open}><div><ul id={listId} className="pb-1">{children}</ul></div></div>
    </div>
  );
}

/** A subcategory: indented under its group, its colour dot, this month's spending and its budget. */
function CategoryRow({
  category,
  data,
  onSelect,
}: {
  category: Category;
  data: CategoryWithData | null;
  onSelect: () => void;
}) {
  const t = useTranslations("settings.categories");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  const name = translateCategoryName(category.name, tCat);
  return (
    <li className="flex min-h-11 items-center gap-1 pe-2 ps-11 hover:bg-muted/40">
      <button type="button" onClick={onSelect} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 text-start focus-visible:outline-2 focus-visible:outline-ring">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: category.color }} aria-hidden />
        <span className="truncate text-sm" title={name}>{name}</span>
      </button>
      {data && data.spent > 0 && <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline" data-money>{t("spentLabel", { amount: shekels(Math.round(data.spent), locale) })}</span>}
      <BudgetChip category={category} data={data} />
      <RowMenu id={category.id} name={name} onEdit={onSelect} />
    </li>
  );
}

function BudgetChip({
  category,
  data,
}: {
  category: Category;
  data: CategoryWithData | null;
}) {
  const locale = useLocale();
  const t = useTranslations("settings.categories");
  if (category.budgetMode === "tracking") {
    return <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t("tracking")}</span>;
  }
  if (!data || data.budget <= 0) return null;
  return (
    <span className="shrink-0 rounded-full bg-foreground/8 px-2 py-0.5 text-xs font-medium tabular-nums" title={t("budgetChip")}>
      {shekels(Math.round(data.budget), locale)}
    </span>
  );
}
