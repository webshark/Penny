"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileUp, Upload } from "lucide-react";
import { importStatement, undoStatementImport } from "@/lib/api";
import {
  buildImportRows,
  detectDateOrder,
  fallbackHeaderRow,
  findHeaderRow,
  guessColumns,
  IMPORT_EXTS,
  IMPORT_FIELDS,
  inferPositiveIsExpense,
  MAX_IMPORT_ROWS,
  readStatementTable,
  scanAmounts,
  type DateOrder,
  type ImportMap,
} from "@/lib/file-import";
import { SettingCard } from "@/components/settings/section-shell";
import { ImportGuide } from "@/components/settings/import-guide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "none";
const PREVIEW_ROWS = 5;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const shortDate = (iso: string) => iso.split("-").reverse().join("/");

export function StatementImportCard({ defaultAccount = "" }: { defaultAccount?: string }) {
  const t = useTranslations("fileImport");
  const queryClient = useQueryClient();
  const [table, setTable] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [map, setMap] = useState<ImportMap | null>(null);
  const [dateOrder, setDateOrder] = useState<DateOrder>("dmy");
  const [account, setAccount] = useState(defaultAccount);
  const [positiveIsExpense, setPositiveIsExpense] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  // The institution picked in the manual panel names the account, so imports dedupe per bank.
  const appliedDefault = useRef("");
  useEffect(() => {
    if (defaultAccount && defaultAccount !== appliedDefault.current) {
      appliedDefault.current = defaultAccount;
      setAccount(defaultAccount);
    }
  }, [defaultAccount]);

  const header = table[headerRow] ?? [];
  const { rows, skipped } = useMemo(
    () => (map ? buildImportRows(table.slice(headerRow + 1), map, positiveIsExpense, dateOrder) : { rows: [], skipped: 0 }),
    [table, headerRow, map, positiveIsExpense, dateOrder],
  );
  const tooMany = rows.length > MAX_IMPORT_ROWS;
  const amountOnly = !!map && map.amount != null && map.debit == null && map.credit == null;
  const mappingIncomplete = !!map && (map.date == null || map.description == null || (map.amount == null && map.debit == null && map.credit == null));
  const deferredAccount = useDeferredValue(account.trim());
  // Synced accounts, so a statement lands on the same account as the bank sync and dedupes against it.
  const accounts = useQuery({
    queryKey: ["import-accounts"],
    queryFn: async () => ((await (await fetch("/api/transactions/owners")).json()) as { accounts?: { accountNumber: string; label: string | null; provider: string }[] }).accounts ?? [],
  });

  const check = useQuery({
    queryKey: ["file-import-check", deferredAccount, rows],
    queryFn: () => importStatement(deferredAccount, rows, true, positiveIsExpense ? "card" : "bank"),
    enabled: !!deferredAccount && rows.length > 0 && !tooMany,
  });

  const range = rows.length
    ? {
        from: rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0].date),
        to: rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date),
      }
    : null;
  const expensesTotal = rows.reduce((sum, r) => (r.amount < 0 ? sum - r.amount : sum), 0);

  function reset() {
    setTable([]);
    setMap(null);
    setError(null);
    setInputKey((k) => k + 1);
    setFileName("");
  }

  const save = useMutation({
    mutationFn: () => importStatement(account.trim(), rows, false, positiveIsExpense ? "card" : "bank"),
    onSuccess: (res) => {
      const refresh = () => {
        for (const key of ["transactions", "summary", "home", "file-import-check", "import-accounts"])
          queryClient.invalidateQueries({ queryKey: [key] });
      };
      refresh();
      reset();
      const batchId = res.batchId;
      toast.success(
        res.categorized > 0
          ? t("savedCategorized", { added: res.added, categorized: res.categorized, review: res.needsReview })
          : t("saved", { added: res.added, duplicates: res.duplicates }),
        batchId
          ? { action: { label: t("undo"), onClick: () => void undoStatementImport(batchId).then(refresh) } }
          : undefined,
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("saveFailed")),
  });

  function applyTable(parsed: string[][]) {
    const found = findHeaderRow(parsed);
    const headerIndex = found >= 0 ? found : fallbackHeaderRow(parsed);
    const guessed = guessColumns(parsed[headerIndex] ?? []);
    const body = parsed.slice(headerIndex + 1);
    setTable(parsed);
    setHeaderRow(headerIndex);
    setMap(guessed);
    setDateOrder(detectDateOrder(guessed.date == null ? [] : body.map((r) => r[guessed.date!] ?? "")));
    setPositiveIsExpense(inferPositiveIsExpense(scanAmounts(body, guessed)));
  }

  function changeHeaderRow(next: number) {
    const guessed = guessColumns(table[next] ?? []);
    const body = table.slice(next + 1);
    setHeaderRow(next);
    setMap(guessed);
    setDateOrder(detectDateOrder(guessed.date == null ? [] : body.map((r) => r[guessed.date!] ?? "")));
    setPositiveIsExpense(inferPositiveIsExpense(scanAmounts(body, guessed)));
  }

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    setReading(true);
    setTable([]);
    setMap(null);
    setFileName(file.name);
    try {
      if (file.size > MAX_FILE_BYTES) { setError(t("tooLarge")); return; }
      let parsed: string[][];
      try {
        parsed = await readStatementTable(new Uint8Array(await file.arrayBuffer()), file.name);
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        setError(code === "xlsNotSupported" ? t("xlsNotSupported") : code === "pdf" ? t("pdf") : t("readFailed"));
        return;
      }
      if (parsed.length === 0) { setError(t("emptyFile")); return; }
      applyTable(parsed);
      setAccount((current) => current || file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 40));
    } catch {
      setError(t("readFailed"));
    } finally {
      setReading(false);
    }
  }

  const ready = check.data?.ready ?? rows.length;
  const duplicates = check.data?.duplicates ?? 0;
  const hasTable = table.length > 0 && map != null;

  return (
    <SettingCard title={t("title")} description={t("description")}>
      <div className="space-y-4">
        <details className="rounded-xl bg-muted/40 px-3 py-2">
          <summary className="cursor-pointer text-footnote font-medium">{t("guide.title")}</summary>
          <div className="pt-3"><ImportGuide /></div>
        </details>

        {!hasTable ? (
          <label
            htmlFor="statement-file"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void onFile(e.dataTransfer.files?.[0]); }}
            className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors ${
              dragging ? "border-primary bg-primary/5" : "bg-muted/20 hover:bg-muted/40"
            }`}
          >
            <Upload className="size-6 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">{reading ? t("reading") : t("dropHere")}</span>
            <span className="text-caption text-muted-foreground">{t("fileHint")}</span>
            <input
              key={inputKey}
              id="statement-file"
              type="file"
              accept={`${IMPORT_EXTS.join(",")},text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`}
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="sr-only"
              disabled={reading}
            />
          </label>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <FileUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate font-medium" title={fileName}>{fileName || t("noFile")}</span>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="statement-file" className="cursor-pointer text-caption font-medium text-muted-foreground hover:text-foreground">
                  {t("changeFile")}
                </label>
                <input
                  key={inputKey}
                  id="statement-file"
                  type="file"
                  accept={`${IMPORT_EXTS.join(",")},text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`}
                  onChange={(e) => void onFile(e.target.files?.[0])}
                  className="sr-only"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/30 px-3 py-2.5 text-center">
              <div>
                <div className="text-body font-semibold tabular-nums">{rows.length.toLocaleString("he-IL")}</div>
                <div className="text-caption text-muted-foreground">{t("statsRows")}</div>
              </div>
              <div>
                <div className="text-body font-semibold tabular-nums" dir="ltr">
                  {range ? `${shortDate(range.from)}–${shortDate(range.to)}` : "—"}
                </div>
                <div className="text-caption text-muted-foreground">{t("statsRange")}</div>
              </div>
              <div>
                <div className="text-body font-semibold tabular-nums" dir="ltr">₪{Math.round(expensesTotal).toLocaleString("he-IL")}</div>
                <div className="text-caption text-muted-foreground">{t("statsExpenses")}</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="statement-account">{t("account")}</Label>
              <Input id="statement-account" list="statement-accounts" value={account} maxLength={40} placeholder={t("accountPlaceholder")} onChange={(e) => setAccount(e.target.value)} />
              <datalist id="statement-accounts">{accounts.data?.map((a) => <option key={a.accountNumber} value={a.accountNumber}>{a.label || a.provider}</option>)}</datalist>
              <p className="text-caption text-muted-foreground">{t("accountHint")}</p>
            </div>

            {amountOnly && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2">
                <span className="text-footnote text-muted-foreground">
                  {positiveIsExpense ? t("signCard") : t("signBank")}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPositiveIsExpense((v) => !v)}>
                  {t("flip")}
                </Button>
              </div>
            )}

            {mappingIncomplete && (
              <p className="rounded-xl bg-[color-mix(in_oklch,var(--status-over)_8%,transparent)] px-3 py-2 text-footnote" role="status">
                {t("mappingWarning")}
              </p>
            )}

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-footnote">
                <caption className="sr-only">{t("previewCaption")}</caption>
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t("column_date")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t("column_description")}</th>
                    <th scope="col" className="px-3 py-2 text-end font-medium">{t("column_amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                    <tr key={`${r.date}-${i}`} className="border-t">
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums" dir="ltr">{shortDate(r.date)}</td>
                      <td className="max-w-56 truncate px-3 py-1.5">{r.description}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-end tabular-nums" dir="ltr">{r.amount.toLocaleString("he-IL", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-3 text-center text-muted-foreground">{t("noRows")}</td></tr>
                  )}
                </tbody>
              </table>
              {rows.length > PREVIEW_ROWS && (
                <p className="border-t bg-muted/20 px-3 py-1.5 text-caption text-muted-foreground">
                  {t("previewNote", { shown: PREVIEW_ROWS, total: rows.length })}
                </p>
              )}
            </div>

            <details className="rounded-xl border">
              <summary className="cursor-pointer px-3 py-2 text-footnote font-medium text-muted-foreground">{t("advanced")}</summary>
              <div className="space-y-3 border-t p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {IMPORT_FIELDS.map((f) => (
                    <div key={f} className="space-y-1.5">
                      <Label>{t(`column_${f}`)}</Label>
                      <Select
                        value={map[f] == null ? NONE : String(map[f])}
                        onValueChange={(v) => v && setMap((m) => m && { ...m, [f]: v === NONE ? null : Number(v) })}
                      >
                        <SelectTrigger className="w-full" aria-label={t(`column_${f}`)}>
                          <SelectValue>{(v: string) => (v === NONE ? t("columnNone") : header[Number(v)] || `#${Number(v) + 1}`)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>{t("columnNone")}</SelectItem>
                          {header.map((h, i) => <SelectItem key={i} value={String(i)}>{h || `#${i + 1}`}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="header-row">{t("headerRow")}</Label>
                    <Select value={String(headerRow)} onValueChange={(v) => v && changeHeaderRow(Number(v))}>
                      <SelectTrigger id="header-row" className="w-full">
                        <SelectValue>{(v: string) => t("rowOption", { n: Number(v) + 1 })}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {table.slice(0, 10).map((row, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {t("rowOption", { n: i + 1 })}{row.find((c) => c.trim()) ? ` · ${row.find((c) => c.trim())!.slice(0, 24)}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="date-order">{t("dateOrder")}</Label>
                    <Select value={dateOrder} onValueChange={(v) => v && setDateOrder(v as DateOrder)}>
                      <SelectTrigger id="date-order" className="w-full">
                        <SelectValue>{(v: string) => (v === "mdy" ? t("dateMdy") : t("dateDmy"))}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dmy">{t("dateDmy")}</SelectItem>
                        <SelectItem value="mdy">{t("dateMdy")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </details>

            {skipped > 0 && <p className="text-footnote text-muted-foreground">{t("skipped", { count: skipped })}</p>}

            <p className="text-footnote text-muted-foreground" aria-live="polite">
              {tooMany ? t("tooMany", { max: MAX_IMPORT_ROWS }) : t("summary", { ready, skipped, duplicates })}
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>{t("cancel")}</Button>
              <Button disabled={!account.trim() || ready === 0 || tooMany || save.isPending} onClick={() => save.mutate()}>
                <FileUp className="size-4" aria-hidden />
                {save.isPending ? t("saving") : t("save", { count: ready })}
              </Button>
            </div>
          </>
        )}

        {error && <p className="rounded-xl bg-muted/50 px-3 py-2 text-footnote" role="status">{error}</p>}
      </div>
    </SettingCard>
  );
}
