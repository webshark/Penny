"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SyncActions } from "@/components/layout/sidebar-sync";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { RefreshCw, Loader2, CircleCheck, CircleAlert, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Segmented } from "@/components/ui/segmented";
import { SectionShell } from "@/components/settings/section-shell";
import { InstitutionGrid, InstitutionTile } from "@/components/settings/institution-grid";
import { ManualImport } from "@/components/settings/manual-import";
import { ScraperDisclaimer } from "@/components/settings/scraper-disclaimer";
import { DangerZone, ExcludedMerchantsCard, ShowBrowserCard } from "@/components/settings/data-cards";
import { ExportCard } from "@/components/settings/export-card";
import { DiagnosticsCard } from "@/components/settings/diagnostics-card";
import { AutoBackupCard } from "@/components/settings/auto-backup-card";
import { BackupCard } from "@/components/settings/backup-card";
import { WipeCard } from "@/components/settings/wipe-card";
import { BankDetailSheet } from "@/components/settings/bank-detail-sheet";
import { useBankSync } from "@/components/settings/use-bank-sync";
import { listIntegrations } from "@/lib/api";
import { BANK_PROVIDERS } from "@/lib/types";
import { translateProviderName, useFormatterLabels } from "@/lib/i18n-data";
import { formatLastSync } from "@/lib/formatters";
import type { Integration } from "@/lib/types";
import { InvestmentHouses } from "@/components/settings/investment-houses";
import { OpenBankingCard } from "@/components/settings/open-banking-card";

interface SheetState {
  open: boolean;
  mode: "edit" | "add";
  providerId: string | null;
  credentialId: number | null;
}

/** Open banking first, then the scraper, then a file. */
type Mode = "openBanking" | "auto" | "manual";

