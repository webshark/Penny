"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { InstitutionGrid, InstitutionTile } from "@/components/settings/institution-grid";
import { INVESTMENT_HOUSES } from "@/lib/investment-houses";
import { INTERACTIVE, isPensionFund, LOGIN_FIELDS } from "@/lib/pension";
import { deletePension, listPension, pensionAction, type PensionConnection } from "@/lib/api";
import { formatLastSync } from "@/lib/formatters";
import { useFormatterLabels } from "@/lib/i18n-data";
import { PensionReportImport } from "./pension-report-import";

/** Investment houses: Meitav, Harel and Migdal connect and sync balances into assets; the rest are listed as coming soon. */
export function InvestmentHouses() {
  const t = useTranslations("settings.bank");
  const locale = useLocale();
  const labels = useFormatterLabels();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["pension"],
    queryFn: listPension,
    // Poll only while a sync runs or waits for the SMS code.
    refetchInterval: (q) => (q.state.data?.connections.some((c) => c.state === "running" || c.state === "otp") ? 2000 : false),
  });
  const [form, setForm] = useState<{ fundId: string; id: string; phone: string } | null>(null);
  const [codes, setCodes] = useState<Record<number, string>>({});
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["pension"] }); void qc.invalidateQueries({ queryKey: ["assets"] }); };
  const act = useMutation({
    mutationFn: pensionAction,
    onSuccess: () => { setForm(null); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("pensionFailed")),
  });
  const byFund = new Map((list.data?.connections ?? []).map((c) => [c.fundId, c]));
  const otpConnection = (list.data?.connections ?? []).find((c) => c.state === "otp");
  const editingHouse = form ? INVESTMENT_HOUSES.find((h) => h.id === form.fundId) : null;

  const statusLine = (c: PensionConnection) =>
    c.state === "running" ? t("pensionRunning")
    : c.state === "error" || (c.state === "idle" && c.lastError) ? t("pensionError", { message: c.message ?? c.lastError ?? "" })
    : c.lastSyncAt ? t("lastSync", { time: formatLastSync(`${c.lastSyncAt.replace(" ", "T")}Z`, labels) })
    : t("statusNeverSynced");

  return (
    <section aria-labelledby="investment-houses" className="space-y-3">
      <div className="mb-2 flex items-center gap-1 px-4">
        <h3 id="investment-houses" className="text-sm font-semibold text-muted-foreground">{t("groupInvestment")}</h3>
        <InfoTip text={t("investmentNote")} />
      </div>

      <InstitutionGrid>
        {[...INVESTMENT_HOUSES].sort((x, y) => (locale === "he" ? x.name.he.localeCompare(y.name.he, "he") : x.name.en.localeCompare(y.name.en, "en"))).map((h) => {
          const name = locale === "he" ? h.name.he : h.name.en;
          const wired = isPensionFund(h.id);
          const c = byFund.get(h.id);
          return (
            <InstitutionTile
              key={h.id}
              label={name}
              color={h.color}
              domain={h.domain}
              subline={c ? <span role="status">{statusLine(c)}</span> : undefined}
            >
              {!wired ? (
                <span className="self-start rounded-full bg-muted px-2.5 py-1 text-caption text-muted-foreground">{t("comingSoon")}</span>
              ) : c ? (
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" disabled={c.state === "running" || c.state === "otp"} onClick={() => act.mutate({ sync: c.id })}>{t("syncShort")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void deletePension(c.id).then(refresh)}>{t("pensionDisconnect")}</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" aria-label={`${t("connect")} · ${name}`} onClick={() => setForm({ fundId: h.id, id: "", phone: "" })}>{t("connect")}</Button>
              )}
            </InstitutionTile>
          );
        })}
      </InstitutionGrid>

      {/* The login form lives under the grid so the tiles stay one shape. */}
      {form && editingHouse && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-2xl bg-card px-4 py-3"
          onSubmit={(e) => { e.preventDefault(); act.mutate({ fundId: form.fundId, id: form.id, phone: form.phone }); }}
        >
          <p className="basis-full text-sm font-medium">
            {t("connect")} · {locale === "he" ? editingHouse.name.he : editingHouse.name.en}
          </p>
          <label className="grid gap-1 text-xs">{t("pensionId")}
            <Input inputMode="numeric" autoComplete="off" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} required className="w-40" />
          </label>
          {LOGIN_FIELDS[form.fundId as keyof typeof LOGIN_FIELDS].includes("phone") && (
            <label className="grid gap-1 text-xs">{t("pensionPhone")}
              <Input inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required className="w-40" />
            </label>
          )}
          <Button type="submit" size="sm" disabled={act.isPending}>{t("connect")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setForm(null)}>{t("pensionCancel")}</Button>
          <p className="basis-full text-caption text-muted-foreground">{INTERACTIVE[form.fundId as keyof typeof INTERACTIVE] ? t("pensionInteractive") : t("pensionOtpHint")}</p>
        </form>
      )}

      {otpConnection && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-2xl bg-card px-4 py-3"
          onSubmit={(e) => { e.preventDefault(); act.mutate({ otp: otpConnection.id, code: codes[otpConnection.id] ?? "" }); }}
        >
          <label className="grid gap-1 text-xs">{t("pensionCode")}
            <Input inputMode="numeric" autoComplete="one-time-code" autoFocus value={codes[otpConnection.id] ?? ""} onChange={(e) => setCodes({ ...codes, [otpConnection.id]: e.target.value })} required className="w-32" />
          </label>
          <Button type="submit" size="sm">{t("pensionSend")}</Button>
        </form>
      )}
      <PensionReportImport />
    </section>
  );
}
