"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ClipboardPaste, Copy, Download, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { extractTextRows, importSheet, undoSheetImport, type SheetRowInput } from "@/lib/api";
import { extractedToTable, MAX_TEXT_IMPORT } from "@/lib/text-import";
import {
  buildSheetDrafts,
  emptySheetDraft,
  findSheetHeader,
  guessSheetColumns,
  MAX_SHEET_ROWS,
  needsMapping,
  normalizeSheetRow,
  parseSheetPaste,
  SHEET_CASH_ACCOUNT,
  SHEET_FIELDS,
  SHEET_TEMPLATE_HEADER,
  sheetSummary,
  sheetTemplateCsv,
  type DateOrder,
  type SheetDraft,
  type SheetField,
  type SheetMap,
} from "@/lib/sheet-import";
import { SettingCard } from "@/components/settings/section-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SheetContext {
  accounts: { accountNumber: string; provider: string; label: string | null }[];
  categories: { id: number; name: string; kind: string; color: string | null }[];
  members: { id: string; name: string }[];
  tags: string[];
}

const NONE = "__none__";
const SHARED = "shared";
const CELL =
  "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-footnote outline-none focus-visible:border-primary focus-visible:bg-background";
const shortDate = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

/**
 * The smart sheet: paste anything (a copied spreadsheet block, a bank export, a hand-written list),
 * map what was not recognised, fix cells in place and save. Rows on the cash account become manual
 * rows; rows on a real account join the statement pipeline so the next sync dedupes them.
 */