export default function BankSettingsPage() {
  const t = useTranslations("settings.bank");
  const tBanks = useTranslations("banks");
  const labels = useFormatterLabels();
  const locale = useLocale();
  const params = useSearchParams();
  // Three lanes: an API, a scraper that keeps itself current, or a one-off file snapshot.
  const [mode, setMode] = useState<Mode>(() => {
    const requested = params.get("mode");
    return requested === "auto" || requested === "manual" ? requested : "openBanking";
  });

  const { data: integrations = [], isPending, isError, refetch } = useQuery({
    queryKey: ["integrations"],
    queryFn: listIntegrations,
  });
  const openBanking = integrations.find((i) => i.provider === "openBanking") ?? null;
  // Each tab owns its own connections; an open banking account is not a scraped one.
  const scraped = integrations.filter((i) => i.provider !== "openBanking");
  const { start, stateFor } = useBankSync();
  const [sheet, setSheet] = useState<SheetState>({
    open: false,
    mode: "edit",
    providerId: null,
    credentialId: null,
  });

  const lastSync = useMemo(() => {
    const stamps = integrations
      .map((i) => i.lastSyncAt)
      .filter((s): s is string => Boolean(s));
    if (stamps.length === 0) return null;
    return stamps.sort().slice(-1)[0];
  }, [integrations]);

  // Open banking has its own tab, so it never shows up as a bank to scrape.
  const availableToAdd = BANK_PROVIDERS.filter((b) => b.enabled && b.id !== "openBanking");

  const sheetIntegration: Integration | null =
    sheet.mode === "edit" && sheet.credentialId != null
      ? integrations.find((i) => i.id === sheet.credentialId) ?? null
      : null;

  // Count only the scraped connections: open banking lives in its own tab and is not in this list.
  const countLabel =
    scraped.length === 1
      ? t("banksConnectedOne", { count: scraped.length })
      : t("banksConnectedOther", { count: scraped.length });

  return (
    <>
      <SectionShell title={t("title")} description={t("description")} icon={<Landmark aria-hidden />}>
        <div className="space-y-2 px-4">
          <Segmented<Mode>
            label={t("modeLabel")}
            value={mode}
            onChange={setMode}
            variant="track"
            options={[
              { value: "openBanking", label: t("modeOpenBanking") },
              { value: "auto", label: t("modeAuto") },
              { value: "manual", label: t("modeManual") },
            ]}
          />
          {/* What the picked way actually does, so the choice is made on facts rather than a label. */}
          <p aria-live="polite" className="text-footnote leading-5 text-muted-foreground">
            {t(mode === "openBanking" ? "modeOpenBankingHint" : mode === "auto" ? "modeAutoHint" : "modeManualHint")}
          </p>
        </div>

        {mode === "openBanking" ? (
          <OpenBankingCard
            connected={openBanking}
            onOpen={() =>
              setSheet({
                open: true,
                mode: "edit",
                providerId: "openBanking",
                credentialId: openBanking?.id ?? null,
              })
            }
          />
        ) : mode === "manual" ? (
          <ManualImport />
        ) : (
          <>
            <ScraperDisclaimer />

            <div id="connect" className="flex scroll-mt-20 flex-wrap items-center justify-between gap-2">
              <div className="px-4 text-footnote text-muted-foreground">
                {!isPending && !isError && countLabel}
                {lastSync ? (
                  <>
                    {" · "}
                    <span className="text-foreground/80">
                      {t("lastSync", { time: formatLastSync(lastSync, labels) })}
                    </span>
                  </>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Suspense fallback={null}><SyncActions /></Suspense>
              </div>
            </div>

            {isPending ? <p role="status">{t("loading")}</p> : isError ? <div role="alert"><p>{t("loadFailed")}</p><Button variant="outline" className="mt-3" onClick={() => void refetch()}>{t("retry")}</Button></div> : scraped.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                {t.rich("noneConnectedPrompt", {
                  addBankBold: (chunks) => <b>{chunks}</b>,
                })}
              </div>
            ) : (
              <section aria-labelledby="banks-connected" className="space-y-3">
              <h3 id="banks-connected" className="mb-2 px-4 text-sm font-semibold text-muted-foreground">{t("groupConnected", { count: scraped.length })}</h3>
              <InstitutionGrid>
                  {[...scraped].sort((x, y) => x.label.localeCompare(y.label, locale)).map((integration) => {
                    const info = BANK_PROVIDERS.find(
                      (b) => b.id === integration.provider
                    );
                    if (!info) return null;
                    const sync = stateFor(integration.id);
                    const localName = translateProviderName(info.id, info.name, tBanks);
                    const openSheet = () =>
                      setSheet({
                        open: true,
                        mode: "edit",
                        providerId: integration.provider,
                        credentialId: integration.id,
                      });
                    const subline = integration.lastSyncAt
                      ? t("transactionsCountWithSync", {
                          count: integration.transactionCount,
                          time: formatLastSync(integration.lastSyncAt, labels),
                        })
                      : t("transactionsCountNever", {
                          count: integration.transactionCount,
                        });
                    return (
                      <InstitutionTile
                        key={integration.id}
                        label={integration.label}
                        color={info.color}
                        domain={info.domain}
                        labelFor={t("openDetails", { name: `${integration.label} (${localName})` })}
                        onClick={openSheet}
                        subline={`${localName} · ${t(info.kind === "bank" ? "kindBank" : "kindCard")} · ${subline}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <StatusPill lastSyncAt={integration.lastSyncAt} syncing={sync.syncing} />
                          <SyncShortButton syncing={sync.syncing} stage={sync.stage} onClick={() => start(integration.id)} />
                        </div>
                      </InstitutionTile>
                    );
                  })}
              </InstitutionGrid>
              </section>
            )}
            {/* Every provider we can read, connected or not, so nothing is hidden in a menu. */}
            {!isPending && !isError && (() => {
              const connected = new Set(integrations.map((i) => i.provider));
              const rest = availableToAdd.filter((b) => !connected.has(b.id));
              const groups = (["bank", "card"] as const).map((kind) => ({ kind, items: rest.filter((b) => b.kind === kind).sort((x, y) => translateProviderName(x.id, x.name, tBanks).localeCompare(translateProviderName(y.id, y.name, tBanks), locale)) })).filter((g) => g.items.length);
              return groups.length > 0 && (
                <>
                  {groups.map((g) => (
                    <section key={g.kind} aria-labelledby={`not-connected-${g.kind}`} className="space-y-3">
                      <h3 id={`not-connected-${g.kind}`} className="mb-2 px-4 text-sm font-semibold text-muted-foreground">{t(g.kind === "bank" ? "groupBanks" : "groupCards")}</h3>
                      <InstitutionGrid>
                        {g.items.map((b) => {
                          const name = translateProviderName(b.id, b.name, tBanks);
                          return (
                            <InstitutionTile
                              key={b.id}
                              label={name}
                              color={b.color}
                              domain={b.domain}
                              labelFor={`${t("connect")} · ${name}`}
                              onClick={() => setSheet({ open: true, mode: "add", providerId: b.id, credentialId: null })}
                            >
                              <Button variant="outline" size="sm" aria-label={`${t("connect")} · ${name}`} onClick={() => setSheet({ open: true, mode: "add", providerId: b.id, credentialId: null })}>{t("connect")}</Button>
                            </InstitutionTile>
                          );
                        })}
                      </InstitutionGrid>
                    </section>
                  ))}
                </>
              );
            })()}
            <InvestmentHouses />
          </>
        )}

        <section aria-labelledby="data-heading" className="space-y-7 border-t border-border/60 pt-6">
          <h2 id="data-heading" className="px-4 text-lg font-semibold">{t("groupData")}</h2>
          <ExportCard />
          <DiagnosticsCard />
          <BackupCard />
          <AutoBackupCard />
          <ExcludedMerchantsCard />
          <ShowBrowserCard />
          {/* The one place to delete data; Privacy links here. */}
          <div id="danger" className="scroll-mt-20 space-y-7">
            <DangerZone />
            <WipeCard />
          </div>
        </section>
      </SectionShell>

      <BankDetailSheet
        open={sheet.open}
        mode={sheet.mode}
        providerId={sheet.providerId}
        credentialId={sheet.credentialId}
        connected={sheetIntegration}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </>
  );
}

function StatusPill({
  lastSyncAt,
  syncing,
}: {
  lastSyncAt: string | null;
  syncing: boolean;
}) {
  const t = useTranslations("settings.bank");
  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> {t("statusSyncing")}
      </span>
    );
  }
  if (!lastSyncAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-heads-up)]/15 px-1.5 py-0.5 text-xs text-[var(--status-heads-up)]">
        <CircleAlert className="h-3 w-3" /> {t("statusNeverSynced")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
      <CircleCheck className="h-3 w-3" /> {t("statusConnected")}
    </span>
  );
}

function SyncShortButton({
  syncing,
  stage,
  onClick,
}: {
  syncing: boolean;
  stage: string;
  onClick: () => void;
}) {
  const t = useTranslations("settings.bank");
  if (syncing) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="hidden sm:inline">{stage || t("syncing")}</span>
      </span>
    );
  }
  // The word plus the status pill is wider than a two-column tile on a 320px phone, so the label
  // only appears from md up; on a phone it stays the accessible name and the hover tooltip.
  return (
    <IconButton
      label={t("syncShort")}
      showLabel
      className="shrink-0 px-3 [&>span]:hidden md:px-5 md:[&>span]:inline"
      onClick={onClick}
    >
      <RefreshCw className="size-4" aria-hidden />
    </IconButton>
  );
}
