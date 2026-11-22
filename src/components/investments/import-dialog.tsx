"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createAssets } from "@/lib/api";
import { parseAmount, parseCsv } from "@/lib/csv";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileUp, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ASSET_TYPES, type AssetInput, type AssetType } from "@/lib/types";

const FIELDS = ["name", "symbol", "quantity", "value", "cost", "currency", "feeBalance", "feeDeposit", "deposit"] as const;
type Field = (typeof FIELDS)[number];
const NONE = "__none";
const MAX_BYTES = 2 * 1024 * 1024;

/** Guess which column holds a field from common English and Hebrew broker headers. */
const GUESS: Record<Field, RegExp> = {
  name: /name|description|security|שם|נייר/i,
  symbol: /symbol|ticker|סימול|מספר נייר/i,
  quantity: /quantity|qty|shares|units|כמות/i,
  value: /market value|value|שווי|יתרה|צביר|סך החיסכון/i,
  cost: /cost|basis|עלות/i,
  currency: /currency|מטבע/i,
  // Pension clearinghouse / Har HaKesef report headers.
  feeBalance: /דמי ניהול.*(צביר|יתר)|fee.*balance/i,
  feeDeposit: /דמי ניהול.*הפקד|fee.*deposit/i,
  deposit: /הפקדה חודשית|הפקדות חודשיות|monthly deposit/i,
};

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("investments");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<Field, number | null>>(Object.fromEntries(FIELDS.map((f) => [f, null])) as Record<Field, number | null>);
  const [type, setType] = useState<AssetType>("stock");
  const header = rows[0] ?? [];
  const body = rows.slice(1);

  const assets = useMemo<AssetInput[]>(() => {
    const cell = (r: string[], f: Field) => (map[f] == null ? "" : r[map[f]!] ?? "");
    return body.flatMap((r) => {
      const name = cell(r, "name") || cell(r, "symbol");
      const symbol = cell(r, "symbol").trim() || null;
      const quantity = parseAmount(cell(r, "quantity"));
      const value = parseAmount(cell(r, "value"));
      // Live price needs a symbol and a quantity; otherwise fall back to the file's value.
      const live = symbol != null && quantity != null && map.symbol != null;
      if (!name || (!live && value == null)) return [];
      const currency = cell(r, "currency").toUpperCase();
      return [{
        name,
        type,
        currency: /^[A-Z]{3}$/.test(currency) ? currency : "ILS",
        symbol: live ? symbol : null,
        quantity: live ? Math.abs(quantity) : null,
        manualValue: live ? null : Math.abs(value!),
        costBasis: parseAmount(cell(r, "cost")),
        liquid: type !== "pension",
        note: null,
        feeBalance: parseAmount(cell(r, "feeBalance")),
        feeDeposit: parseAmount(cell(r, "feeDeposit")),
        monthlyDeposit: parseAmount(cell(r, "deposit")),
        interestRate: null,
        monthlyPayment: null,
      }];
    });
  }, [body, map, type]);

  const mutation = useMutation({
    mutationFn: () => createAssets(assets),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("imported", { count: res.created }));
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || t("importFailed")),
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error(t("fileTooBig"));
      return;
    }
    const parsed = parseCsv(await file.text());
    setRows(parsed);
    const head = parsed[0] ?? [];
    const guessed = Object.fromEntries(
      FIELDS.map((f) => {
        const i = head.findIndex((h) => GUESS[f].test(h));
        return [f, i >= 0 ? i : null];
      })
    ) as Record<Field, number | null>;
    // "Market value" also matches cost columns loosely; keep the two apart.
    if (guessed.value != null && guessed.value === guessed.cost) guessed.cost = null;
    // A fee column can also mention balance or deposit; fees win over value and deposit.
    for (const f of ["feeBalance", "feeDeposit"] as const) {
      if (guessed[f] != null && guessed.value === guessed[f]) guessed.value = null;
      if (guessed[f] != null && guessed.deposit === guessed[f]) guessed.deposit = null;
    }
    setMap(guessed);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("importTitle")}</DialogTitle>
          <DialogDescription>{t("importHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="csv-file">{t("csvFile")}</Label>
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="block w-full text-footnote file:me-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-footnote file:font-medium file:text-secondary-foreground"
            />
          </div>

          {header.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <div key={f} className="space-y-1.5">
                    <Label>{t(`column_${f}`)}</Label>
                    <Select
                      value={map[f] == null ? NONE : String(map[f])}
                      onValueChange={(v) => v && setMap((m) => ({ ...m, [f]: v === NONE ? null : Number(v) }))}
                    >
                      <SelectTrigger aria-label={t(`column_${f}`)} className="w-full">
                        <SelectValue>{(v: string) => (v === NONE ? t("columnNone") : header[Number(v)])}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t("columnNone")}</SelectItem>
                        {header.map((h, i) => <SelectItem key={i} value={String(i)}>{h || `#${i + 1}`}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>{t("importType")}</Label>
                <Select value={type} onValueChange={(v) => v && setType(v as AssetType)}>
                  <SelectTrigger aria-label={t("importType")} className="w-full"><SelectValue>{(v: string) => t(`type_${v}`)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((v) => <SelectItem key={v} value={v}>{t(`type_${v}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-footnote text-muted-foreground" aria-live="polite">
                {t("importPreview", { ready: assets.length, total: body.length })}
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <IconButton showLabel label={tc("cancel")} variant="outline" onClick={onClose}><X className="size-4" aria-hidden /></IconButton>
          <IconButton showLabel label={mutation.isPending ? t("saving") : t("importButton", { count: assets.length })} variant="default" disabled={assets.length === 0 || mutation.isPending} onClick={() => mutation.mutate()}>
            <FileUp className="size-4" aria-hidden />
          </IconButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
