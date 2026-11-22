"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconButton } from "@/components/ui/icon-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ICON_MAP } from "@/components/dashboard/category-card";
import { createCategory, getCategories } from "@/lib/api";
import { translateCategoryName } from "@/lib/i18n-data";
import { cn } from "@/lib/utils";
import { childColor, familySwatches } from "@/lib/category-colors";
import type { Category, CategoryKind } from "@/lib/types";

export const CATEGORY_COLORS = [
  "#81B482", "#E89B80", "#65AFD2", "#DCB87A", "#E499A4", "#75BCA3",
  "#94A0DD", "#AB9DDB", "#D5A4D7", "#E5D080", "#A57B5B", "#A2AAC2",
];
const NO_GROUP = "none";

export function NewCategoryDialog({
  open,
  onOpenChange,
  kind,
  onCreated,
  defaultGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: CategoryKind;
  onCreated?: (category: Category) => void;
  /** Opens with this group chosen ("Add subcategory" from a group's menu). */
  defaultGroup?: number;
}) {
  const t = useTranslations("settings.categories");
  const tc = useTranslations("common");
  const tCat = useTranslations("categoriesSeeded");
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
    enabled: open,
  });
  const [name, setName] = useState("");
  const [k, setK] = useState<CategoryKind>(kind);
  const [icon, setIcon] = useState("circle-dot");
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [group, setGroup] = useState(defaultGroup != null ? String(defaultGroup) : NO_GROUP);

  const trimmed = name.trim();
  const duplicate = categories.some(
    (c) =>
      c.name.toLowerCase() === trimmed.toLowerCase() ||
      translateCategoryName(c.name, tCat).toLowerCase() === trimmed.toLowerCase()
  );
  const groups = categories.filter(
    (c) => c.kind === k && c.parentId == null && categories.some((x) => x.parentId === c.id)
  );
  const parent = groups.find((g) => String(g.id) === group);
  // Under a group, offer its color family and preselect the next shade.
  const swatches = parent ? familySwatches(parent.color) : CATEGORY_COLORS;
  const pickGroup = (v: string) => {
    setGroup(v);
    const p = groups.find((g) => String(g.id) === v);
    setColor(p ? childColor(p.color, categories.filter((c) => c.parentId === p.id).length) : CATEGORY_COLORS[0]);
  };

  const mutation = useMutation({
    mutationFn: () =>
      createCategory({
        name: trimmed,
        kind: k,
        icon,
        color,
        parentId: group === NO_GROUP ? null : Number(group),
      }),
    onSuccess: (cat) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success(t("createdToast", { name: cat.name }));
      setName("");
      onOpenChange(false);
      onCreated?.(cat);
    },
    onError: () => toast.error(t("newCategoryFailed")),
  });
  const canSubmit = trimmed.length > 0 && trimmed.length <= 40 && !duplicate && !mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) {
          setK(kind);
          pickGroup(NO_GROUP);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("newCategoryTitle")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-category-name">{t("newGroupName")}</Label>
            <Input
              id="new-category-name"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("newCategoryNamePlaceholder")}
              aria-invalid={duplicate || undefined}
              aria-describedby={duplicate ? "new-category-dup" : undefined}
              autoFocus
            />
            {duplicate && (
              <p id="new-category-dup" className="text-xs text-destructive">
                {t("newCategoryDuplicate")}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label id="new-category-kind">{t("newGroupKind")}</Label>
              <Select
                value={k}
                onValueChange={(v) => {
                  if (!v) return;
                  setK(v as CategoryKind);
                  pickGroup(NO_GROUP);
                }}
              >
                <SelectTrigger aria-labelledby="new-category-kind">
                  <SelectValue>
                    {(v: string) => (v === "income" ? t("tabIncome") : t("tabExpense"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">{t("tabExpense")}</SelectItem>
                  <SelectItem value="income">{t("tabIncome")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label id="new-category-group">{t("newCategoryGroup")}</Label>
              <Select value={group} onValueChange={(v) => v && pickGroup(v)}>
                <SelectTrigger aria-labelledby="new-category-group">
                  <SelectValue>
                    {(v: string) =>
                      v === NO_GROUP
                        ? t("newCategoryNoGroup")
                        : translateCategoryName(
                            groups.find((g) => String(g.id) === v)?.name ?? "",
                            tCat
                          )
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GROUP}>{t("newCategoryNoGroup")}</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {translateCategoryName(g.name, tCat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{t("newCategoryIcon")}</legend>
            <div className="flex flex-wrap gap-1">
              {Object.entries(ICON_MAP).map(([key, Icon]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  aria-pressed={icon === key}
                  onClick={() => setIcon(key)}
                  className={cn(
                    "grid size-9 place-items-center rounded-lg border border-transparent text-muted-foreground hover:bg-accent",
                    icon === key && "border-foreground/40 bg-accent text-foreground"
                  )}
                >
                  <Icon aria-hidden className="size-4" style={icon === key ? { color } : undefined} />
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{t("newCategoryColor")}</legend>
            <div className="flex flex-wrap gap-2">
              {(swatches.includes(color) ? swatches : [color, ...swatches]).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-7 rounded-full ring-offset-2 ring-offset-background",
                    color === c && "ring-2 ring-foreground"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </fieldset>
          <DialogFooter>
            <IconButton type="button" label={tc("cancel")} onClick={() => onOpenChange(false)}>
              <X aria-hidden className="size-4" />
            </IconButton>
            <IconButton
              type="submit"
              label={mutation.isPending ? tc("creating") : t("createButton")}
              variant="default"
              disabled={!canSubmit}
            >
              <Plus aria-hidden className="size-4" />
            </IconButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
