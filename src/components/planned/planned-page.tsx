"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlarmClock, CalendarClock, Check, Link2, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { CardShell } from "@/components/home/card-shell";
import { translateCategoryName } from "@/lib/i18n-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deletePlannedItem,
  getCategories,
  getPlanned,
  getSettings,
  plannedAction,
  savePlannedItem,
  setPlannedItemStatus,
} from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import { shekels } from "@/lib/money";
import type { PlannedItemView, PlannedPayload } from "@/lib/planned";

const NONE = "__none";

interface Draft {
  id?: number;
  description: string;
  amount: string;
  date: string;
  account: string;
  installments: string;
  matchPattern: string;
  categoryId: string;
  owner: string;
  notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = (): Draft => ({
  description: "",
  amount: "",
  date: today(),
  account: "",
  installments: "1",
  matchPattern: "",
  categoryId: "",
  owner: "",
  notes: "",
});

function draftOf(item: PlannedItemView): Draft {
  return {
    id: item.id,
    description: item.description,
    amount: String(item.amount),
    date: item.date,
    account: item.account ?? "",
    installments: String(item.installments),
    matchPattern: item.matchPattern ?? "",
    categoryId: item.categoryId == null ? "" : String(item.categoryId),
    owner: item.owner ?? "",
    notes: item.notes ?? "",
  };
}

function itemOf(draft: Draft) {
  return {
    id: draft.id,
    description: draft.description,
    amount: draft.amount,
    date: draft.date,
    account: draft.account,
    installments: draft.installments,
    matchPattern: draft.matchPattern,
    categoryId: draft.categoryId,
    owner: draft.owner,
    notes: draft.notes,
  };
}

export function PlannedPage() {
  const t = useTranslations("planned");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["planned"], queryFn: getPlanned });
  const settings = useQuery({ queryKey: ["settings"], queryFn: getSettings, staleTime: 60_000 });
  const categories = useQuery({ queryKey: ["categories", "expense"], queryFn: () => getCategories("expense"), staleTime: 60_000 });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<PlannedItemView | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["planned"] });

  const save = useMutation({
    mutationFn: (d: Draft) => savePlannedItem(itemOf(d)),
    onSuccess: (_r, d) => {
      refresh();
      setDraft(null);
      toast.success(d.id ? t("updated") : t("created"));
    },
    onError: (e: Error) => toast.error(e.message || t("saveFailed")),
  });
  const remove = useMutation({
    mutationFn: (item: PlannedItemView) => deletePlannedItem(item.id),
    onSuccess: () => {
      refresh();
      setDeleting(null);
      toast.success(t("deleted"));
    },
    onError: (e: Error) => toast.error(e.message || t("saveFailed")),
  });
  const status = useMutation({
    mutationFn: ({ item, next }: { item: PlannedItemView; next: "planned" | "cancelled" }) => setPlannedItemStatus(item.id, next),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || t("saveFailed")),
  });
  const act = useMutation({
    mutationFn: (input: { action: "match" | "link" | "reject" | "unlink"; itemId?: number; txnId?: number }) => plannedAction(input.action, input),
    onSuccess: (res, input) => {
      refresh();
      if (input.action === "match") {
        if (res.matched) toast.success(t("matchedToast", { count: res.matched }));
      } else if (input.action === "unlink") {
        toast.success(t("unlinked"));
      }
    },
    onError: (e: Error) => toast.error(e.message || t("saveFailed")),
  });

  // Unique candidates are matched automatically when the page opens; several are left to the user.
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || !query.data) return;
    ran.current = true;
    if (query.data.items.some((i) => i.status === "planned")) act.mutate({ action: "match" });
  }, [query.data, act]);

  const data = query.data;
  const members = settings.data?.household.members ?? [];
  const tCat = useTranslations("categoriesSeeded");
  const categoryName = (id: number | null) => {
    const name = id == null ? null : categories.data?.find((c) => c.id === id)?.name;
    return name ? translateCategoryName(name, tCat) : null;
  };
  const ownerName = (owner: string | null) => (owner == null ? null : owner === "shared" ? t("shared") : members.find((m) => m.id === owner)?.name ?? null);

  const active = data?.items.filter((i) => i.status === "planned") ?? [];
  const matched = data?.items.filter((i) => i.status === "matched") ?? [];
  const cancelled = data?.items.filter((i) => i.status === "cancelled") ?? [];
  const waiting = active.filter((i) => i.candidates.length > 0);

  return (
    <div className="space-y-5">
      <p className="text-footnote text-pretty text-muted-foreground">{t("subtitle")}</p>

      {query.isLoading && <Skeleton className="h-32 w-full rounded-2xl" />}
      {query.isError && (
        <CardShell>
          <div className="flex items-center justify-between gap-3 py-4">
            <span className="text-footnote text-muted-foreground">{t("loadFailed")}</span>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>{t("retry")}</Button>
          </div>
        </CardShell>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("plannedCount")} value={String(data.totals.planned)} />
            <Stat label={t("upcoming")} value={shekels(data.totals.upcoming, locale)} />
            <Stat label={t("overdue")} value={String(data.totals.overdue)} tone={data.totals.overdue > 0 ? "warn" : undefined} />
            <Stat label={t("matchedCount")} value={String(data.totals.matched)} />
          </div>

          {waiting.length > 0 && (
            <CardShell label={t("candidatesTitle")}>
              <p className="pb-2 text-caption text-pretty text-muted-foreground">{t("candidatesHint")}</p>
              <ul className="row-grid">
                {waiting.map((item) => (
                  <li key={item.id} className="py-2.5">
                    <p className="text-footnote font-medium">
                      {item.description} · {shekels(item.amount, locale)}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {item.candidates.map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-caption">
                          <span className="min-w-0 text-muted-foreground">
                            {t("candidateLine", { date: formatDate(c.date), account: shortAccount(c.account), amount: shekels(c.amount, locale) })}
                            <span className="ms-2 truncate">{c.description}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Button variant="outline" size="sm" onClick={() => act.mutate({ action: "link", itemId: item.id, txnId: c.id })}>
                              <Check className="size-3.5" aria-hidden />
                              {t("useThis")}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => act.mutate({ action: "reject", itemId: item.id, txnId: c.id })}>
                              <X className="size-3.5" aria-hidden />
                              {t("notThis")}
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </CardShell>
          )}

          <CardShell
            label={t("items")}
            action={
              <span className="flex flex-wrap items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => act.mutate({ action: "match" })} disabled={act.isPending}>
                  <Link2 className="size-4" aria-hidden />
                  {t("runMatch")}
                </Button>
                <Button size="sm" onClick={() => setDraft(EMPTY())}>
                  <Plus className="size-4" aria-hidden />
                  {t("addItem")}
                </Button>
              </span>
            }
          >
            {active.length === 0 && matched.length === 0 && cancelled.length === 0 ? (
              <div className="py-8 text-center">
                <CalendarClock className="mx-auto size-8 text-muted-foreground" aria-hidden />
                <p className="mt-2 text-footnote font-medium">{t("empty")}</p>
                <p className="mt-1 text-caption text-muted-foreground">{t("emptyHint")}</p>
              </div>
            ) : (
              <ul className="row-grid">
                {[...active, ...matched, ...cancelled].map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    locale={locale}
                    category={categoryName(item.categoryId)}
                    owner={ownerName(item.owner)}
                    onEdit={() => setDraft(draftOf(item))}
                    onCancel={() => status.mutate({ item, next: item.status === "cancelled" ? "planned" : "cancelled" })}
                    onUnlink={() => act.mutate({ action: "unlink", itemId: item.id })}
                    onDelete={() => setDeleting(item)}
                  />
                ))}
              </ul>
            )}
          </CardShell>

          {draft && (
            <PlannedDialog
              key={draft.id ?? "new"}
              draft={draft}
              data={data}
              categoryName={categoryName}
              memberName={(id) => members.find((m) => m.id === id)?.name ?? null}
              categories={categories.data ?? []}
              members={members}
              saving={save.isPending}
              onSave={(d) => save.mutate(d)}
              onClose={() => setDraft(null)}
            />
          )}

          <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("delete")}</DialogTitle>
                <DialogDescription>{deleting ? `${deleting.description}: ${t("deleteHint")}` : ""}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
                <Button variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
                  {t("delete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function shortAccount(account: string): string {
  return account.length > 4 ? account.slice(-4) : account;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="card-surface px-4 py-3">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className={tone === "warn" ? "mt-1 text-title font-semibold tabular-nums text-status-heads-up" : "mt-1 text-title font-semibold tabular-nums"}>{value}</p>
    </div>
  );
}

function Row({
  item,
  locale,
  category,
  owner,
  onEdit,
  onCancel,
  onUnlink,
  onDelete,
}: {
  item: PlannedItemView;
  locale: string;
  category: string | null;
  owner: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onUnlink: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("planned");
  const next = item.nextPayment;
  const meta = [category, owner, item.account ? shortAccount(item.account) : null].filter(Boolean).join(" · ");

  return (
    <li className={item.status === "cancelled" ? "py-3 opacity-60" : "py-3"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-footnote font-semibold">
            {item.description}
            <span
              className={
                item.status === "matched"
                  ? "rounded-full bg-accent px-2 py-0.5 text-caption font-medium text-accent-foreground"
                  : item.status === "cancelled"
                    ? "rounded-full bg-muted px-2 py-0.5 text-caption font-medium text-muted-foreground"
                    : "rounded-full bg-primary/12 px-2 py-0.5 text-caption font-medium text-primary"
              }
            >
              {t(`status_${item.status}`)}
            </span>
            {item.overdue && (
              <span className="flex items-center gap-1 text-caption font-medium text-status-heads-up">
                <AlarmClock className="size-3.5" aria-hidden />
                {t("overdueChip")}
              </span>
            )}
          </p>
          {meta && <p className="mt-0.5 text-caption text-muted-foreground">{meta}</p>}
          <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-caption text-muted-foreground">
            <span>{t("dueOn", { date: formatDate(item.date) })}</span>
            {item.installments > 1 && <span>{t("paymentsCount", { count: item.installments })}</span>}
            {item.status === "planned" && next && <span>{t("nextCharge", { date: formatDate(next.chargeDate) })}</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-footnote font-semibold tabular-nums">{shekels(item.amount, locale)}</span>
          <span className="flex items-center gap-1">
            {item.status === "matched" ? (
              <Button variant="ghost" size="icon" aria-label={t("unlink")} onClick={onUnlink}>
                <RotateCcw className="size-4" aria-hidden />
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="icon" aria-label={t("editItem")} onClick={onEdit}>
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" aria-label={t("cancelItem")} onClick={onCancel}>
                  {item.status === "cancelled" ? <RotateCcw className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" aria-label={t("delete")} onClick={onDelete}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </span>
        </div>
      </div>
    </li>
  );
}

function PlannedDialog({
  draft,
  data,
  categoryName,
  memberName,
  categories,
  members,
  saving,
  onSave,
  onClose,
}: {
  draft: Draft;
  data: PlannedPayload;
  categoryName: (id: number | null) => string | null;
  memberName: (id: string) => string | null;
  categories: { id: number; name: string; parentId: number | null }[];
  members: { id: string; name: string }[];
  saving: boolean;
  onSave: (d: Draft) => void;
  onClose: () => void;
}) {
  const t = useTranslations("planned");
  const [form, setForm] = useState<Draft>(draft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Parent categories read better with the parent's name in front.
  const labelOf = (c: { id: number; name: string; parentId: number | null }) =>
    c.parentId == null ? categoryName(c.id) ?? c.name : `${categoryName(c.parentId) ?? ""} · ${categoryName(c.id) ?? c.name}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{draft.id ? t("editItem") : t("addItem")}</DialogTitle>
        </DialogHeader>
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(form);
          }}
        >
          <Field label={t("description")} htmlFor="planned-description" className="sm:col-span-2">
            <Input id="planned-description" required maxLength={80} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label={t("amount")} htmlFor="planned-amount">
            <Input id="planned-amount" required type="number" min="0.01" step="any" dir="ltr" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          </Field>
          <Field label={t("date")} htmlFor="planned-date">
            <Input id="planned-date" required type="date" dir="ltr" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label={t("account")}>
            <Select value={form.account || NONE} onValueChange={(v) => v && set("account", v === NONE ? "" : v)}>
              <SelectTrigger aria-label={t("account")} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("noAccount")}</SelectItem>
                {data.accounts.map((a) => (
                  <SelectItem key={`${a.provider}|${a.account}`} value={a.account}>
                    {t(`accountKind_${a.kind}`)} · {shortAccount(a.account)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("installments")} htmlFor="planned-installments">
            <Input id="planned-installments" type="number" min="1" max="60" step="1" dir="ltr" value={form.installments} onChange={(e) => set("installments", e.target.value)} />
          </Field>
          <Field label={t("matchPattern")} htmlFor="planned-match" hint={t("matchHint")} className="sm:col-span-2">
            <Input id="planned-match" maxLength={60} value={form.matchPattern} onChange={(e) => set("matchPattern", e.target.value)} />
          </Field>
          <Field label={t("category")}>
            <Select value={form.categoryId || NONE} onValueChange={(v) => v && set("categoryId", v === NONE ? "" : v)}>
              <SelectTrigger aria-label={t("category")} className="w-full"><SelectValue>{(v: string) => (v === NONE ? t("noCategory") : categories.find((c) => String(c.id) === v)?.name ?? t("noCategory"))}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("noCategory")}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{labelOf(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("owner")}>
            <Select value={form.owner || NONE} onValueChange={(v) => v && set("owner", v === NONE ? "" : v)}>
              <SelectTrigger aria-label={t("owner")} className="w-full"><SelectValue>{(v: string) => (v === NONE ? t("owner") : v === "shared" ? t("shared") : memberName(v) ?? t("owner"))}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("owner")}</SelectItem>
                <SelectItem value="shared">{t("shared")}</SelectItem>
                {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("notes")} htmlFor="planned-notes" className="sm:col-span-2">
            <textarea
              id="planned-notes"
              rows={2}
              maxLength={500}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-footnote outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
            <Button type="submit" disabled={saving}>{saving ? t("saving") : t("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={"space-y-1.5 " + (className ?? "")}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-caption text-pretty text-muted-foreground">{hint}</p>}
    </div>
  );
}
