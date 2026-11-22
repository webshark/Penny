"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { loadPreference, storePreference } from "@/lib/preference-sync";
import { parseTemplates, upsertTemplate, type TxnTemplate } from "@/lib/transaction-templates";
import { shekels } from "@/lib/money";
import { BookmarkPlus, ChevronDown, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { CategoryPicker } from "@/components/dashboard/category-picker";
import { CategoryChip } from "./category-chip";
import { NewCategoryDialog } from "@/components/settings/new-category-dialog";
import { OwnerPicker } from "@/components/transactions/owner-picker";
import { useIsMobile } from "@/hooks/use-mobile";
import { PaybackField } from "./payback-field";
import { ReceiptsField } from "./receipts-field";
import { SharesField } from "./shares-field";
import { createManualTransaction, deleteManualTransaction, getCategories, getOwners, updateTransactionFields, type ManualTransactionInput } from "@/lib/api";
import { translateCategoryName, translateProviderName } from "@/lib/i18n-data";
import type { TransactionWithCategory } from "@/lib/types";
import type { HouseholdMember } from "@/lib/household";

export const isManualTxn = (txn: Pick<TransactionWithCategory, "provider">) => txn.provider === "cash" || txn.provider === "manual";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());

/** Deletes a manual row with a 5-second undo toast (undo re-creates it). Shared by the sheet and bulk delete. */
export async function deleteWithUndo(ids: number[], t: (k: string, v?: Record<string, number>) => string, refresh: () => void) {
  const deleted = await Promise.all(ids.map((id) => deleteManualTransaction(id).then((r) => r.deleted)));
  refresh();
  toast.success(ids.length > 1 ? t("bulkDeleted", { count: ids.length }) : t("deleted"), {
    duration: 5000,
    action: { label: t("undo"), onClick: () => void Promise.all(deleted.map(createManualTransaction)).then(refresh, () => toast.error(t("failed"))) },
  });
}

