"use client";

import { shekels } from "@/lib/money";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input, InputGroup } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SectionShell, SettingCard, SettingList, SettingRow } from "@/components/settings/section-shell";
import { StarBanner } from "@/components/settings/star-banner";
import { DataState } from "@/components/ui/data-state";
import { getOwners, getSettings, getSummary, updateSettings } from "@/lib/api";
import { loadPreference, storePreference } from "@/lib/preference-sync";
import { translateProviderName } from "@/lib/i18n-data";
import type { AppSettings } from "@/lib/types";
import type { Locale } from "@/i18n/routing";

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthStartLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Every control saves on change, iOS-style; a toast confirms, an error toast asks to retry. */
function useAutosave(extraKeys: string[] = []) {
  const t = useTranslations("settings.general");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => updateSettings(patch),
    // Optimistic, so a switch or picker moves at once; a failure refetches the truth.
    onMutate: (patch) => queryClient.setQueryData<AppSettings>(["settings"], (old) => (old ? { ...old, ...patch } : old)),
    onSuccess: () => {
      for (const key of ["settings", ...extraKeys]) queryClient.invalidateQueries({ queryKey: [key] });
      toast.success(tCommon("saved"));
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.error(err instanceof Error ? err.message : t("failedToSave"));
    },
  });
}

