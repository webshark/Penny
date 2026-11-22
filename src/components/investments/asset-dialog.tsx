"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { studyFundLiquidFrom } from "@/lib/study-fund";
import { toast } from "sonner";
import { createAssets, searchFunds, updateAsset } from "@/lib/api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ASSET_TYPES, LIABILITY_TYPES, type Asset, type AssetInput, type AssetType, type Fund, type FundSource } from "@/lib/types";

const CURRENCIES = ["ILS", "USD", "EUR", "GBP"];
/** Types that usually have a ticker on Yahoo Finance. */
const TICKER_TYPES: AssetType[] = ["stock", "fund", "bond", "crypto", "metal"];
/** Not available before retirement age, as in HaExolidit's split. */
const ILLIQUID_DEFAULT: AssetType[] = ["pension", "real_estate", "vehicle", "business"];
/** Long-term savings with management fees and monthly deposits. */
const SAVINGS_TYPES: AssetType[] = ["pension", "study_fund", "provident"];

export function AssetDialog({
  asset,
  preset,
  onClose,
  onSaved,
}: {
  asset: Asset | "new";
  /** Starting values for a new asset, e.g. from an automatic suggestion. */
  preset?: Partial<AssetInput>;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const t = useTranslations("investments");
  const tp = useTranslations("property");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const initial = asset === "new" ? (preset ? ({ ...preset, symbol: preset.symbol ?? null } as Partial<Asset>) : null) : asset;
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    type: (initial?.type ?? "stock") as AssetType,
    currency: initial?.currency ?? "ILS",
    priced: initial ? initial.symbol != null : true,
    symbol: initial?.symbol ?? "",
    quantity: initial?.quantity?.toString() ?? "",
    manualValue: initial?.manualValue?.toString() ?? "",
    costBasis: initial?.costBasis?.toString() ?? "",
    costFx: initial?.costFx?.toString() ?? "",
    liquid: initial?.liquid ?? true,
    feeDeposit: initial?.feeDeposit?.toString() ?? "",
    feeBalance: initial?.feeBalance?.toString() ?? "",
    monthlyDeposit: initial?.monthlyDeposit?.toString() ?? "",
    interestRate: initial?.interestRate?.toString() ?? "",
    monthlyPayment: initial?.monthlyPayment?.toString() ?? "",
    fundId: initial?.fundId ?? null,
    fundSource: initial?.fundSource ?? null,
    city: initial?.city ?? "",
    street: initial?.street ?? "",
    rooms: initial?.rooms?.toString() ?? "",
    sizeM2: initial?.sizeM2?.toString() ?? "",
    purchasePrice: initial?.purchasePrice?.toString() ?? "",
    purchaseMonth: initial?.purchaseMonth ?? "",
  });
  const opt = (s: string) => (s.trim() === "" ? null : Number(s));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const canPrice = TICKER_TYPES.includes(form.type);
  const priced = canPrice && form.priced;
  const isLiability = (LIABILITY_TYPES as readonly string[]).includes(form.type);
  const hasFees = SAVINGS_TYPES.includes(form.type);
  const isHome = form.type === "real_estate";
  const isStudyFund = form.type === "study_fund";
  const locale = useLocale();
  const monthLabel = (m: string) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${m}-15T12:00:00`));
  const liquidFrom = isStudyFund && form.purchaseMonth ? studyFundLiquidFrom(form.purchaseMonth) : null;

  const mutation = useMutation({
    mutationFn: () => {
      const input: AssetInput = {
        name: form.name,
        type: form.type,
        currency: form.currency,
        symbol: priced ? form.symbol : null,
        quantity: priced ? Number(form.quantity) : null,
        manualValue: priced ? null : Number(form.manualValue),
        costBasis: form.costBasis ? Number(form.costBasis) : null,
        costFx: form.currency !== "ILS" ? opt(form.costFx) : null,
        liquid: form.liquid,
        note: initial?.note ?? null,
        feeDeposit: hasFees ? opt(form.feeDeposit) : null,
        feeBalance: hasFees ? opt(form.feeBalance) : null,
        monthlyDeposit: hasFees ? opt(form.monthlyDeposit) : null,
        interestRate: isLiability ? opt(form.interestRate) : null,
        monthlyPayment: isLiability ? opt(form.monthlyPayment) : null,
        fundId: hasFees ? form.fundId : null,
        fundSource: hasFees ? form.fundSource : null,
        ...(isHome && {
          city: form.city || null,
          street: form.street || null,
          rooms: opt(form.rooms),
          sizeM2: opt(form.sizeM2),
          purchasePrice: opt(form.purchasePrice),
          purchaseMonth: form.purchaseMonth || null,
        }),
        ...(isStudyFund && { purchaseMonth: form.purchaseMonth || null }),
      };
      return asset !== "new" ? updateAsset(asset.id, input).then(() => undefined) : createAssets([input]).then(() => undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("saved"));
      onSaved?.();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || t("saveFailed")),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{asset !== "new" ? t("editTitle") : t("addTitle")}</DialogTitle>
        </DialogHeader>
        <form
          id="asset-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="asset-name">{t("fieldName")}</Label>
            <Input id="asset-name" required maxLength={80} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={t("namePlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("fieldType")}</Label>
              <Select
                value={form.type}
                onValueChange={(v) => {
                  if (!v) return;
                  const type = v as AssetType;
                  setForm((f) => ({ ...f, type, liquid: !ILLIQUID_DEFAULT.includes(type) }));
                }}
              >
                <SelectTrigger aria-label={t("fieldType")} className="w-full"><SelectValue>{(v: string) => t(`type_${v}`)}</SelectValue></SelectTrigger>
                <SelectContent>
                  {[...ASSET_TYPES, ...LIABILITY_TYPES].map((v) => (
                    <SelectItem key={v} value={v}>{t(`type_${v}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("fieldCurrency")}</Label>
              <Select value={form.currency} onValueChange={(v) => v && set("currency", v)}>
                <SelectTrigger aria-label={t("fieldCurrency")} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {canPrice && (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-footnote">
              <span>
                <span className="block font-medium">{t("livePrice")}</span>
                <span className="text-muted-foreground">{t("livePriceHint")}</span>
              </span>
              <Switch checked={form.priced} onCheckedChange={(v) => set("priced", v)} />
            </label>
          )}

          {priced ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset-symbol">{t("fieldSymbol")}</Label>
                <Input id="asset-symbol" required dir="ltr" value={form.symbol} onChange={(e) => set("symbol", e.target.value)} placeholder="VOO / TEVA.TA" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-qty">{t("fieldQuantity")}</Label>
                <Input id="asset-qty" required type="number" inputMode="decimal" min="0" step="any" dir="ltr" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="asset-value">{isLiability ? t("fieldBalance") : t("fieldValue")}</Label>
              <Input id="asset-value" required type="number" inputMode="decimal" min="0" step="any" dir="ltr" value={form.manualValue} onChange={(e) => set("manualValue", e.target.value)} />
            </div>
          )}

          {hasFees && (
            <FundPicker
              source={form.type === "pension" ? "pension" : "gemel"}
              selectedId={form.fundId}
              onPick={(f) =>
                setForm((cur) => ({
                  ...cur,
                  name: cur.name || f.name,
                  fundId: f.id,
                  fundSource: f.source,
                  feeBalance: f.feeBalance?.toString() ?? cur.feeBalance,
                  feeDeposit: f.feeDeposit?.toString() ?? cur.feeDeposit,
                }))
              }
              onClear={() => setForm((cur) => ({ ...cur, fundId: null, fundSource: null }))}
            />
          )}
          {hasFees && (
            <div className="grid grid-cols-3 gap-3">
              <NumField id="asset-fee-balance" label={t("fieldFeeBalance")} value={form.feeBalance} onChange={(v) => set("feeBalance", v)} />
              <NumField id="asset-fee-deposit" label={t("fieldFeeDeposit")} value={form.feeDeposit} onChange={(v) => set("feeDeposit", v)} />
              <NumField id="asset-deposit" label={t("fieldMonthlyDeposit")} value={form.monthlyDeposit} onChange={(v) => set("monthlyDeposit", v)} />
            </div>
          )}

          {isStudyFund && (
            <div className="space-y-1.5">
              <Label htmlFor="fund-opened">{t("fieldOpened")}</Label>
              <Input id="fund-opened" type="month" dir="ltr" value={form.purchaseMonth} onChange={(e) => set("purchaseMonth", e.target.value)} aria-describedby="fund-opened-hint" />
              <p id="fund-opened-hint" className="text-caption text-pretty text-muted-foreground">
                {liquidFrom ? t("fieldOpenedLiquid", { date: monthLabel(liquidFrom) }) : t("fieldOpenedHint")}
              </p>
            </div>
          )}

          {isHome && (
            <fieldset className="space-y-3 rounded-xl border border-border p-3">
              <legend className="px-1 text-footnote font-medium">{tp("detailsTitle")}</legend>
              <div className="grid grid-cols-2 gap-3">
                <NumField id="home-price" label={tp("purchasePrice")} value={form.purchasePrice} onChange={(v) => set("purchasePrice", v)} />
                <div className="space-y-1.5">
                  <Label htmlFor="home-month">{tp("purchaseMonth")}</Label>
                  <Input id="home-month" type="month" dir="ltr" value={form.purchaseMonth} onChange={(e) => set("purchaseMonth", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="home-city">{tp("city")}</Label>
                  <Input id="home-city" maxLength={60} value={form.city} onChange={(e) => set("city", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="home-street">{tp("street")}</Label>
                  <Input id="home-street" maxLength={80} value={form.street} onChange={(e) => set("street", e.target.value)} />
                </div>
                <NumField id="home-rooms" label={tp("rooms")} value={form.rooms} onChange={(v) => set("rooms", v)} />
                <NumField id="home-size" label={tp("sizeM2")} value={form.sizeM2} onChange={(v) => set("sizeM2", v)} />
              </div>
              <p className="text-caption text-pretty text-muted-foreground">{tp("detailsHint")}</p>
            </fieldset>
          )}

          {isLiability && (
            <div className="grid grid-cols-3 gap-3">
              <NumField id="asset-rate" label={t("fieldInterestRate")} value={form.interestRate} onChange={(v) => set("interestRate", v)} />
              <NumField id="asset-payment" label={t("fieldMonthlyPayment")} value={form.monthlyPayment} onChange={(v) => set("monthlyPayment", v)} />
              <NumField id="asset-original" label={t("fieldOriginal")} value={form.costBasis} onChange={(v) => set("costBasis", v)} />
            </div>
          )}

          {!isLiability && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="asset-cost">{t("fieldCost")}</Label>
                <Input id="asset-cost" type="number" inputMode="decimal" min="0" step="any" dir="ltr" value={form.costBasis} onChange={(e) => set("costBasis", e.target.value)} />
                <p className="text-caption text-muted-foreground">{t("fieldCostHint")}</p>
              </div>
              {form.currency !== "ILS" && form.costBasis && (
                <div className="space-y-1.5">
                  <Label htmlFor="asset-cost-fx">{t("fieldCostFx", { currency: form.currency })}</Label>
                  <Input id="asset-cost-fx" type="number" inputMode="decimal" min="0" step="any" dir="ltr" value={form.costFx} onChange={(e) => set("costFx", e.target.value)} aria-describedby="asset-cost-fx-hint" />
                  <p id="asset-cost-fx-hint" className="text-caption text-pretty text-muted-foreground">{t("fieldCostFxHint")}</p>
                </div>
              )}
              {!liquidFrom && <label className="flex items-center justify-between gap-3 text-footnote">
                <span>
                  <span className="block font-medium">{t("fieldLiquid")}</span>
                  <span className="text-muted-foreground">{t("fieldLiquidHint")}</span>
                </span>
                <Switch checked={form.liquid} onCheckedChange={(v) => set("liquid", v)} />
              </label>}
            </>
          )}
        </form>
        <DialogFooter>
          <IconButton showLabel label={tc("cancel")} variant="outline" onClick={onClose}><X className="size-4" aria-hidden /></IconButton>
          <IconButton showLabel label={mutation.isPending ? t("saving") : t("save")} variant="default" type="submit" form="asset-form" disabled={mutation.isPending}>
            <Check className="size-4" aria-hidden />
          </IconButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="decimal" min="0" step="any" dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Find the fund in the Finance Ministry's public data; picking it fills the fund's average fees. */
function FundPicker({
  source,
  selectedId,
  onPick,
  onClear,
}: {
  source: FundSource;
  selectedId: number | null;
  onPick: (f: Fund) => void;
  onClear: () => void;
}) {
  const t = useTranslations("investments");
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["funds", source, q],
    queryFn: () => searchFunds(source, q),
    enabled: q.trim().length >= 2,
    staleTime: 60 * 60 * 1000,
  });
  const results = query.data?.funds ?? [];

  return (
    <div className="space-y-1.5">
      <Label htmlFor="fund-search">{t("fundSearch")}</Label>
      {selectedId ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-footnote">
          <span>{t("fundLinked", { id: selectedId })}</span>
          <button type="button" className="text-primary underline underline-offset-4" onClick={onClear}>{t("fundUnlink")}</button>
        </div>
      ) : (
        <>
          <Input id="fund-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("fundSearchPlaceholder")} autoComplete="off" />
          {results.length > 0 && (
            <ul className="max-h-48 overflow-y-auto overscroll-contain rounded-xl bg-muted p-1" aria-label={t("fundSearch")}>
              {results.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(f);
                      setQ("");
                    }}
                    className="w-full rounded-lg px-2.5 py-1.5 text-start text-footnote hover:bg-card focus-visible:bg-card"
                  >
                    <span className="block truncate font-medium">{f.name}</span>
                    <span className="block text-caption text-muted-foreground tabular-nums">
                      {t("fundLine", { fee: f.feeBalance ?? "—", deposit: f.feeDeposit ?? 0, avg5y: f.avg5y ?? "—" })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && query.isSuccess && results.length === 0 && (
            <p className="text-caption text-muted-foreground">{t("fundNone")}</p>
          )}
        </>
      )}
      <p className="text-caption text-pretty text-muted-foreground">{t("fundHint")}</p>
    </div>
  );
}