/** Add (txn = null) or edit sheet. Manual rows: every field. Bank rows: display fields only, amount/date locked. */
export function TransactionSheet({ open, onOpenChange, txn, members = [] }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  txn: TransactionWithCategory | null;
  members?: HouseholdMember[];
}) {
  const isMobile = useIsMobile();
  // Keep showing the last row while the sheet animates closed (the parent clears txn on close).
  const [shown, setShown] = useState(txn);
  if (open && txn !== shown) setShown(txn);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className="w-full overflow-y-auto p-0 data-[side=bottom]:max-h-[92dvh] sm:max-w-md!">
        <Form key={shown?.id ?? "new"} txn={shown} members={members} close={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function Form({ txn, members, close }: { txn: TransactionWithCategory | null; members: HouseholdMember[]; close: () => void }) {
  const t = useTranslations("manualTxn");
  const tTags = useTranslations("tags");
  const tBanks = useTranslations("banks");
  const tCat = useTranslations("categoriesSeeded");
  const tSettingsCat = useTranslations("settings.categories");
  const queryClient = useQueryClient();
  const manual = !txn || isManualTxn(txn);
  // A card refund is a positive amount that stays an expense: the kind, never the sign, decides.
  const [kind, setKind] = useState<"expense" | "income">(txn && txn.kind === "income" ? "income" : "expense");
  // A positive expense is a refund or a linked payback. Its sign is what nets it against the charge,
  // so this sheet leaves its kind and amount alone or the totals would count it twice.
  const netted = !!txn && txn.kind === "expense" && txn.chargedAmount > 0;
  const [amount, setAmount] = useState(txn ? String(Math.abs(txn.chargedAmount)) : "");
  const [date, setDate] = useState(txn ? txn.date.slice(0, 10) : today());
  const [description, setDescription] = useState(txn?.description ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(txn?.allocations?.length ? null : txn?.categoryId ?? null);
  // A new row starts on the account chosen in Settings › General, else cash.
  const defaults = useQuery({ queryKey: ["preference", "transaction-defaults"], queryFn: () => loadPreference("transaction-defaults"), enabled: !txn });
  const defaultAccount = (defaults.data as { account?: unknown } | null)?.account;
  const [accountPick, setAccount] = useState<string | null>(txn?.accountNumber ?? null);
  const account = accountPick ?? (typeof defaultAccount === "string" ? defaultAccount : "cash");
  const [memo, setMemo] = useState(txn?.memo ?? "");
  const [tags, setTags] = useState((txn?.tags ?? []).join(", "));
  const [owner, setOwner] = useState<string | null>(txn?.owner ?? null);
  const [excluded, setExcluded] = useState(txn?.isExcluded ?? false);
  const [businessShare, setBusinessShare] = useState(txn && txn.businessSharePct > 0 ? String(txn.businessSharePct) : "");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [newCat, setNewCat] = useState(false);

  const categories = useQuery({ queryKey: ["categories", kind], queryFn: () => getCategories(kind) }).data ?? [];
  const accounts = useQuery({ queryKey: ["owners", "accounts"], queryFn: () => getOwners(today(), today()), enabled: manual }).data?.accounts ?? [];
  const category = categories.find((c) => c.id === categoryId);
  const refresh = () => void queryClient.invalidateQueries();
  const locale = useLocale();
  // Saved entries that fill the form in one tap (new rows only).
  const templatesQuery = useQuery({ queryKey: ["preference", "transaction-templates"], queryFn: () => loadPreference("transaction-templates"), enabled: !txn });
  const templates = parseTemplates(templatesQuery.data);
  const storeTemplates = (next: TxnTemplate[]) => {
    queryClient.setQueryData(["preference", "transaction-templates"], next);
    return storePreference("transaction-templates", next).catch(() => toast.error(t("failed")));
  };
  const applyTemplate = (tp: TxnTemplate) => {
    setKind(tp.kind); setAmount(String(tp.amount)); setDescription(tp.description);
    setCategoryId(tp.categoryId); setAccount(tp.account); setOwner(tp.owner);
  };

  const value = Number(amount.replace(",", "."));
  const amountOk = Number.isFinite(value) && value > 0 && value <= 10_000_000;
  // Empty means "all personal"; otherwise a whole percent.
  const business = businessShare.trim() === "" ? 0 : Number(businessShare.replace(",", "."));
  const businessOk = Number.isInteger(business) && business >= 0 && business <= 100;

  async function save() {
    if (manual && (!date || !description.trim())) return toast.error(t("required"));
    if (manual && !netted && !amountOk) return toast.error(t("invalidAmount"));
    if (!businessOk) return toast.error(t("businessShareInvalid"));
    const input: ManualTransactionInput = {
      description: description.trim(), memo: memo.trim() || null, owner, excluded, businessSharePct: business,
      tags: [...new Set(tags.split(",").map((s) => s.trim()).filter(Boolean))],
      ...(manual ? { ...(netted ? {} : { kind, amount: value }), date, account } : {}),
      // A split row keeps its split unless a category is picked here.
      ...(categoryId !== null || !txn?.allocations?.length ? { categoryId } : {}),
    };
    if (txn && !manual && txn.description === input.description) delete input.description;
    setBusy(true);
    try {
      if (txn) await updateTransactionFields(txn.id, input);
      else await createManualTransaction(input);
      refresh();
      toast.success(txn ? t("saved") : t("added"));
      close();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!txn) return;
    setBusy(true);
    try { await deleteWithUndo([txn.id], t, refresh); close(); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
    finally { setBusy(false); }
  }

  const field = "flex flex-col gap-1.5";
  const control = "h-11 w-full rounded-lg border bg-background px-3 text-base sm:text-sm";
  const positive = netted || kind === "income";
  const tone = positive ? "var(--status-on-track)" : "var(--expense)";
  const [yesterday] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() - 864e5)));
  const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-4 text-footnote font-medium focus-visible:outline-2 focus-visible:outline-ring ${on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent"}`;
  // Optional fields stay folded on a new entry; an edit opens them when one is already filled.
  const hasDetails = !!(txn && (memo || tags || owner || excluded || businessShare.trim() || (account && account !== "cash")));
  return (
    <form className="flex min-h-full flex-col" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="flex flex-col gap-4 p-4">
        <SheetHeader className="p-0"><SheetTitle>{txn ? t("editTitle") : t("addTitle")}</SheetTitle></SheetHeader>
        {!txn && templates.length > 0 && (
          <ul aria-label={t("templates")} className="flex flex-wrap gap-2">
            {templates.map((tp) => (
              <li key={tp.id} className="inline-flex items-center rounded-full bg-muted">
                <button type="button" onClick={() => applyTemplate(tp)} className="min-h-9 rounded-s-full ps-3 pe-1 text-footnote font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                  {tp.description} · <bdi className="tabular-nums" data-money>{shekels(tp.amount, locale)}</bdi>
                </button>
                <button type="button" aria-label={t("removeTemplate", { name: tp.description })} onClick={() => void storeTemplates(templates.filter((x) => x.id !== tp.id))}
                  className="grid size-9 place-items-center rounded-e-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-3.5" aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
        {netted ? <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">{t("nettedLock")}</p> : manual ? (
          <Segmented label={t("type")} value={kind} onChange={(k) => { setKind(k); setCategoryId(null); }}
            options={[{ value: "expense", label: t("expense") }, { value: "income", label: t("income") }]} />
        ) : (
          <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t("bankLock")}</p>
        )}
        {/* The amount leads, large and in the colour of its kind. */}
        <div className="rounded-2xl p-4 text-center" style={{ background: `color-mix(in oklab, ${tone} 10%, transparent)` }}>
          <Label htmlFor="mt-amount" className="justify-center text-footnote text-muted-foreground">{t("amount")}</Label>
          <div className="mt-1 flex items-baseline justify-center gap-1" dir="ltr" style={{ color: tone }}>
            <span className="text-2xl font-semibold" aria-hidden>{positive ? "+" : "−"}₪</span>
            <input id="mt-amount" autoFocus={!txn} inputMode="decimal" autoComplete="off" required={manual} disabled={!manual || netted} placeholder="0"
              aria-invalid={manual && amount !== "" && !amountOk} value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-40 bg-transparent text-center text-4xl font-bold rounded-lg tabular-nums outline-none placeholder:text-current placeholder:opacity-30 focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-8 disabled:opacity-70" />
          </div>
          {manual && amount !== "" && !amountOk && <p className="mt-1 text-xs text-destructive" role="alert">{t("invalidAmount")}</p>}
        </div>
        <div className={field}>
          <Label htmlFor="mt-desc">{t("description")}</Label>
          <Input id="mt-desc" className={control} maxLength={120} required value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className={field}>
          <span className="text-sm font-medium">{t("category")}</span>
          <CategoryPicker categories={categories} currentId={categoryId} onSelect={setCategoryId} onCreate={() => setNewCat(true)} createLabel={tSettingsCat("newCategoryButton")}
            trigger={<span className={`${control} flex min-w-0 cursor-pointer items-center`}>
              {category ? <CategoryChip color={category.color}>{translateCategoryName(category.name, tCat)}</CategoryChip>
                : <span className="truncate text-muted-foreground">{t("noCategory")}</span>}
            </span>} />
          <NewCategoryDialog open={newCat} onOpenChange={setNewCat} kind={kind} onCreated={(c) => setCategoryId(c.id)} />
        </div>
        <div className={field}>
          <Label htmlFor="mt-date">{t("date")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            {manual && <>
              <button type="button" className={chip(date === today())} aria-pressed={date === today()} onClick={() => setDate(today())}>{t("today")}</button>
              <button type="button" className={chip(date === yesterday)} aria-pressed={date === yesterday} onClick={() => setDate(yesterday)}>{t("yesterday")}</button>
            </>}
            <Input id="mt-date" className={`${control} min-w-0 flex-1`} type="date" required={manual} disabled={!manual} max="2100-01-01" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <details open={hasDetails} className="group rounded-xl border border-border/60">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
            {t("moreDetails")}<ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="flex flex-col gap-4 px-3 pb-3">
            {manual && (
              <div className={field}>
                <Label htmlFor="mt-account">{t("account")}</Label>
                <select id="mt-account" className={control} value={account} onChange={(e) => setAccount(e.target.value)}>
                  <option value="cash">{t("cash")}</option>
                  {accounts.map((a) => <option key={a.accountNumber} value={a.accountNumber}>{`${a.label ?? translateProviderName(a.provider, a.provider, tBanks)} · ${a.accountNumber.slice(-4)}`}</option>)}
                </select>
              </div>
            )}
            <div className={field}>
              <Label htmlFor="mt-memo">{t("notes")}</Label>
              <Input id="mt-memo" className={control} maxLength={500} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
            <div className={field}>
              <Label htmlFor="mt-tags">{t("tags")}</Label>
              <Input id="mt-tags" className={control} value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
            {txn?.kind !== "transfer" && (
              <div className={field}>
                <Label htmlFor="mt-business">{t("businessShare")}</Label>
                <div className="flex items-center gap-2">
                  <Input id="mt-business" className="h-11 w-24 rounded-lg border bg-background px-3 text-base tabular-nums" type="number" inputMode="numeric"
                    min={0} max={100} step={5} placeholder="0" value={businessShare} aria-invalid={!businessOk}
                    onChange={(e) => setBusinessShare(e.target.value)} />
                  <span className="text-sm text-muted-foreground" aria-hidden>%</span>
                </div>
                <p className="text-xs text-pretty text-muted-foreground">{t("businessShareHint")}</p>
                {!businessOk && <p className="text-xs text-destructive" role="alert">{t("businessShareInvalid")}</p>}
              </div>
            )}
            {members.length >= 2 && (
              <div className="flex min-h-11 items-center justify-between gap-3">
                <span className="text-sm font-medium">{t("owner")}</span>
                <OwnerPicker label={tTags("ownerLabel")} value={owner} members={members} onChange={setOwner} />
              </div>
            )}
            {/* Linking changes this row's kind and share, so close: the sheet holds the row from before it. */}
            {txn && <ReceiptsField transactionId={txn.id} />}
            {txn && txn.kind === "expense" && <SharesField transactionId={txn.id} total={txn.chargedAmount} />}
            {txn && <PaybackField txn={txn} refresh={() => { refresh(); close(); }} />}
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="size-5" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} />{t("exclude")}
            </label>
          </div>
        </details>
        {txn && !manual && <p className="text-xs text-muted-foreground">{t("bankNoDelete")}</p>}
      </div>
      {/* Actions stay in reach at the bottom of the sheet. */}
      <div className="sticky bottom-0 mt-auto flex flex-wrap items-center gap-2 border-t border-border/60 bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button type="submit" className="h-11 flex-1" disabled={busy}>{txn ? t("save") : kind === "income" ? t("saveIncome") : t("saveExpense")}</Button>
        {!txn && <Button type="button" variant="ghost" className="h-11" disabled={!amountOk || !description.trim()} title={t("saveTemplate")} aria-label={t("saveTemplate")}
          onClick={() => void storeTemplates(upsertTemplate(templates, { id: crypto.randomUUID(), description: description.trim(), kind, amount: value, categoryId, account, owner })).then(() => toast.success(t("templateSaved")))}>
          <BookmarkPlus className="size-4" aria-hidden /></Button>}
        <Button type="button" variant="outline" className="h-11" onClick={close}>{t("cancel")}</Button>
        {txn && manual && (confirming
          ? <Button type="button" variant="destructive" className="h-11" disabled={busy} onClick={() => void remove()}>{t("confirmDelete")}</Button>
          : <Button type="button" variant="ghost" className="h-11 text-destructive" onClick={() => setConfirming(true)}>{t("delete")}</Button>)}
      </div>

    </form>
  );
}