export default function GeneralSettingsPage() {
  const t = useTranslations("settings.general");
  const tCommon = useTranslations("common");
  const { data: settings, isError, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const { data: summary } = useQuery({
    queryKey: ["summary", monthStartLocalISO(), todayLocalISO()],
    queryFn: () => getSummary({ from: monthStartLocalISO(), to: todayLocalISO() }),
  });

  return (
    <SectionShell title={t("title")} description={t("description")} icon={<SlidersHorizontal aria-hidden />}>
      {settings ? (
        <>
          <MonthlyTargetCard
            key={`target:${settings.monthlyTarget ?? "null"}`}
            initialTarget={settings.monthlyTarget}
            typicalMonthly={summary?.typicalMonthly ?? null}
          />
          <SyncCard key={`time:${settings.autoSyncTime}`} settings={settings} />
          <TransactionDefaultsCard />
        </>
      ) : isError ? (
        <DataState error onRetry={() => void refetch()} />
      ) : (
        <SettingCard>
          <div className="text-sm text-muted-foreground">{tCommon("loading")}</div>
        </SettingCard>
      )}
      <StarBanner />
    </SectionShell>
  );
}

function MonthlyTargetCard({
  initialTarget,
  typicalMonthly,
}: {
  initialTarget: number | null;
  typicalMonthly: number | null;
}) {
  const t = useTranslations("settings.general");
  const locale = useLocale() as Locale;
  const mutation = useAutosave(["summary"]);
  const [value, setValue] = useState(initialTarget != null ? String(initialTarget) : "");

  const parsed = value.trim() === "" ? null : Number(value);
  const valid = parsed == null || (Number.isFinite(parsed) && parsed >= 0);
  const commit = () => {
    if (valid && (parsed ?? null) !== (initialTarget ?? null) && !mutation.isPending) mutation.mutate({ monthlyTarget: parsed });
  };

  return (
    <div id="section-monthly-target">
      <SettingCard title={t("monthlyTargetTitle")} description={t("monthlyTargetDescription")}>
        <SettingRow
          label={t("monthlyTargetLabel")}
          htmlFor="monthly-target"
          hint={typicalMonthly != null ? t("typicalLast3", { amount: shekels(typicalMonthly, locale) }) : t("noPriorHistory")}
        >
          <InputGroup prefix="₪" className="w-40">
            <Input
              id="monthly-target"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder={t("monthlyTargetPlaceholder")}
              className="text-end tabular-nums"
              aria-invalid={!valid || undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
            />
          </InputGroup>
        </SettingRow>
      </SettingCard>
    </div>
  );
}

function SyncCard({ settings }: { settings: AppSettings }) {
  const t = useTranslations("settings.general");
  const tCommon = useTranslations("common");
  const mutation = useAutosave(["summary", "home"]);
  const [time, setTime] = useState(settings.autoSyncTime);
  const timeValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const saveTime = () => {
    if (timeValid && time !== settings.autoSyncTime) mutation.mutate({ autoSyncTime: time });
  };

  return (
    <>
      <SettingCard title={t("syncWindowTitle")} description={t("syncWindowDescription")}>
        <SettingList>
          <SettingRow label={t("monthsToSync")} labelId="sync-months-label" hint={t("banksLimit")}>
            <Select value={String(settings.monthsToSync)} onValueChange={(v) => v && mutation.mutate({ monthsToSync: Number(v) })}>
              <SelectTrigger aria-labelledby="sync-months-label" className="w-40">
                <SelectValue>{(v: string) => `${v} ${v === "1" ? tCommon("month") : tCommon("months")}`}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 6, 12].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m} {m === 1 ? tCommon("month") : tCommon("months")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label={t("payday")} labelId="payday-label" hint={t("paydayHint")}>
            <Select value={String(settings.paydayDay)} onValueChange={(v) => v && mutation.mutate({ paydayDay: Number(v) })}>
              <SelectTrigger aria-labelledby="payday-label" className="w-40">
                <SelectValue>{(v: string) => t("ordinalOfMonth", { ordinal: v })}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {t("ordinalOfMonth", { ordinal: String(d) })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        </SettingList>
      </SettingCard>

      <SettingCard title={t("autoSyncTitle")} description={t("autoSyncDescription")}>
        <SettingList>
          <SettingRow label={t("dailyAutoSync")} htmlFor="auto-sync-toggle" hint={t("runsInIsraelTime")}>
            <Switch
              id="auto-sync-toggle"
              checked={settings.autoSyncEnabled}
              disabled={mutation.isPending}
              onCheckedChange={(v) => mutation.mutate({ autoSyncEnabled: v })}
            />
          </SettingRow>
          {settings.autoSyncEnabled && (
            <SettingRow label={t("timeOfDay")} htmlFor="auto-sync-time" hint={t("timeOfDayHint")}>
              <Input
                id="auto-sync-time"
                type="time"
                dir="ltr"
                value={time}
                aria-invalid={!timeValid || undefined}
                onChange={(e) => setTime(e.target.value)}
                onBlur={saveTime}
                className="w-32 tabular-nums"
              />
            </SettingRow>
          )}
        </SettingList>
      </SettingCard>
    </>
  );
}

/** Default account: where a new manual transaction starts. */
function TransactionDefaultsCard() {
  const t = useTranslations("settings.general");
  const tBanks = useTranslations("banks");
  const qc = useQueryClient();
  const pref = useQuery({ queryKey: ["preference", "transaction-defaults"], queryFn: () => loadPreference("transaction-defaults") });
  const accounts = useQuery({ queryKey: ["owners", "accounts"], queryFn: () => getOwners(todayLocalISO(), todayLocalISO()) }).data?.accounts ?? [];
  const current = (pref.data as { account?: unknown } | null)?.account;
  const value = typeof current === "string" ? current : "cash";
  function save(account: string) {
    const next = { account };
    qc.setQueryData(["preference", "transaction-defaults"], next);
    void storePreference("transaction-defaults", next).then(() => toast.success(t("defaultAccountSaved")), () => toast.error(t("defaultAccountFailed")));
  }
  return (
    <SettingCard title={t("defaultsTitle")} description={t("defaultsDescription")}>
      <SettingRow label={t("defaultAccount")} labelId="default-account-label" hint={t("defaultAccountHint")}>
        <select aria-labelledby="default-account-label" value={value} onChange={(e) => save(e.target.value)} disabled={!pref.isFetched}
          className="h-10 min-w-48 rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring">
          <option value="cash">{t("defaultAccountCash")}</option>
          {accounts.map((a) => <option key={a.accountNumber} value={a.accountNumber}>{`${a.label ?? translateProviderName(a.provider, a.provider, tBanks)} · ${a.accountNumber.slice(-4)}`}</option>)}
        </select>
      </SettingRow>
    </SettingCard>
  );
}
