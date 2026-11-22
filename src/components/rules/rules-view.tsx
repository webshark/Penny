"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { IconButton } from "@/components/ui/icon-button";
import { Plus, Trash2, ListFilter } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SectionShell, SettingCard } from "@/components/settings/section-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRule, createRuleWithPast, deleteRule, getCategories, listRules, previewRule } from "@/lib/api";
import { translateCategoryName } from "@/lib/i18n-data";
import type { Rule } from "@/server/rules/engine";

const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";

export function RulesView() {
  const t = useTranslations("rules");
  const tCat = useTranslations("categoriesSeeded");
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [field, setField] = useState<Rule["field"]>("merchant");
  const [op, setOp] = useState<Rule["op"]>("contains");
  const [value, setValue] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [kind, setKind] = useState("");
  const [error, setError] = useState(false);
  const [missing, setMissing] = useState<"needValue" | "needTarget" | null>(null);
  const [applyToPast, setApplyToPast] = useState(true);
  const [fetchedPreview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);

  // Live count of existing transactions the draft rule would change; debounced, and cleared while the draft is incomplete or invalid.
  const draftReady = Boolean(value.trim() && (categoryId || kind));
  useEffect(() => {
    if (!draftReady) return;
    let stale = false;
    const timer = setTimeout(() => {
      previewRule({ field, op, value, categoryId: categoryId ? Number(categoryId) : undefined, kind: (kind || undefined) as Rule["kind"] })
        .then((p) => !stale && setPreview(p))
        .catch(() => !stale && setPreview(null));
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [draftReady, field, op, value, categoryId, kind]);

  const refresh = useCallback(() => {
    listRules().then(setRules).catch(() => setError(true));
  }, []);

  useEffect(() => {
    refresh();
    getCategories("expense").then((c) => setCategories(c)).catch(() => {});
  }, [refresh]);

  const preview = draftReady ? fetchedPreview : null;

  const ops: Rule["op"][] = field === "amount" ? ["gt", "lt"] : ["contains", "equals", "regex"];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    const gap = !value.trim() ? "needValue" : !categoryId && !kind ? "needTarget" : null;
    setMissing(gap);
    if (gap) {
      document.getElementById(gap === "needValue" ? "rule-value" : "rule-category")?.focus();
      return;
    }
    try {
      const { applied } = await createRuleWithPast(
        {
          field,
          op,
          value,
          categoryId: categoryId ? Number(categoryId) : undefined,
          kind: (kind || undefined) as Rule["kind"],
        },
        applyToPast
      );
      if (applied > 0) toast(t("appliedPast", { count: applied }));
      setValue("");
      refresh();
    } catch {
      setError(true);
    }
  }

  // Deleting acts at once; Undo recreates the same rule.
  async function remove(rule: Rule) {
    await deleteRule(rule.id);
    refresh();
    toast(t("deleted"), {
      action: {
        label: t("undo"),
        onClick: () =>
          createRule({
            field: rule.field,
            op: rule.op,
            value: rule.value,
            categoryId: rule.categoryId,
            kind: rule.kind,
          }).then(refresh),
      },
    });
  }

  const categoryName = (id?: number) => {
    const name = categories.find((c) => c.id === id)?.name;
    return name ? translateCategoryName(name, tCat) : undefined;
  };

  return (
    <SectionShell title={t("title")} description={t("description")} icon={<ListFilter aria-hidden />}>
      <SettingCard title={t("add")}>
          <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rule-field">{t("when")}</Label>
              <select
                id="rule-field"
                className={selectClass}
                value={field}
                onChange={(e) => {
                  const f = e.target.value as Rule["field"];
                  setField(f);
                  setOp(f === "amount" ? "gt" : "contains");
                }}
              >
                {(["merchant", "amount", "account"] as const).map((f) => (
                  <option key={f} value={f}>{t(f)}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-op">{t("condition")}</Label>
              <select id="rule-op" className={selectClass} value={op} onChange={(e) => setOp(e.target.value as Rule["op"])}>
                {ops.map((o) => (
                  <option key={o} value={o}>{t(o)}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="rule-value">{t("value")}</Label>
              <Input
                id="rule-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={200}
                aria-invalid={missing === "needValue" || undefined}
                aria-describedby={missing === "needValue" ? "rule-missing" : undefined}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-category">{t("setCategory")}</Label>
              <select
                id="rule-category"
                className={selectClass}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                aria-invalid={missing === "needTarget" || undefined}
                aria-describedby={missing === "needTarget" ? "rule-missing" : undefined}
              >
                <option value="">{t("none")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{translateCategoryName(c.name, tCat)}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-kind">{t("markAs")}</Label>
              <select id="rule-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">{t("none")}</option>
                {(["expense", "income", "transfer"] as const).map((k) => (
                  <option key={k} value={k}>{t(k)}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <p role="status" className="text-footnote text-muted-foreground">
                {preview ? t("previewCount", { count: preview.count }) : null}
                {preview && preview.sample.length > 0 ? (
                  <span className="block">{t("previewSample")} {preview.sample.map((d, i) => <bdi key={i}>{i ? ", " : ""}{d}</bdi>)}</span>
                ) : null}
              </p>
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 font-medium">
                {t("applyToPast")}
                <Switch checked={applyToPast} onCheckedChange={setApplyToPast} />
              </label>
            </div>
            <div className="sm:col-span-2">
              <IconButton showLabel label={t("add")} variant="default" type="submit"><Plus className="size-4" aria-hidden /></IconButton>
              {missing ? <span id="rule-missing" role="alert" className="ms-3 text-sm text-destructive">{t(missing)}</span> : null}
              {error ? <span role="alert" className="ms-3 text-sm text-destructive">{t("saveFailed")}</span> : null}
            </div>
          </form>
      </SettingCard>

      <SettingCard title={t("title")}>
      {rules.length === 0 ? (
        <p className="py-1 text-footnote text-muted-foreground">{t("emptyHint")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rules.map((r) => (
            <li key={r.id} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 break-words">
                {t(r.field)} {t(r.op)} <bdi className="font-medium">{r.value}</bdi>
                {` ${t("arrow")} `}
                {[categoryName(r.categoryId), r.kind ? t(r.kind) : null].filter(Boolean).join(", ")}
              </span>
              <IconButton label={t("deleteRule", { rule: r.value })} className="text-destructive" onClick={() => remove(r)}>
                <Trash2 className="size-4" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      </SettingCard>
    </SectionShell>
  );
}
