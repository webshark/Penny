"use client";

import { foreignAmount } from "@/lib/foreign-amount";
import { MerchantMark } from "@/components/transactions/merchant-mark";
import { Forward, Back } from "@/components/ui/dir-chevron";
import { useId, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { SplitEditor } from "@/components/transactions/split-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryChip } from "@/components/transactions/category-chip";
import { IconButton } from "@/components/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewCategoryDialog } from "@/components/settings/new-category-dialog";
import { CategoryPicker, CategoryBrowserHeader, CategorySectionList, categoryListKeyDown, useCategoryBrowser } from "@/components/dashboard/category-picker";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MoreHorizontal,
  HelpCircle,
  Check,
  Wallet,
  Tags,
  EyeOff,
  Eye,
  X,
  Plus,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { signedShekels } from "@/lib/money";
import { groupByWeek, localToday, weekRelation } from "@/lib/weeks";
import { InfoTip } from "@/components/ui/info-tip";
import {
  editTransactions,
  setTransactionKind,
  approveTransactionCategory,
  getCategories,
  setTransactionExcluded,
  setTransactionOwner,
  setTransactionTags,
} from "@/lib/api";
import { normalizeTag } from "@/lib/tags";
import { toast } from "sonner";
import { translateCategoryName, translateProviderName } from "@/lib/i18n-data";
import {
  getAccountDisplayLabel,
  TransactionSourceCell,
} from "@/components/transactions/transaction-source-cell";
import {
  TransactionMultiFilter,
  MultiFilterOption,
} from "@/components/transactions/transaction-multi-filter";
import {
  formatMultiFilterDisplay,
  getCategoryDescendantIds,
  isCategoryFilterChecked,
  toggleCategoryFilterSelection,
} from "@/lib/transaction-filters";
import { SortableTableHead } from "@/components/transactions/sortable-table-head";
import type { SortOrder, TransactionSortField } from "@/lib/transaction-sort";
import { cn } from "@/lib/utils";
import { ProviderBadge } from "@/components/setup/provider-badge";
import type {
  TransactionWithCategory,
  Category,
  Integration,
} from "@/lib/types";
import { BANK_PROVIDERS } from "@/lib/types";
import type { Locale } from "@/i18n/routing";
import type { HouseholdMember } from "@/lib/household";
import type { AccountOwners } from "@/lib/tags";
import { TagChips } from "@/components/transactions/tag-chips";
import { OwnerPicker } from "@/components/transactions/owner-picker";
import { deleteWithUndo, isManualTxn } from "@/components/transactions/transaction-sheet";
import { updateTransactionFields } from "@/lib/api";

type Kind = "expense" | "income" | "transfer";

interface TransactionsTableProps {
  transactions: TransactionWithCategory[];
  total: number;
  categories: Category[];
  integrations: Integration[];
  loading: boolean;
  search: string;
  onSearchChange: (search: string) => void;
  categoryFilter: number[];
  onCategoryFilterChange: (categoryIds: number[]) => void;
  accountFilter: number[];
  onAccountFilterChange: (credentialIds: number[]) => void;
  page: number;
  onPageChange: (page: number) => void;
  sortField: TransactionSortField;
  sortOrder: SortOrder;
  onSortChange: (field: TransactionSortField) => void;
  isFetching?: boolean;
  /** Tags and owners; optional so other callers keep working. */
  allTags?: string[];
  onTagClick?: (tag: string) => void;
  members?: HouseholdMember[];
  accountOwners?: AccountOwners;
  /** Opens the edit sheet for a row (row tap, description, or the row menu). */
  onEdit?: (txn: TransactionWithCategory) => void;
  /** Shows a "+" (add transaction) button after the category filter, desktop only. */
  onAdd?: () => void;
  /** Leads the filter bar (the income/expense switch), so the list's filters read as one group. */
  kindFilter?: ReactNode;
  /** More of the page's filters (people, trash, saved views), after the category filter in the same bar. */
  toolbarExtra?: ReactNode;
}

const PAGE_SIZE = 50;

export function TransactionsTable({
  transactions,
  total,
  categories,
  integrations,
  loading,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  accountFilter,
  onAccountFilterChange,
  page,
  onPageChange,
  sortField,
  sortOrder,
  onSortChange,
  isFetching = false,
  allTags = [],
  onTagClick,
  members = [],
  accountOwners = {},
  onEdit,
  onAdd,
  kindFilter,
  toolbarExtra,
}: TransactionsTableProps) {
  const catBrowser = useCategoryBrowser(categories);
  const catListId = useId();
  const tManual = useTranslations("manualTxn");
  const tTags = useTranslations("tags");
  const t = useTranslations("transactions");
  const tCat = useTranslations("categoriesSeeded");
  const tBanks = useTranslations("banks");
  const tSettingsCat = useTranslations("settings.categories");
  const [newCatFor, setNewCatFor] = useState<{ txnId: number; kind: "expense" | "income" } | null>(null);
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [remember, setRemember] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [editing, setEditing] = useState(false);
  const [split, setSplit] = useState<TransactionWithCategory | null>(null);
  const [undoToken, setUndoToken] = useState<string | null>(null);
  const he = locale === "he";
  const selectionKey = transactions.map(t => t.id).join(",");
  const [prevSelectionKey, setPrevSelectionKey] = useState(selectionKey);
  if (selectionKey !== prevSelectionKey) { setPrevSelectionKey(selectionKey); setSelected([]); }
  const selectedRows = transactions.filter(t => selected.includes(t.id));
  const selectedKind = selectedRows[0]?.kind;
  const bulkCategories = categories.filter(c => c.kind === selectedKind && selectedRows.every(r => r.kind === c.kind) && !categories.some(child => child.parentId === c.id));
  async function edit(input: Parameters<typeof editTransactions>[0]) {
    setEditing(true);
    try {
      const result = await editTransactions(input);
      setUndoToken(result.undoToken);
      setSelected([]);
      await queryClient.invalidateQueries();
      toast.success(t("changesSaved"));
    } catch (error) { toast.error(he ? t("saveFailedHe") : error instanceof Error ? error.message : "Could not save"); throw error; }
    finally { setEditing(false); }
  }
  const selectedManual = selectedRows.filter(isManualTxn).map(r => r.id);
  async function bulk(run: () => Promise<unknown>) {
    setEditing(true);
    try { await run(); setSelected([]); }
    catch (error) { toast.error(error instanceof Error ? error.message : tManual("failed")); await queryClient.invalidateQueries(); }
    finally { setEditing(false); }
  }
  const bulkExclude = () => bulk(async () => {
    await Promise.all(selected.map(id => updateTransactionFields(id, { excluded: true })));
    await queryClient.invalidateQueries();
    toast.success(tManual("bulkExcluded", { count: selected.length }));
  });
  // Batch edit: tag or assign many rows at once.
  const [bulkTag, setBulkTag] = useState("");
  const bulkAddTag = () => bulk(async () => {
    const tag = normalizeTag(bulkTag);
    if (!tag) return;
    await Promise.all(selectedRows.map(r => setTransactionTags(r.id, [...new Set([...(r.tags ?? []), tag])])));
    setBulkTag("");
    await queryClient.invalidateQueries();
    toast.success(tManual("bulkTagged", { count: selectedRows.length, tag }));
  });
  const bulkOwner = (owner: string | null) => bulk(async () => {
    await Promise.all(selected.map(id => setTransactionOwner(id, owner)));
    await queryClient.invalidateQueries();
    toast.success(tManual("bulkOwned", { count: selected.length }));
  });
  const bulkDelete = () => bulk(() => deleteWithUndo(selectedManual, tManual, () => void queryClient.invalidateQueries()));
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const otherKinds: Record<Kind, Array<{ value: Kind; label: string }>> = {
    expense: [
      { value: "income", label: t("markAsIncome") },
      { value: "transfer", label: t("markAsTransfer") },
    ],
    income: [
      { value: "expense", label: t("markAsExpense") },
      { value: "transfer", label: t("markAsTransfer") },
    ],
    transfer: [
      { value: "expense", label: t("markAsExpense") },
      { value: "income", label: t("markAsIncome") },
    ],
  };

  const handleCategoryChange = async (txnId: number, categoryId: number) => {
    setUpdatingId(txnId);
    try {
      await edit({ ids: [txnId], categoryId, remember });
    } catch { /* edit reports the error */ }
    finally {
      setUpdatingId(null);
    }
  };

  const handleKindChange = async (txnId: number, next: Kind) => {
    setUpdatingId(txnId);
    try {
      await setTransactionKind(txnId, next);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleApprove = async (txnId: number) => {
    setUpdatingId(txnId);
    try {
      await approveTransactionCategory(txnId);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOwnerChange = async (txnId: number, owner: string | null) => {
    try {
      await setTransactionOwner(txnId, owner);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["owners"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const invalidateAfterExclude = () => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
    queryClient.invalidateQueries({ queryKey: ["home"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["excluded-merchants"] });
  };

  const handleExcludeToggle = async (
    txn: TransactionWithCategory,
    alwaysForMerchant = false,
  ) => {
    const nextExcluded = !txn.isExcluded;
    setUpdatingId(txn.id);
    try {
      await setTransactionExcluded(txn.id, nextExcluded, alwaysForMerchant);
      invalidateAfterExclude();
      if (nextExcluded) {
        toast.success(
          alwaysForMerchant
            ? t("excludeMerchantToast", { merchant: txn.description })
            : t("excludeToast"),
        );
      } else {
        toast.success(t("includeToast"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdatingId(null);
    }
  };

  const incomeCategoriesQuery = useQuery({
    queryKey: ["categories", "income"],
    queryFn: () => getCategories("income"),
  });
  const expenseCategoriesQuery = useQuery({
    queryKey: ["categories", "expense"],
    queryFn: () => getCategories("expense"),
  });

  const categoriesForKind = (rowKind: Kind): Category[] => {
    if (rowKind === "income") return incomeCategoriesQuery.data ?? [];
    if (rowKind === "expense") return expenseCategoriesQuery.data ?? [];
    return [];
  };

  const accountOptions = integrations
    .map((integration) => {
      const info = BANK_PROVIDERS.find((b) => b.id === integration.provider);
      const providerName = translateProviderName(
        integration.provider,
        info?.name ?? integration.provider,
        tBanks
      );
      const { primary } = getAccountDisplayLabel(
        providerName,
        integration.label
      );
      return { integration, info, providerName, primary };
    })
    .sort((a, b) => a.primary.localeCompare(b.primary));

  const showAccountFilter = accountOptions.length > 1;

  const toggleFilterId = (ids: number[], id: number): number[] =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

  const accountLabels = accountFilter
    .map(
      (id) =>
        accountOptions.find((o) => o.integration.id === id)?.primary
    )
    .filter((name): name is string => name != null);

  const accountDisplayValue = formatMultiFilterDisplay(
    accountLabels,
    t("filterAny"),
    (count) => t("filterSelectedCount", { count })
  );

  const categoryLabels = categoryFilter
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => c != null)
    .map((c) => translateCategoryName(c.name, tCat));

  const categoryDisplayValue = formatMultiFilterDisplay(
    categoryLabels,
    t("filterAny"),
    (count) => t("filterSelectedCount", { count })
  );

  const hasActiveFilters =
    categoryFilter.length > 0 || accountFilter.length > 0;

  const bcp = he ? "he-IL" : "en-IL";
  const dayFmt = new Intl.DateTimeFormat(bcp, { weekday: "short", timeZone: "UTC" });
  const rangeFmt = new Intl.DateTimeFormat(bcp, { day: "numeric", month: "short", timeZone: "UTC" });
  const utc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  // "יום ו׳ 14.11": the week header carries the rest of the date.
  const dayLabel = (iso: string) => `${dayFmt.format(utc(iso))} ${+iso.slice(8, 10)}.${+iso.slice(5, 7)}`;
  const today = localToday();
  // Weeks only make sense in date order; other sorts show one flat list.
  // shortcut: week totals cover the rows on this page (50), so a week split across pages shows partial totals; sum server-side if that bites.
  const weeks = sortField === "date" ? groupByWeek(transactions) : [{ start: "", end: "", items: transactions }];
  const weekLabel = (start: string, end: string) => {
    const range = rangeFmt.formatRange(utc(start), utc(end));
    const rel = weekRelation(start, today);
    return rel ? `${t(rel === "this" ? "weekThis" : "weekLast")} · ${range}` : range;
  };

  const handleClearFilters = () => {
    onCategoryFilterChange([]);
    onAccountFilterChange([]);
    onPageChange(0);
  };

  const allCategoryIds = [
    ...new Set(
      categories.flatMap((c) => getCategoryDescendantIds(c.id, categories))
    ),
  ];
  const allAccountIds = accountOptions.map((o) => o.integration.id);

  const catOption = (cat: Category, indented: boolean, isGroup = false) => (
    <MultiFilterOption
      key={cat.id}
      selected={isCategoryFilterChecked(cat.id, categoryFilter, categories)}
      onToggle={() => onCategoryFilterChange(toggleCategoryFilterSelection(categoryFilter, cat.id, categories))}
      className={indented ? "ps-5" : undefined}
    >
      <div className={cn("flex min-w-0 items-center gap-2", isGroup && "font-semibold")}>
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
        <span className="truncate" title={catBrowser.label(cat)}>{catBrowser.label(cat)}</span>
      </div>
    </MultiFilterOption>
  );

  return (
    // overflow-clip (not hidden) so the sticky week headers can stick to the page.
    <Card className="overflow-clip rounded-2xl bg-card shadow-none">
      <NewCategoryDialog
        open={newCatFor !== null}
        onOpenChange={(o) => !o && setNewCatFor(null)}
        kind={newCatFor?.kind ?? "expense"}
        onCreated={(cat) => newCatFor && void handleCategoryChange(newCatFor.txnId, cat.id)}
      />
      <CardHeader>
        <CardTitle className="sr-only">{t("pageTitle")}</CardTitle>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {kindFilter}
          <div className="flex min-w-0 flex-wrap items-center gap-2 max-sm:w-full">
            <Input
              placeholder={t("search")}
              aria-label={t("search")}
              value={search}
              onChange={(e) => {
                onSearchChange(e.target.value);
                onPageChange(0);
              }}
              className="h-8 w-[200px] max-w-full max-sm:w-full"
            />
            {showAccountFilter ? (
              <TransactionMultiFilter
                label={t("filterAccount")}
                icon={Wallet}
                displayValue={accountDisplayValue}
                triggerClassName="w-[200px]"
                selectAllLabel={t("filterSelectAll")}
                clearLabel={t("filterClearSelection")}
                onSelectAll={() => onAccountFilterChange(allAccountIds)}
                onClear={() => onAccountFilterChange([])}
              >
                {accountOptions.map(({ integration, info, primary }) => (
                  <MultiFilterOption
                    key={integration.id}
                    selected={accountFilter.includes(integration.id)}
                    onToggle={() =>
                      onAccountFilterChange(
                        toggleFilterId(accountFilter, integration.id)
                      )
                    }
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {info ? (
                        <ProviderBadge
                          color={info.color}
                          name={primary}
                          domain={info.domain}
                          size={16}
                          radius={5}
                        />
                      ) : null}
                      <span className="truncate" title={primary}>{primary}</span>
                    </div>
                  </MultiFilterOption>
                ))}
              </TransactionMultiFilter>
            ) : null}
            <TransactionMultiFilter
              label={t("filterCategory")}
              icon={Tags}
              displayValue={categoryDisplayValue}
              selectAllLabel={t("filterSelectAll")}
              clearLabel={t("filterClearSelection")}
              onSelectAll={() => onCategoryFilterChange(allCategoryIds)}
              onClear={() => onCategoryFilterChange([])}
              header={<CategoryBrowserHeader browser={catBrowser} listId={catListId} />}
              onOpenChange={catBrowser.onOpenChange}
              onListKeyDown={categoryListKeyDown}
            >
              <CategorySectionList
                browser={catBrowser}
                listId={catListId}
                renderItem={(c, indented) => catOption(c, indented)}
                renderTitle={(sec) => {
                  const parent = categories.find((c) => c.id === sec.parentId);
                  return parent ? catOption(parent, false, true) : null;
                }}
              />
            </TransactionMultiFilter>
            {toolbarExtra}
            {onAdd ? (
              <IconButton label={tManual("addTitle")} type="button" variant="outline" size="icon-sm" className="hidden shrink-0 md:inline-flex" onClick={onAdd}>
                <Plus className="size-4" aria-hidden />
              </IconButton>
            ) : null}
            {hasActiveFilters ? (
              <IconButton
                label={t("filterClear")}
                type="button"
                size="icon-sm"
                className="shrink-0 text-muted-foreground"
                onClick={handleClearFilters}
              >
                <X className="size-4" aria-hidden />
              </IconButton>
            ) : null}
            {(hasActiveFilters || search.trim().length > 0) && <InfoTip text={t("filterScopedToList")} />}
          </div>
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          "max-lg:px-3",
          isFetching &&
            !loading &&
            "opacity-60 transition-opacity duration-200"
        )}
      >
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {search || categoryFilter.length > 0 || accountFilter.length > 0
              ? t("emptyWithFilters")
              : t("emptyNoData")}
          </div>
        ) : (
          <>
            {/* Bulk tools appear only once something is selected (or there is an edit to undo). */}
            {(selected.length > 0 || undoToken) && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 p-3">
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />{t("rememberCategoryForFuture")}</label>
              {undoToken && <Button variant="outline" disabled={editing} onClick={() => void edit({ undo: undoToken }).catch(() => {})}>{t("undoLastEdit")}</Button>}
              {selected.length > 0 && <><span className="text-sm">{selected.length} {t("selected")}</span><select aria-label={t("categoryForSelectedTransactions")} className="min-h-11 rounded-lg border bg-background px-2" value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}><option value="">{t("chooseCategory")}</option>{bulkCategories.map(c => <option key={c.id} value={c.id}>{translateCategoryName(c.name, tCat)}</option>)}</select><Button disabled={editing || isFetching || !bulkCategories.some(c => c.id === Number(bulkCategory))} onClick={() => void edit({ ids: selected, categoryId: Number(bulkCategory), remember }).catch(() => {})}>{t("categorizeSelected")}</Button><Button variant="outline" className="min-h-11" disabled={editing} onClick={() => void bulkExclude()}><EyeOff className="size-4" aria-hidden />{tManual("bulkExclude")}</Button><form className="flex items-center gap-1.5" onSubmit={e => { e.preventDefault(); void bulkAddTag(); }}><input aria-label={tManual("bulkTagLabel")} placeholder={tManual("bulkTagLabel")} maxLength={40} value={bulkTag} onChange={e => setBulkTag(e.target.value)} className="min-h-11 w-32 rounded-lg border bg-background px-2 text-sm" /><Button type="submit" variant="outline" className="min-h-11" disabled={editing || !normalizeTag(bulkTag)}>{tManual("bulkTag")}</Button></form>{members.length >= 2 && <OwnerPicker label={tManual("bulkOwnerLabel")} value={null} members={members} onChange={owner => void bulkOwner(owner)} />}{selectedManual.length > 0 && <Button variant="outline" className="min-h-11 text-destructive" disabled={editing} onClick={() => void bulkDelete()}>{tManual("bulkDelete")} ({selectedManual.length})</Button>}<Button variant="ghost" onClick={() => setSelected([])}>{t("filterClearSelection")}</Button>{!bulkCategories.length && <p className="text-xs">{t("selectOnlyExpensesOr")}</p>}</>}
            </div>}
            {/* How many rows the current filters match, before the table. */}
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground" aria-live="polite"><bdi className="font-semibold tabular-nums text-foreground">{total.toLocaleString()}</bdi> {t("countChip")}</p>
            {split && <SplitEditor key={split.id} transaction={split} categories={categories} close={() => setSplit(null)} save={parts => edit({ ids: [split.id], splits: parts })} />}
            {/* First and last columns keep a card-edge gutter, so text never sits on the card's edge while the table scrolls. */}
            {/* Clip instead of scroll: a scrolling box would stop the week headers from sticking. Columns hide below lg so rows fit. */}
            <div className="[&>[data-slot=table-container]]:overflow-x-clip">
            <Table className="lg:[&_td:first-child]:ps-4 lg:[&_th:first-child]:ps-4 lg:[&_td:last-child]:pe-4 lg:[&_th:last-child]:pe-4">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9 lg:w-[52px]"><label className="inline-grid size-9 cursor-pointer place-items-center"><input className="size-4" type="checkbox" aria-label={t("selectThisPage")} disabled={editing || isFetching} checked={transactions.length > 0 && selected.length === transactions.length} onChange={e => setSelected(e.target.checked ? transactions.map(t => t.id) : [])} /></label></TableHead>
                  <SortableTableHead
                    label={t("headerDate")}
                    field="date"
                    activeField={sortField}
                    activeOrder={sortOrder}
                    onSort={onSortChange}
                    className="hidden w-[96px] lg:table-cell"
                    sortAscLabel={t("sortAsc")}
                    sortDescLabel={t("sortDesc")}
                  />
                  <SortableTableHead
                    label={t("headerDescription")}
                    field="description"
                    activeField={sortField}
                    activeOrder={sortOrder}
                    onSort={onSortChange}
                    sortAscLabel={t("sortAsc")}
                    sortDescLabel={t("sortDesc")}
                  />
                  <SortableTableHead
                    label={t("headerCategory")}
                    field="category_name"
                    activeField={sortField}
                    activeOrder={sortOrder}
                    onSort={onSortChange}
                    className="hidden w-[150px] lg:table-cell"
                    sortAscLabel={t("sortAsc")}
                    sortDescLabel={t("sortDesc")}
                  />
                  <SortableTableHead
                    label={t("headerAccount")}
                    field="account"
                    activeField={sortField}
                    activeOrder={sortOrder}
                    onSort={onSortChange}
                    className="hidden w-[130px] xl:table-cell"
                    sortAscLabel={t("sortAsc")}
                    sortDescLabel={t("sortDesc")}
                  />
                  <TableHead className="hidden w-[200px] xl:table-cell">{t("headerTags")}</TableHead>
                  <SortableTableHead
                    label={t("headerAmount")}
                    field="charged_amount"
                    activeField={sortField}
                    activeOrder={sortOrder}
                    onSort={onSortChange}
                    className="hidden lg:table-cell lg:w-[120px]"
                    align="end"
                    sortAscLabel={t("sortAsc")}
                    sortDescLabel={t("sortDesc")}
                  />
                  <TableHead className="w-9 lg:w-[48px]" />
                </TableRow>
              </TableHeader>
              {weeks.map((week) => {
                const live = week.items.filter((x) => !x.isExcluded);
                const weekIn = live.filter((x) => x.kind === "income").reduce((s, x) => s + x.chargedAmount, 0);
                const weekOut = -live.filter((x) => x.kind === "expense").reduce((s, x) => s + x.chargedAmount, 0);
                return (
              <TableBody key={week.start || "all"}>
                {week.start && (
                  <tr>
                    <th colSpan={8} scope="colgroup" className="sticky top-[var(--app-header-h,0px)] z-10 bg-popover px-4 pb-1.5 pt-4 text-start text-xs font-semibold text-muted-foreground">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                        <span>{weekLabel(week.start, week.end)}</span>
                        <span className="flex gap-3 font-medium tabular-nums">
                          {weekIn !== 0 && <span className="text-status-on-track">{signedShekels(weekIn, locale)}</span>}
                          {weekOut !== 0 && <span className="text-expense">{signedShekels(-weekOut, locale)}</span>}
                        </span>
                      </div>
                    </th>
                  </tr>
                )}
                {week.items.map((txn) => {
                  const isIncome = txn.chargedAmount > 0;
                  // Income green with "+", expense a calm rose with "−" (same as the week totals), transfers muted.
                  const amountTone = txn.kind === "income" ? "text-status-on-track" : txn.kind === "transfer" ? "text-muted-foreground" : "text-expense";
                  const amount = signedShekels(txn.chargedAmount, locale, 2);
                  // A foreign charge also shows what it was in its own currency.
                  const foreign = foreignAmount(txn.originalAmount, txn.originalCurrency, locale);
                  const categoryKind: Kind = isIncome ? "income" : "expense";
                  const categoryName = txn.categoryName
                    ? translateCategoryName(txn.categoryName, tCat)
                    : t("rowUncategorized");
                  const isSelected = selected.includes(txn.id);
                  const categoryControl = (
                        <div className="flex min-w-0 items-center gap-1.5">
                          <CategoryPicker
                            categories={categoriesForKind(categoryKind)}
                            currentId={txn.categoryId}
                            disabled={updatingId === txn.id || editing || isFetching}
                            onSelect={(id) => handleCategoryChange(txn.id, id)}
                            onCreate={() => setNewCatFor({ txnId: txn.id, kind: isIncome ? "income" : "expense" })}
                            createLabel={tSettingsCat("newCategoryButton")}
                            trigger={
                              <CategoryChip color={txn.allocations?.length ? null : txn.categoryColor}
                                className="cursor-pointer transition-shadow hover:ring-1 hover:ring-current/40">
                                {txn.allocations?.length ? t("splitCount", { count: txn.allocations.length }) : categoryName}
                              </CategoryChip>
                            }
                          />
                          {txn.needsReview && (
                            <IconButton
                              label={t("rowApprove")}
                              size="icon-xs"
                              variant="outline"
                              onClick={() => handleApprove(txn.id)}
                              disabled={updatingId === txn.id || editing || isFetching}
                              style={{
                                borderColor:
                                  "color-mix(in oklch, var(--status-on-track) 35%, transparent)",
                                color: "var(--status-on-track)",
                              }}
                            >
                              <Check className="size-3" aria-hidden />
                            </IconButton>
                          )}
                        </div>
                  );
                  return (
                    <TableRow
                      key={txn.id}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn(
                        "group/row transition-colors duration-200 hover:bg-muted/50",
                        onEdit && "cursor-pointer",
                        txn.isExcluded && "opacity-50",
                      )}
                      // Row tap edits; taps on the row's own controls (checkbox, pickers, menu, tags) keep their job.
                      onClick={onEdit ? (e) => { if (!(e.target as HTMLElement).closest("button,input,select,a,label,[role=button],[role=menu],[role=menuitem],[role=dialog],[role=listbox]")) onEdit(txn); } : undefined}
                    >
                      <TableCell className="max-lg:pt-3.5 max-lg:align-top">
                        {/* A 36px tap area around the 16px box. */}
                        <label className="inline-grid size-9 cursor-pointer place-items-center lg:size-7"><input className="size-4" type="checkbox" aria-label={t("selectRow", { name: txn.description })} disabled={editing || isFetching} checked={isSelected} onChange={e => setSelected(e.target.checked ? [...selected, txn.id] : selected.filter(id => id !== txn.id))} /></label>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground lg:table-cell">
                        {dayLabel(txn.date)}
                      </TableCell>
                      <TableCell className="min-w-[11rem] whitespace-normal [overflow-wrap:anywhere]">
                        {/* Below lg the amount rides on the name line (iOS list style) instead of its own column, so nothing clips at 320px. */}
                        <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                        <MerchantMark name={txn.description} />
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          {onEdit ? (
                            <button type="button" className="min-h-11 text-start font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring lg:min-h-0" aria-label={tManual("editRow", { name: txn.description })} onClick={() => onEdit(txn)}>{txn.description}</button>
                          ) : <div className="font-medium">{txn.description}</div>}
                          {isManualTxn(txn) && <Badge variant="outline" className="text-xs font-normal">{tManual("manualBadge")}</Badge>}
                          {txn.needsReview && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium"
                              style={{
                                backgroundColor:
                                  "color-mix(in oklch, var(--status-heads-up) 18%, transparent)",
                                color: "var(--status-heads-up)",
                              }}
                              title={
                                txn.aiConfidence != null
                                  ? t("rowReviewTooltipConfidence", { score: txn.aiConfidence })
                                  : t("rowReviewTooltipUnsure")
                              }
                            >
                              <HelpCircle className="h-3 w-3" />
                              {t("rowReview")}
                              {txn.aiConfidence != null && (
                                <span className="ms-0.5 tabular-nums">
                                  {txn.aiConfidence}/7
                                </span>
                              )}
                            </span>
                          )}
                          {onTagClick && (
                            <span className="contents xl:hidden">{/* From xl tags get their own column. */}
                            {/* "Add tag" shows on row hover or keyboard focus; on touch and below lg only for a selected row (the edit sheet has tags too), so it never widens a phone row. */}
                            <TagChips id={txn.id} tags={txn.tags ?? []} allTags={allTags} onFilter={onTagClick} className="mt-0"
                              addClassName="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 max-lg:hidden [@media(hover:none)]:hidden max-lg:group-data-[state=selected]/row:inline-flex [@media(hover:none)]:group-data-[state=selected]/row:inline-flex" />
                            </span>
                          )}
                        </div>
                        </div>
                        <span className={cn("shrink-0 whitespace-nowrap font-medium leading-[2.75rem] tabular-nums lg:hidden", amountTone)}>{amount}{foreign && <bdi className="ms-1 text-xs font-normal text-muted-foreground">({foreign})</bdi>}</span>
                        </div>
                        <div className="-mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs tabular-nums text-muted-foreground lg:hidden">
                          {dayLabel(txn.date)}
                          {categoryControl}
                        </div>
                        {txn.memo && (
                          <div className="text-xs text-muted-foreground">
                            {txn.memo}
                          </div>
                        )}
                        {txn.type === "installments" &&
                          txn.installmentNumber &&
                          txn.installmentTotal && (
                            <div className="text-xs text-muted-foreground">
                              {t("rowInstallment", {
                                n: txn.installmentNumber,
                                total: txn.installmentTotal,
                              })}
                            </div>
                          )}
                        {members.length >= 2 && (
                          <div className="mt-1 xl:hidden">
                            <OwnerPicker
                              label={tTags("ownerLabel")}
                              value={txn.owner ?? null}
                              fallback={accountOwners[txn.accountNumber] ?? null}
                              members={members}
                              onChange={(owner) => void handleOwnerChange(txn.id, owner)}
                            />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {categoryControl}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <TransactionSourceCell
                          provider={txn.provider}
                          accountLabel={txn.accountLabel}
                        />
                      </TableCell>
                      <TableCell className="hidden whitespace-normal xl:table-cell">
                        {/* One line, like every other cell: a wrapped tags cell doubled the row's height. */}
                        <div className="flex max-w-[200px] items-center gap-1 overflow-hidden">
                          {members.length >= 2 && (
                            <OwnerPicker
                              label={tTags("ownerLabel")}
                              value={txn.owner ?? null}
                              fallback={accountOwners[txn.accountNumber] ?? null}
                              members={members}
                              onChange={(owner) => void handleOwnerChange(txn.id, owner)}
                            />
                          )}
                          {onTagClick && (
                            <TagChips id={txn.id} tags={txn.tags ?? []} allTags={allTags} onFilter={onTagClick} className="mt-0 flex-nowrap"
                              addClassName="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={cn("hidden whitespace-nowrap text-end font-medium tabular-nums lg:table-cell", amountTone)}>
                        {amount}
                        {foreign && <bdi className="block text-xs font-normal text-muted-foreground">{foreign}</bdi>}
                      </TableCell>
                      <TableCell className="text-end max-lg:align-top">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                            disabled={updatingId === txn.id || editing || isFetching}
                            aria-label={t("rowActions")}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {onEdit && <DropdownMenuItem onClick={() => onEdit(txn)}>{tManual("editTitle")}</DropdownMenuItem>}
                            {txn.kind === "expense" && txn.status === "completed" && txn.chargedAmount < 0 && <DropdownMenuItem onClick={() => setSplit(txn)}>{t("splitCategories")}</DropdownMenuItem>}
                            {otherKinds[txn.kind].map((opt) => (
                              <DropdownMenuItem
                                key={opt.value}
                                onClick={() => handleKindChange(txn.id, opt.value)}
                              >
                                {opt.label}
                              </DropdownMenuItem>
                            ))}
                            {txn.isExcluded ? (
                              <DropdownMenuItem
                                onClick={() => handleExcludeToggle(txn, false)}
                              >
                                <Eye className="me-2 h-3.5 w-3.5" />
                                {t("includeAction")}
                              </DropdownMenuItem>
                            ) : (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleExcludeToggle(txn, false)}
                                >
                                  <EyeOff className="me-2 h-3.5 w-3.5" />
                                  {t("excludeAction")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleExcludeToggle(txn, true)}
                                >
                                  <EyeOff className="me-2 h-3.5 w-3.5" />
                                  {t("excludeMerchantAction")}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
                );
              })}
            </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <span className="text-xs text-muted-foreground">
                  {t("paginationRange", {
                    from: page * PAGE_SIZE + 1,
                    to: Math.min((page + 1) * PAGE_SIZE, total),
                    total,
                  })}
                </span>
                <div className="flex gap-1">
                  <IconButton
                    label={t("previous")}
                    variant="outline"
                    size="icon-sm"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page === 0}
                  >
                    <Back />
                  </IconButton>
                  <IconButton
                    label={t("next")}
                    variant="outline"
                    size="icon-sm"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages - 1}
                  >
                    <Forward />
                  </IconButton>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