export function SheetImportCard({ defaultAccount = "" }: { defaultAccount?: string }) {
  const t = useTranslations("sheetImport");
  const queryClient = useQueryClient();
  const [pasteOpen, setPasteOpen] = useState(true);
  const [paste, setPaste] = useState("");
  const [table, setTable] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [map, setMap] = useState<SheetMap | null>(null);
  const [drafts, setDrafts] = useState<SheetDraft[]>([]);
  const [dateOrder, setDateOrder] = useState<DateOrder>("dmy");
  const [positiveIsExpense, setPositiveIsExpense] = useState(true);
  const [account, setAccount] = useState(defaultAccount);
  const [showMapping, setShowMapping] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [manualInclude, setManualInclude] = useState<Set<number>>(new Set());
  // Rows the user unticked: a duplicate starts unticked, everything else starts ticked.
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [applyDate, setApplyDate] = useState("");
  const [suggestions, setSuggestions] = useState<Map<number, string>>(new Map());
  const appliedDefault = useRef("");

  useEffect(() => {
    if (defaultAccount && defaultAccount !== appliedDefault.current) {
      appliedDefault.current = defaultAccount;
      setAccount(defaultAccount);
      setDrafts((ds) => ds.map((d) => (d.account ? d : { ...d, account: defaultAccount })));
    }
  }, [defaultAccount]);

  const context = useQuery({
    queryKey: ["sheet-import-context"],
    queryFn: async () => (await (await fetch("/api/import/sheet")).json()) as SheetContext,
  });

  const options = useMemo(
    () => ({ dateOrder, positiveIsExpense, defaultAccount: account }),
    [dateOrder, positiveIsExpense, account],
  );
  const parsed = useMemo(() => drafts.map((d) => normalizeSheetRow(d, options)), [drafts, options]);
  const badRows = useMemo(() => parsed.flatMap((p, i) => (p.errors.length > 0 ? [i] : [])), [parsed]);

  // Only clean rows go to the server; map its answer back to the draft index.
  const validIndexes = useMemo(() => parsed.flatMap((p, i) => (p.errors.length === 0 ? [i] : [])), [parsed]);
  const payload = useMemo<SheetRowInput[]>(
    () =>
      validIndexes.map((i) => {
        const v = parsed[i].values;
        return {
          date: v.date,
          description: v.description,
          amount: v.amount,
          kind: v.kind,
          account: v.account,
          category: v.category,
          tags: v.tags,
          owner: v.owner,
          businessSharePct: v.businessSharePct,
          memo: v.memo,
        };
      }),
    [validIndexes, parsed],
  );
  const payloadKey = useMemo(() => JSON.stringify(payload), [payload]);

  const check = useQuery({
    queryKey: ["sheet-import-check", payloadKey],
    queryFn: () => importSheet(JSON.parse(payloadKey) as SheetRowInput[], true),
    enabled: payload.length > 0 && badRows.length === 0,
    staleTime: 30_000,
  });

  const duplicateRows = useMemo(() => {
    const out = new Set<number>();
    for (const row of check.data?.rows ?? []) {
      if (row.status !== "duplicate") continue;
      const draftIndex = validIndexes[row.index];
      if (draftIndex != null) out.add(draftIndex);
    }
    return out;
  }, [check.data, validIndexes]);

  const keptIndexes = useMemo(
    () =>
      drafts.flatMap((_, i) => {
        if (parsed[i].errors.length > 0) return [];
        const duplicate = duplicateRows.has(i);
        if (duplicate) return manualInclude.has(i) ? [i] : [];
        return excluded.has(i) ? [] : [i];
      }),
    [drafts, parsed, duplicateRows, manualInclude, excluded],
  );

  const keptSet = useMemo(() => new Set(keptIndexes), [keptIndexes]);
  const summary = useMemo(() => sheetSummary(keptIndexes.map((i) => parsed[i].values)), [keptIndexes, parsed]);
  const ready = keptIndexes.length;

  function loadTable(rows: string[][]) {
    const found = findSheetHeader(rows);
    const hasHeader = found >= 0;
    const headerIndex = hasHeader ? found : 0;
    const guessed = guessSheetColumns(rows[headerIndex] ?? []);
    const nextMap: SheetMap = hasHeader
      ? guessed
      : { ...guessed, date: guessed.date ?? 0, description: guessed.description ?? 1, amount: guessed.amount ?? 2 };
    const body = hasHeader ? rows.slice(headerIndex + 1) : rows;
    setTable(rows);
    setHeaderRow(headerIndex);
    setMap(nextMap);
    setDrafts(buildSheetDrafts(body, nextMap).map((d) => ({ ...d, account: d.account || account })));
    setManualInclude(new Set());
    setExcluded(new Set());
    setSuggestions(new Map());
    setShowMapping(!hasHeader || needsMapping(nextMap));
    setPasteOpen(false);
  }

  function applyPaste() {
    const rows = parseSheetPaste(paste);
    if (rows.length === 0) {
      toast.error(t("pasteEmpty"));
      return;
    }
    if (rows.length > MAX_SHEET_ROWS + 1) {
      toast.error(t("tooMany", { max: MAX_SHEET_ROWS }));
      return;
    }
    loadTable(rows);
  }

  // Import from any text: a statement, a receipt or an email, read by the user's own AI.
  const [reading, setReading] = useState(false);
  async function readWithAI() {
    if (!paste.trim()) return;
    if (paste.length > MAX_TEXT_IMPORT) { toast.error(t("aiTooLong")); return; }
    setReading(true);
    try {
      const { rows } = await extractTextRows(paste);
      if (rows.length === 0) toast.error(t("aiNoRows"));
      else { loadTable(extractedToTable(rows)); toast.success(t("aiFound", { count: rows.length })); }
    } catch (e) {
      const status = (e as { status?: number }).status;
      toast.error(status === 503 ? t("aiNoProvider") : t("aiFailed"));
    } finally { setReading(false); }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error(t("pasteEmpty"));
        return;
      }
      setPaste(text);
      const rows = parseSheetPaste(text);
      if (rows.length > 0) loadTable(rows);
    } catch {
      toast.error(t("clipboardDenied"));
    }
  }

  function remap(field: SheetField, value: string) {
    if (!map) return;
    const next: SheetMap = { ...map, [field]: value === NONE ? null : Number(value) };
    const body = table.slice(findSheetHeader(table) >= 0 ? headerRow + 1 : 0);
    setMap(next);
    setDrafts(buildSheetDrafts(body, next).map((d) => ({ ...d, account: d.account || account })));
  }

  function patch(index: number, field: keyof SheetDraft, value: string) {
    setDrafts((ds) => ds.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  }

  function removeRow(index: number) {
    setDrafts((ds) => ds.filter((_, i) => i !== index));
    // Dropping a row shifts every index below it, so per-row ticks start over.
    setManualInclude(new Set());
    setExcluded(new Set());
  }

  function addRow() {
    if (drafts.length >= MAX_SHEET_ROWS) {
      toast.error(t("tooMany", { max: MAX_SHEET_ROWS }));
      return;
    }
    setDrafts((ds) => [...ds, emptySheetDraft({ account, date: ds[ds.length - 1]?.date ?? applyDate })]);
  }

  function focusCell(row: number, field: SheetField | keyof SheetDraft) {
    document.getElementById(`sheet-cell-${row}-${field}`)?.focus();
  }

  function onCellKeyDown(e: ReactKeyboardEvent<HTMLElement>, row: number, field: keyof SheetDraft) {
    if (e.key === "Enter") {
      e.preventDefault();
      focusCell(row + 1, field);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      const above = drafts[row - 1]?.[field];
      if (above != null) patch(row, field, above);
    }
  }

  function setAllDates() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(applyDate)) return;
    // ISO is unambiguous, so it survives either date order.
    setDrafts((ds) => ds.map((d) => ({ ...d, date: applyDate })));
  }

  const suggest = useMutation({
    mutationFn: async () => {
      const rows = parsed.flatMap((p, i) =>
        p.errors.length === 0 ? [{ i, description: p.values.description, kind: p.values.kind }] : [],
      );
      const res = await fetch("/api/import/sheet/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rows.map(({ description, kind }) => ({ description, kind })) }),
      }).then((r) => r.json() as Promise<{ suggestions?: { index: number; name: string }[] }>);
      const next = new Map<number, string>();
      for (const s of res.suggestions ?? []) if (rows[s.index]) next.set(rows[s.index].i, s.name);
      return next;
    },
    onSuccess: (next) => {
      setSuggestions(next);
      if (next.size === 0) toast.info(t("suggestNone"));
    },
    onError: () => toast.error(t("suggestFailed")),
  });

  function acceptSuggestions() {
    setDrafts((ds) => ds.map((d, i) => (d.category ? d : { ...d, category: suggestions.get(i) ?? d.category })));
    toast.success(t("suggestApplied", { count: suggestions.size }));
  }

  function downloadTemplate() {
    const blob = new Blob([`\uFEFF${sheetTemplateCsv()}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "penny-sheet-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyHeader() {
    try {
      await navigator.clipboard.writeText(SHEET_TEMPLATE_HEADER.join("\t"));
      toast.success(t("headerCopied"));
    } catch {
      toast.error(t("clipboardDenied"));
    }
  }

  const save = useMutation({
    mutationFn: () => importSheet(payload, false),
    onSuccess: (res) => {
      const refresh = () => {
        for (const key of ["transactions", "summary", "home", "sheet-import-context", "sheet-import-check", "import-accounts", "budget"])
          queryClient.invalidateQueries({ queryKey: [key] });
      };
      refresh();
      setDrafts([]);
      setTable([]);
      setMap(null);
      setPaste("");
      setPasteOpen(true);
      setManualInclude(new Set());
      setExcluded(new Set());
      setSuggestions(new Map());
      toast.success(t("saved", { added: res.added, duplicates: res.duplicates, review: res.needsReview }), res.importId
        ? { action: { label: t("undo"), onClick: () => void undoSheetImport(res.importId!).then(refresh) } }
        : undefined);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("saveFailed")),
  });

  function reset() {
    setDrafts([]);
    setTable([]);
    setMap(null);
    setPaste("");
    setPasteOpen(true);
    setManualInclude(new Set());
    setExcluded(new Set());
    setSuggestions(new Map());
  }

  const accounts = useMemo(() => context.data?.accounts ?? [], [context.data]);
  const accountOptions = useMemo(() => {
    const set = new Map<string, string>();
    set.set(SHEET_CASH_ACCOUNT, t("accountCash"));
    for (const a of accounts) set.set(a.accountNumber, a.label || a.accountNumber);
    for (const d of drafts) if (d.account && !set.has(d.account)) set.set(d.account, d.account);
    return [...set.entries()];
  }, [accounts, drafts, t]);

  const hasRows = drafts.length > 0;

  return (
    <SettingCard title={t("title")} description={t("description")}>
      <div className="space-y-4">
        {!hasRows && pasteOpen && (
          <div className="space-y-2">
            <Label htmlFor="sheet-paste">{t("pasteLabel")}</Label>
            <textarea
              id="sheet-paste"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (text.trim()) {
                  e.preventDefault();
                  setPaste(text);
                  const rows = parseSheetPaste(text);
                  if (rows.length > 0 && rows.length <= MAX_SHEET_ROWS + 1) loadTable(rows);
                }
              }}
              rows={4}
              placeholder={t("pastePlaceholder")}
              className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-footnote outline-none focus-visible:border-primary"
              dir="auto"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={applyPaste} disabled={!paste.trim()}>
                <ClipboardPaste className="size-4" aria-hidden />
                {t("loadRows")}
              </Button>
              <Button type="button" variant="outline" onClick={() => void readWithAI()} disabled={!paste.trim() || reading} title={t("aiHint")}>
                <Sparkles className="size-4" aria-hidden />
                {reading ? t("aiReading") : t("aiRead")}
              </Button>
              <Button type="button" variant="outline" onClick={() => void pasteFromClipboard()}>
                {t("fromClipboard")}
              </Button>
              <Button type="button" variant="ghost" onClick={downloadTemplate}>
                <Download className="size-4" aria-hidden />
                {t("template")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => void copyHeader()}>
                <Copy className="size-4" aria-hidden />
                {t("copyHeader")}
              </Button>
            </div>
            <p className="text-caption text-muted-foreground">{t("pasteHint")}</p>
          </div>
        )}

        {hasRows && (
          <>
            <div className="flex flex-wrap items-end gap-2 rounded-xl bg-muted/30 px-3 py-2.5">
              <div className="min-w-40 flex-1 space-y-1">
                <Label htmlFor="sheet-account" className="text-caption">{t("account")}</Label>
                <Select
                  value={account || NONE}
                  onValueChange={(v) => {
                    const next = v === NONE ? "" : v!;
                    setAccount(next);
                    if (next) setDrafts((ds) => ds.map((d) => ({ ...d, account: d.account || next })));
                  }}
                >
                  <SelectTrigger id="sheet-account" className="w-full">
                    <SelectValue>{(v: string) => (v === NONE ? t("accountNone") : accountOptions.find(([id]) => id === v)?.[1] ?? v)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("accountNone")}</SelectItem>
                    {accountOptions.map(([id, label]) => (
                      <SelectItem key={id} value={id}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sheet-date-order" className="text-caption">{t("dateOrder")}</Label>
                <Select value={dateOrder} onValueChange={(v) => v && setDateOrder(v as DateOrder)}>
                  <SelectTrigger id="sheet-date-order" className="w-full">
                    <SelectValue>{(v: string) => (v === "mdy" ? t("dateMdy") : t("dateDmy"))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dmy">{t("dateDmy")}</SelectItem>
                    <SelectItem value="mdy">{t("dateMdy")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  aria-label={t("applyDate")}
                  value={applyDate}
                  onChange={(e) => setApplyDate(e.target.value)}
                  className="w-40"
                />
                <Button type="button" variant="outline" size="sm" disabled={!applyDate} onClick={setAllDates}>
                  {t("applyDateAll")}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
              <button type="button" className="rounded-full bg-muted px-2.5 py-1 hover:bg-muted/70" onClick={() => setPositiveIsExpense((v) => !v)}>
                {positiveIsExpense ? t("signExpense") : t("signIncome")}
              </button>
              <button type="button" className="rounded-full bg-muted px-2.5 py-1 hover:bg-muted/70" onClick={() => setShowExtra((v) => !v)}>
                {showExtra ? t("hideExtra") : t("showExtra")}
              </button>
              <button type="button" className="rounded-full bg-muted px-2.5 py-1 hover:bg-muted/70" onClick={() => setShowMapping((v) => !v)}>
                {showMapping ? t("hideMapping") : t("showMapping")}
              </button>
              <button type="button" className="rounded-full bg-muted px-2.5 py-1 hover:bg-muted/70" onClick={() => suggest.mutate()}>
                <Wand2 className="me-1 inline size-3.5" aria-hidden />
                {suggest.isPending ? t("suggesting") : t("suggest")}
              </button>
              {suggestions.size > 0 && (
                <button type="button" className="rounded-full bg-primary/10 px-2.5 py-1 text-primary hover:bg-primary/15" onClick={acceptSuggestions}>
                  {t("acceptAll", { count: suggestions.size })}
                </button>
              )}
            </div>

            {showMapping && map && (
              <div className="rounded-xl border p-3">
                <p className="mb-2 text-caption text-muted-foreground">{t("mappingHint")}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {SHEET_FIELDS.map((field) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-caption">{t(`column_${field}`)}</Label>
                      <Select value={map[field] == null ? NONE : String(map[field])} onValueChange={(v) => v && remap(field, v)}>
                        <SelectTrigger className="w-full" aria-label={t(`column_${field}`)}>
                          <SelectValue>{(v: string) => (v === NONE ? t("columnNone") : table[headerRow]?.[Number(v)] || `#${Number(v) + 1}`)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>{t("columnNone")}</SelectItem>
                          {(table[headerRow] ?? []).map((h, i) => (
                            <SelectItem key={i} value={String(i)}>{h || `#${i + 1}`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[760px] border-collapse text-footnote">
                <caption className="sr-only">{t("tableCaption")}</caption>
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-8 px-1 py-2"><span className="sr-only">{t("column_include")}</span></th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">{t("column_date")}</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">{t("column_description")}</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">{t("column_amount")}</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">{t("column_kind")}</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">{t("column_account")}</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">{t("column_category")}</th>
                    {showExtra && (
                      <>
                        <th scope="col" className="px-2 py-2 text-start font-medium">{t("column_tags")}</th>
                        <th scope="col" className="px-2 py-2 text-start font-medium">{t("column_owner")}</th>
                        <th scope="col" className="px-2 py-2 text-start font-medium">{t("column_business")}</th>
                        <th scope="col" className="px-2 py-2 text-start font-medium">{t("column_memo")}</th>
                      </>
                    )}
                    <th scope="col" className="w-8 px-1 py-2"><span className="sr-only">{t("column_remove")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((draft, index) => {
                    const row = parsed[index];
                    const fields = new Set(row.errors.map((e) => e.field));
                    const duplicate = duplicateRows.has(index);
                    const kept = keptSet.has(index);
                    const invalid = (field: SheetField) => fields.has(field);
                    const suggestionsForRow = suggestions.get(index);
                    return (
                      <tr key={index} id={`sheet-row-${index}`} className={`border-t ${kept ? "" : "opacity-55"}`}>
                        <td className="px-1 py-1 text-center align-top">
                          <input
                            type="checkbox"
                            checked={kept}
                            aria-label={t("includeRow", { row: index + 1 })}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setExcluded((s) => {
                                const next = new Set(s);
                                if (on) next.delete(index);
                                else next.add(index);
                                return next;
                              });
                              setManualInclude((s) => {
                                const next = new Set(s);
                                if (on) next.add(index);
                                else next.delete(index);
                                return next;
                              });
                            }}
                            className="mt-1.5 size-4 accent-[var(--primary)]"
                          />
                        </td>
                        <td className="px-1 py-1 align-top">
                          <Input
                            id={`sheet-cell-${index}-date`}
                            value={draft.date}
                            onChange={(e) => patch(index, "date", e.target.value)}
                            onKeyDown={(e) => onCellKeyDown(e, index, "date")}
                            aria-invalid={invalid("date")}
                            className={`${CELL} w-24 ${invalid("date") ? "border-[var(--status-over)]" : ""}`}
                            placeholder={t("datePlaceholder")}
                            dir="ltr"
                          />
                        </td>
                        <td className="px-1 py-1 align-top">
                          <Input
                            id={`sheet-cell-${index}-description`}
                            value={draft.description}
                            onChange={(e) => patch(index, "description", e.target.value)}
                            onKeyDown={(e) => onCellKeyDown(e, index, "description")}
                            aria-invalid={invalid("description")}
                            className={`${CELL} min-w-40 ${invalid("description") ? "border-[var(--status-over)]" : ""}`}
                          />
                          {duplicate && <span className="px-1.5 text-caption text-muted-foreground">{t("duplicateRow")}</span>}
                          {suggestionsForRow && !draft.category && (
                            <span className="px-1.5 text-caption text-primary">{t("suggestionChip", { name: suggestionsForRow })}</span>
                          )}
                        </td>
                        <td className="px-1 py-1 align-top">
                          <Input
                            id={`sheet-cell-${index}-amount`}
                            value={draft.amount}
                            onChange={(e) => patch(index, "amount", e.target.value)}
                            onKeyDown={(e) => onCellKeyDown(e, index, "amount")}
                            aria-invalid={invalid("amount")}
                            className={`${CELL} w-24 text-end tabular-nums ${invalid("amount") ? "border-[var(--status-over)]" : ""}`}
                            inputMode="decimal"
                            dir="ltr"
                          />
                        </td>
                        <td className="px-1 py-1 align-top">
                          <Select value={row.values.kind} onValueChange={(v) => v && patch(index, "kind", v)}>
                            <SelectTrigger className="h-8 w-24 border-transparent bg-transparent px-1.5" aria-label={t("column_kind")}>
                              <SelectValue>{(v: string) => (v === "income" ? t("kindIncome") : t("kindExpense"))}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="expense">{t("kindExpense")}</SelectItem>
                              <SelectItem value="income">{t("kindIncome")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1 align-top">
                          <Select value={draft.account || NONE} onValueChange={(v) => v && patch(index, "account", v === NONE ? "" : v)}>
                            <SelectTrigger
                              className={`h-8 w-32 border-transparent bg-transparent px-1.5 ${invalid("account") ? "border-[var(--status-over)]" : ""}`}
                              aria-label={t("column_account")}
                              aria-invalid={invalid("account")}
                            >
                              <SelectValue>{(v: string) => (v === NONE ? t("accountNone") : accountOptions.find(([id]) => id === v)?.[1] ?? v)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>{t("accountNone")}</SelectItem>
                              {accountOptions.map(([id, label]) => (
                                <SelectItem key={id} value={id}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1 align-top">
                          <Select value={draft.category || NONE} onValueChange={(v) => v && patch(index, "category", v === NONE ? "" : v)}>
                            <SelectTrigger className="h-8 w-36 border-transparent bg-transparent px-1.5" aria-label={t("column_category")}>
                              <SelectValue>{(v: string) => (v === NONE ? t("columnNone") : v)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>{t("columnNone")}</SelectItem>
                              {(context.data?.categories ?? [])
                                .filter((c) => c.kind === row.values.kind)
                                .map((c) => (
                                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </td>
                        {showExtra && (
                          <>
                            <td className="px-1 py-1 align-top">
                              <Input
                                id={`sheet-cell-${index}-tags`}
                                value={draft.tags}
                                onChange={(e) => patch(index, "tags", e.target.value)}
                                onKeyDown={(e) => onCellKeyDown(e, index, "tags")}
                                className={`${CELL} w-28`}
                                list="sheet-tags"
                              />
                            </td>
                            <td className="px-1 py-1 align-top">
                              <Select value={draft.owner || NONE} onValueChange={(v) => v && patch(index, "owner", v === NONE ? "" : v)}>
                                <SelectTrigger className="h-8 w-28 border-transparent bg-transparent px-1.5" aria-label={t("column_owner")}>
                                  <SelectValue>{(v: string) =>
                                                    v === NONE ? t("columnNone") : v === SHARED ? t("ownerShared") : context.data?.members.find((m) => m.id === v)?.name ?? v}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE}>{t("columnNone")}</SelectItem>
                                  <SelectItem value={SHARED}>{t("ownerShared")}</SelectItem>
                                  {(context.data?.members ?? []).map((m) => (
                                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-1 py-1 align-top">
                              <Input
                                id={`sheet-cell-${index}-business`}
                                value={draft.business}
                                onChange={(e) => patch(index, "business", e.target.value)}
                                onKeyDown={(e) => onCellKeyDown(e, index, "business")}
                                aria-invalid={invalid("business")}
                                className={`${CELL} w-16 text-end tabular-nums ${invalid("business") ? "border-[var(--status-over)]" : ""}`}
                                inputMode="numeric"
                                dir="ltr"
                              />
                            </td>
                            <td className="px-1 py-1 align-top">
                              <Input
                                id={`sheet-cell-${index}-memo`}
                                value={draft.memo}
                                onChange={(e) => patch(index, "memo", e.target.value)}
                                onKeyDown={(e) => onCellKeyDown(e, index, "memo")}
                                className={`${CELL} w-32`}
                              />
                            </td>
                          </>
                        )}
                        <td className="px-1 py-1 text-center align-top">
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(index)} aria-label={t("removeRow", { row: index + 1 })}>
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="size-4" aria-hidden />
                {t("addRow")}
              </Button>
              <p className="text-caption text-muted-foreground">{t("keyboardHint")}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/30 px-3 py-2.5 text-center sm:grid-cols-4">
              <div>
                <div className="text-body font-semibold tabular-nums">{ready.toLocaleString("he-IL")}</div>
                <div className="text-caption text-muted-foreground">{t("statsRows")}</div>
              </div>
              <div>
                <div className="text-body font-semibold tabular-nums" dir="ltr">₪{summary.expenses.toLocaleString("he-IL")}</div>
                <div className="text-caption text-muted-foreground">{t("statsExpenses")}</div>
              </div>
              <div>
                <div className="text-body font-semibold tabular-nums" dir="ltr">₪{summary.income.toLocaleString("he-IL")}</div>
                <div className="text-caption text-muted-foreground">{t("statsIncome")}</div>
              </div>
              <div>
                <div className="text-body font-semibold tabular-nums" dir="ltr">
                  {summary.from ? `${shortDate(summary.from)}–${shortDate(summary.to!)}` : "—"}
                </div>
                <div className="text-caption text-muted-foreground">{t("statsRange")}</div>
              </div>
            </div>

            {summary.byAccount.length > 1 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
                {summary.byAccount.map((a) => (
                  <li key={a.account}>
                    {accountOptions.find(([id]) => id === a.account)?.[1] ?? a.account}: {a.count} · ₪{a.net.toLocaleString("he-IL")}
                  </li>
                ))}
              </ul>
            )}

            <p className={`text-footnote ${badRows.length > 0 ? "text-[var(--status-over)]" : "text-muted-foreground"}`} aria-live="polite">
              {badRows.length > 0
                ? t("errorCount", { count: badRows.length })
                : t("readyCount", { ready, duplicates: duplicateRows.size })}
              {check.isError && t("checkFailed")}
            </p>

            <div className="flex flex-wrap justify-end gap-2">
              {badRows.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const first = badRows[0];
                    document.getElementById(`sheet-row-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                    focusCell(first, parsed[first].errors[0].field);
                  }}
                >
                  {t("jumpToError")}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={reset}>{t("cancel")}</Button>
              <Button type="button" disabled={ready === 0 || badRows.length > 0 || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? t("saving") : t("save", { count: ready })}
              </Button>
            </div>
          </>
        )}

        <datalist id="sheet-tags">
          {(context.data?.tags ?? []).map((tag) => <option key={tag} value={tag} />)}
        </datalist>
      </div>
    </SettingCard>
  );
}
