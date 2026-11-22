"use client";

import { CATEGORY_COLORS } from "@/components/settings/new-category-dialog";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useMessages, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Trash2, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input, InputGroup } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteCategory,
  updateCategoryLook,
  getCategories,
  setCategoryParent,
  updateCategorySpendingType,
  updateBudget,
  updateCategoryBudgetMode,
  updateCategoryDescription,
} from "@/lib/api";
import { translateCategoryName } from "@/lib/i18n-data";
import type { Category, CategoryWithData, CostType, NeedType } from "@/lib/types";

const NONE_VALUE = "__none__";
const DESCRIPTION_MAX = 500;

export interface CategoryDetailSheetProps {
  categoryId: number | null;
  data: CategoryWithData | null;
  onClose: () => void;
}

export function CategoryDetailSheet({
  categoryId,
  data,
  onClose,
}: CategoryDetailSheetProps) {
  const open = categoryId !== null;
  const { data: allCategories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
    enabled: open,
  });
  const category = useMemo(
    () => allCategories?.find((c) => c.id === categoryId) ?? null,
    [allCategories, categoryId]
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-md! md:max-w-lg!"
      >
        {category ? (
          <Body
            category={category}
            data={data}
            allCategories={allCategories ?? []}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  category,
  data,
  allCategories,
  onClose,
}: {
  category: Category;
  data: CategoryWithData | null;
  allCategories: Category[];
  onClose: () => void;
}) {
  const td = useTranslations("settings.categoryDetail");
  const tCatTitle = useTranslations("categoriesSeeded");
  const sameKind = allCategories.filter(
    (c) => c.kind === category.kind && c.id !== category.id
  );
  const eligibleParents = sameKind
    .filter((c) => c.parentId == null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const childCategories = useMemo(
    () =>
      allCategories
        .filter((c) => c.parentId === category.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allCategories, category.id]
  );
  const isParentGroup = childCategories.length > 0 || data?.isParent === true;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader
        className="gap-3 border-b border-border/40 p-6"
        style={{
          background: tint(category.color, 0.15),
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/70"
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: category.color }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle>{translateCategoryName(category.name, tCatTitle)}</SheetTitle>
            <SheetDescription className="mt-0.5">
              {category.kind === "expense"
                ? td("expenseCategory")
                : td("incomeCategory")}
              {data?.parentName
                ? td("inParent", { name: data.parentName })
                : ""}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-6 p-6">
        <LookSection key={category.id} category={category} />

        {!category.parentId && data?.isParent !== true ? (
          <BudgetSection category={category} data={data} />
        ) : (
          <BudgetSection category={category} data={data} />
        )}

        <GroupSection
          category={category}
          eligibleParents={eligibleParents}
        />

        {category.kind === "expense" && !isParentGroup && (
          <SpendingTypeSection category={category} />
        )}

        <DescriptionSection category={category} />

        <DeleteCategorySection
          category={category}
          transactionCount={data?.transactionCount ?? 0}
          isParentGroup={isParentGroup}
          childCategories={childCategories}
          onDeleted={onClose}
        />
      </div>
    </div>
  );
}

function parseDeleteCategoryError(message: string): string[] | null {
  try {
    const body = JSON.parse(message) as {
      error?: string;
      children?: { name: string }[];
    };
    if (body.error === "has-children" && body.children?.length) {
      return body.children.map((c) => c.name);
    }
  } catch {
    /* not JSON */
  }
  return null;
}

function DeleteCategorySection({
  category,
  transactionCount,
  isParentGroup,
  childCategories,
  onDeleted,
}: {
  category: Category;
  transactionCount: number;
  isParentGroup: boolean;
  childCategories: Category[];
  onDeleted: () => void;
}) {
  const t = useTranslations("settings.categories");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => deleteCategory(category.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(
        t("deletedToast", { count: result.unassignedTransactionCount })
      );
      setOpen(false);
      onDeleted();
    },
    onError: (err: Error) => {
      const names =
        parseDeleteCategoryError(err.message) ??
        (childCategories.length > 0
          ? childCategories.map((c) => c.name)
          : null);
      if (names && names.length > 0) {
        toast.error(t("deleteHasChildrenNamed", { names: names.join(", ") }));
      } else if (
        err.message.includes("has-children") ||
        err.message.includes("409")
      ) {
        toast.error(t("deleteHasChildren"));
      } else {
        toast.error(t("deleteFailed"));
      }
    },
  });

  return (
    <>
      <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t("deleteTitle")}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isParentGroup ? t("deleteParentHint") : t("deleteHint")}
            </p>
            {isParentGroup && childCategories.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 ps-4 text-xs text-foreground/80">
                {childCategories.map((child) => (
                  <li key={child.id}>{child.name}</li>
                ))}
              </ul>
            ) : null}
            <IconButton showLabel
              label={t("deleteButton")}
              variant="destructive"
              className="mt-3"
              onClick={() => setOpen(true)}
              disabled={isParentGroup}
            >
              <Trash2 className="size-4" aria-hidden />
            </IconButton>
          </div>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("confirmDeleteTitle", { name: category.name })}
            </DialogTitle>
            <DialogDescription>
              {t("confirmDeleteDescription", { count: transactionCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <IconButton
              label={tCommon("cancel")}
              variant="outline"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" aria-hidden />
            </IconButton>
            <IconButton showLabel
              label={mutation.isPending ? tCommon("deleting") : t("deleteButton")}
              variant="destructive"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              <Trash2 className="size-4" aria-hidden />
            </IconButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BudgetSection({
  category,
  data,
}: {
  category: Category;
  data: CategoryWithData | null;
}) {
  const td = useTranslations("settings.categoryDetail");
  const queryClient = useQueryClient();
  const isBudgeted = category.budgetMode === "budgeted";

  const modeMutation = useMutation({
    mutationFn: (next: "budgeted" | "tracking") =>
      updateCategoryBudgetMode(category.id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const budgetMutation = useMutation({
    mutationFn: (amount: number | null) => updateBudget(category.id, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const [amount, setAmount] = useState(
    data ? String(Math.round(data.budget)) : ""
  );

  const [prevData, setPrevData] = useState(data);
  if (data !== prevData) {
    setPrevData(data);
    if (data) setAmount(String(Math.round(data.budget)));
  }

  const handleBlur = () => {
    if (!data) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (Math.round(parsed) === Math.round(data.budget)) return;
    budgetMutation.mutate(parsed);
  };

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {td("budgetHeading")}
      </div>
      <div className="mt-3 rounded-xl bg-muted/60 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Label
              htmlFor={`mode-${category.id}`}
              className="text-sm font-medium"
            >
              {isBudgeted ? td("budgeted") : td("trackingOnly")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {isBudgeted
                ? td("budgetedHint")
                : td("trackingHint")}
            </p>
          </div>
          <Switch
            id={`mode-${category.id}`}
            checked={isBudgeted}
            onCheckedChange={(next) =>
              modeMutation.mutate(next ? "budgeted" : "tracking")
            }
          />
        </div>

        {isBudgeted ? (
          <div className="mt-4 space-y-1.5">
            <Label htmlFor={`budget-${category.id}`}>{td("monthlyBudget")}</Label>
            <InputGroup prefix="₪">
              <Input
                id={`budget-${category.id}`}
                type="number"
                className="text-end tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={handleBlur}
                min={0}
              />
            </InputGroup>
            {data ? (
              <p className="text-xs text-muted-foreground">
                {td("spentThisMonth", {
                  amount: Math.round(data.spent).toLocaleString("en-IL"),
                })}
                {data.vsTypical && data.vsTypical.typical > 0 ? (
                  <>
                    {" "}
                    {td("typical", {
                      amount: Math.round(data.vsTypical.typical).toLocaleString(
                        "en-IL"
                      ),
                    })}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

const NEED_TYPES = ["need", "want", "saving"] as const;
const COST_TYPES = ["fixed", "variable", "unplanned"] as const;

/** 50/30/20 bucket and fixed/variable tag, used by the period overview. */
function SpendingTypeSection({ category }: { category: Category }) {
  const td = useTranslations("settings.categoryDetail");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (fields: { needType?: NeedType; costType?: CostType }) =>
      updateCategorySpendingType(category.id, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      toast.success(td("spendingTypeSaved"));
    },
    onError: () => toast.error(td("spendingTypeSaveFailed")),
  });

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {td("spendingTypeHeading")}
      </div>
      <div className="mt-3 grid gap-4 rounded-xl bg-muted/60 p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{td("needTypeLabel")}</Label>
          <Select
            value={category.needType}
            onValueChange={(v) => v && mutation.mutate({ needType: v as NeedType })}
          >
            <SelectTrigger aria-label={td("needTypeLabel")}>
              <SelectValue>{(v: string) => td(`needType_${v}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {NEED_TYPES.map((v) => (
                <SelectItem key={v} value={v}>{td(`needType_${v}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{td("costTypeLabel")}</Label>
          <Select
            value={category.costType}
            onValueChange={(v) => v && mutation.mutate({ costType: v as CostType })}
          >
            <SelectTrigger aria-label={td("costTypeLabel")}>
              <SelectValue>{(v: string) => td(`costType_${v}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {COST_TYPES.map((v) => (
                <SelectItem key={v} value={v}>{td(`costType_${v}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}

/** Name and colour: saved when the field loses focus (or on Enter), and each swatch saves on tap. */
function LookSection({ category }: { category: Category }) {
  const td = useTranslations("settings.categoryDetail");
  const tCat = useTranslations("categoriesSeeded");
  const queryClient = useQueryClient();
  const shown = translateCategoryName(category.name, tCat);
  const [name, setName] = useState(shown);
  const mutation = useMutation({
    mutationFn: (fields: { name?: string; color?: string }) => updateCategoryLook(category.id, fields),
    onSuccess: () => {
      ["categories", "summary", "budgets", "overview"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(td("lookSaved"));
    },
    onError: (err: Error) => {
      setName(shown);
      toast.error(err.message.includes("duplicate") ? td("nameTaken") : td("lookFailed"));
    },
  });
  const saveName = () => {
    const next = name.trim();
    if (!next) { setName(shown); return; }
    if (next !== shown) mutation.mutate({ name: next });
  };
  return (
    <section className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`cat-name-${category.id}`}>{td("nameLabel")}</Label>
        <Input id={`cat-name-${category.id}`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={saveName}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }} />
      </div>
      <div role="radiogroup" aria-label={td("colorLabel")} className="flex flex-wrap gap-2">
        {CATEGORY_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={category.color.toLowerCase() === c.toLowerCase()} aria-label={c}
            onClick={() => mutation.mutate({ color: c })}
            className="grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-background focus-visible:outline-2 focus-visible:outline-ring aria-checked:ring-2 aria-checked:ring-foreground"
            style={{ background: c }} />
        ))}
      </div>
    </section>
  );
}

function GroupSection({
  category,
  eligibleParents,
}: {
  category: Category;
  eligibleParents: Category[];
}) {
  const td = useTranslations("settings.categoryDetail");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (parentId: number | null) =>
      setCategoryParent(category.id, parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success(td("groupUpdated"));
    },
    onError: (err: Error) => {
      const reason = err.message;
      if (reason === "kind-mismatch") {
        toast.error(td("errorKindMismatch"));
      } else if (reason === "not-leaf-target") {
        toast.error(td("errorNotTopLevel"));
      } else if (reason === "child-has-children") {
        toast.error(td("errorHasChildren"));
      } else {
        toast.error(td("errorUpdateParent"));
      }
    },
  });
  const current =
    category.parentId == null ? NONE_VALUE : String(category.parentId);

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {td("groupHeading")}
      </div>
      <div className="mt-3 rounded-xl bg-muted/60 p-4 space-y-2">
        <Label>{td("parentGroup")}</Label>
        <Select
          value={current}
          onValueChange={(v) => {
            if (!v) return;
            const next = v === NONE_VALUE ? null : Number(v);
            mutation.mutate(next);
          }}
        >
          <SelectTrigger aria-label={td("parentGroup")}>
            <SelectValue>
              {(value: string) =>
                value === NONE_VALUE
                  ? td("noParent")
                  : eligibleParents.find((p) => String(p.id) === value)?.name ??
                    td("noParent")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>{td("noParent")}</SelectItem>
            {eligibleParents.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {td("parentGroupHint")}
        </p>
      </div>
    </section>
  );
}

function DescriptionSection({ category }: { category: Category }) {
  const td = useTranslations("settings.categoryDetail");
  const queryClient = useQueryClient();
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale();
  // Seeded descriptions are English (the categorizer reads them); in Hebrew show the translation until the user edits it.
  const seededHe = (useMessages() as { categoryDescriptions?: Record<string, string> }).categoryDescriptions?.[category.name];
  const stored = category.description ?? "";
  const initial = locale === "he" && seededHe && /^[A-Za-z]/.test(stored.trim()) ? seededHe : stored;
  const [value, setValue] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setValue(initial);
  }

  const mutation = useMutation({
    mutationFn: (next: string | null) =>
      updateCategoryDescription(category.id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(td("descriptionSaved"));
    },
    onError: (err: Error) => {
      toast.error(err.message || td("descriptionSaveFailed"));
    },
  });

  const handleBlur = () => {
    const trimmed = value.trim();
    const current = initial.trim();
    if (trimmed === current) return;
    if (trimmed.length > DESCRIPTION_MAX) {
      toast.error(td("descriptionTooLong", { max: DESCRIPTION_MAX }));
      return;
    }
    mutation.mutate(trimmed.length === 0 ? null : trimmed);
  };

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {td("aiHintHeading")}
      </div>
      <div className="mt-3 rounded-xl bg-muted/60 p-4 space-y-2">
        <Label htmlFor={`desc-${category.id}`}>{td("description")}</Label>
        <textarea
          id={`desc-${category.id}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          rows={4}
          maxLength={DESCRIPTION_MAX}
          placeholder={td("descriptionPlaceholder", { name: translateCategoryName(category.name, tCat) })}
          className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          disabled={mutation.isPending}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{td("descriptionHint")}</span>
          <span className="tabular-nums">
            {value.length} / {DESCRIPTION_MAX}
          </span>
        </div>
      </div>
    </section>
  );
}

function tint(color: string, alpha: number): string {
  return `color-mix(in oklch, ${color} ${Math.round(alpha * 100)}%, var(--card))`;
}
