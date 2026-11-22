"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { BANK_PROVIDERS, type BankProviderInfo, type Integration } from "@/lib/types";
import {
  deleteIntegration,
  getIntegrationCredentials,
  saveBankCredentials,
  testBankConnection,
  updateIntegrationSettings,
} from "@/lib/api";
import { useSyncErrorText } from "@/hooks/use-sync-error-text";
import { TwoFactorSection } from "@/components/setup/two-factor-section";
import { translateCredentialField, translateProviderBlurb, translateProviderName } from "@/lib/i18n-data";
import { AlertTriangle, Loader2, Check, PlugZap, Unplug, X } from "lucide-react";

export interface BankDetailSheetProps {
  open: boolean;
  mode: "edit" | "add";
  providerId: string | null;
  credentialId: number | null;
  connected?: Integration | null;
  onClose: () => void;
}

export function BankDetailSheet({
  open,
  mode,
  providerId,
  credentialId,
  connected,
  onClose,
}: BankDetailSheetProps) {
  const info = providerId
    ? BANK_PROVIDERS.find((b) => b.id === providerId) ?? null
    : null;
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-md! md:max-w-lg!"
      >
        {info ? (
          <SheetBody
            info={info}
            mode={mode}
            credentialId={credentialId}
            connected={connected ?? null}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({
  info,
  mode,
  credentialId,
  connected,
  onClose,
}: {
  info: BankProviderInfo;
  mode: "edit" | "add";
  credentialId: number | null;
  connected: Integration | null;
  onClose: () => void;
}) {
  const t = useTranslations("settings.bankDetail");
  const tBanks = useTranslations("banks");
  const name = translateProviderName(info.id, info.name, tBanks);
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader className="gap-3 border-b border-border/40 p-6">
        <div className="flex items-center gap-3">
          <ProviderBadge
            color={info.color}
            name={info.name}
            domain={info.domain}
            size={40}
            radius={10}
          />
          <div className="min-w-0 flex-1">
            <SheetTitle>{connected?.label ?? name}</SheetTitle>
            <SheetDescription className="mt-0.5">
              {mode === "add"
                ? t("connectDescription")
                : connected
                  ? t("nameWithCount", {
                      name,
                      count: connected.transactionCount,
                    })
                  : translateProviderBlurb(info.id, info.blurb, tBanks)}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-6 p-6">
        <CredentialsForm
          key={`${info.id}-${credentialId ?? "new"}`}
          info={info}
          isEdit={mode === "edit"}
          credentialId={credentialId}
          initialLabel={connected?.label ?? ""}
          onSaved={onClose}
        />
        {mode === "edit" && connected ? (
          <RecentSyncCard
            lastSyncAt={connected.lastSyncAt}
            transactionCount={connected.transactionCount}
          />
        ) : null}
      </div>

      {mode === "edit" && connected ? (
        <div className="border-t border-border/40 p-6">
          <DangerZone credentialId={connected.id} onRemoved={onClose} />
        </div>
      ) : null}
    </div>
  );
}

function CredentialsForm({
  info,
  isEdit,
  credentialId,
  initialLabel,
  onSaved,
}: {
  info: BankProviderInfo;
  isEdit: boolean;
  credentialId: number | null;
  initialLabel: string;
  onSaved: () => void;
}) {
  const t = useTranslations("settings.bankDetail");
  const tSetup = useTranslations("setup");
  const errorText = useSyncErrorText();
  const tCommon = useTranslations("common");
  const tBanks = useTranslations("banks");
  const name = translateProviderName(info.id, info.name, tBanks);
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(initialLabel);
  const [savedCredentialId, setSavedCredentialId] = useState<number | null>(
    credentialId
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(!isEdit);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requiresManualTwoFactor, setRequiresManualTwoFactor] = useState(false);
  const [hasTwoFactorToken, setHasTwoFactorToken] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [prevCredentialId, setPrevCredentialId] = useState(credentialId);
  if (credentialId !== prevCredentialId) {
    setPrevCredentialId(credentialId);
    setSavedCredentialId(credentialId);
  }

  useEffect(() => {
    if (!isEdit || credentialId == null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getIntegrationCredentials(credentialId);
        if (cancelled) return;
        if (res.credentials) setCredentials(res.credentials);
        if (res.label) setLabel(res.label);
        setRequiresManualTwoFactor(res.requiresManualTwoFactor);
        setHasTwoFactorToken(res.hasTwoFactorToken);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, credentialId]);

  const allValid =
    label.trim().length > 0 &&
    info.credentialFields.every((f) => {
      const v = credentials[f.key]?.trim() ?? "";
      if (!v) return false;
      if (f.exactLength != null && v.length !== f.exactLength) return false;
      return true;
    });

  const saveOptions = (id: number | null) => ({
    label: label.trim(),
    ...(id != null ? { credentialId: id } : {}),
    requiresManualTwoFactor,
  });

  const parseApiError = (err: unknown, fallback: string): string => {
    if (!(err instanceof Error)) return fallback;
    try {
      const body = JSON.parse(err.message) as { message?: string };
      if (body.message) return body.message;
    } catch {
      /* plain text */
    }
    return err.message || fallback;
  };

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const existingId = savedCredentialId;
      let testId = existingId;
      if (existingId != null) {
        const saved = await saveBankCredentials(
          info.id,
          credentials,
          saveOptions(existingId)
        );
        testId = saved.credentialId;
        setSavedCredentialId(testId);
      }
      const res = await testBankConnection(info.id, {
        ...(testId != null ? { credentialId: testId } : { credentials }),
      });
      setResult(res.success ? { ...res, message: tSetup("bankConnectionWorks") } : { ...res, message: errorText(res.message).message });
    } catch (err) {
      setResult({
        success: false,
        message: parseApiError(err, tSetup("bankConnectionTestFailed")),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveBankCredentials(
        info.id,
        credentials,
        saveOptions(savedCredentialId)
      );
      setSavedCredentialId(saved.credentialId);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["setupStatus"] });
      toast.success(t("credentialsSaved", { name }));
      onSaved();
    } catch (err) {
      setResult({
        success: false,
        message: parseApiError(err, tSetup("bankFailedToSaveCredentials")),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetToken = async () => {
    if (savedCredentialId == null) return;
    setResetPending(true);
    try {
      await updateIntegrationSettings(savedCredentialId, {
        resetTwoFactorToken: true,
      });
      setHasTwoFactorToken(false);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success(t("tokenCleared", { name }));
    } catch {
      toast.error(t("tokenResetFailed"));
    } finally {
      setResetPending(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tCommon("loadingValues")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${info.id}-label`}>{t("accountLabel")}</Label>
        <Input
          id={`${info.id}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("accountLabelPlaceholder", { name })}
        />
        <p className="text-xs text-muted-foreground">
          {t("accountLabelHint")}
        </p>
      </div>

      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t("credentialsHeading")}
      </div>
      {info.credentialFields.map((rawField) => {
        const field = { ...rawField, ...translateCredentialField(info.id, rawField, tBanks) };
        const value = credentials[field.key] ?? "";
        const tooShort =
          field.exactLength != null &&
          value.length > 0 &&
          value.length !== field.exactLength;
        const placeholder = field.placeholder;
        const hint = field.hint;
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`${info.id}-${field.key}`}>{field.label}</Label>
            <Input
              id={`${info.id}-${field.key}`}
              type={field.type}
              inputMode={field.numeric ? "numeric" : undefined}
              pattern={field.numeric ? "[0-9]*" : undefined}
              maxLength={field.maxLength ?? field.exactLength ?? undefined}
              value={value}
              onChange={(e) => {
                let next = e.target.value;
                if (field.numeric) next = next.replace(/\D/g, "");
                if (field.exactLength) next = next.slice(0, field.exactLength);
                if (field.maxLength) next = next.slice(0, field.maxLength);
                setCredentials((prev) => ({ ...prev, [field.key]: next }));
              }}
              placeholder={placeholder}
              dir={field.numeric || ["email", "tel"].includes(field.type) ? "ltr" : undefined}
              aria-invalid={tooShort || undefined}
            />
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            {tooShort && (
              <p className="text-xs text-destructive">
                {tSetup("bankExactLengthError", { count: field.exactLength ?? 0 })}
              </p>
            )}
          </div>
        );
      })}

      <TwoFactorSection
        info={info}
        requiresManualTwoFactor={requiresManualTwoFactor}
        hasTwoFactorToken={hasTwoFactorToken}
        onChangeManualFlag={setRequiresManualTwoFactor}
        onResetToken={handleResetToken}
        resetPending={resetPending}
        showResetButton={savedCredentialId != null}
      />

      {result && (
        <div
          className={`rounded-md p-3 text-sm ${
            result.success
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {result.message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        <IconButton
          label={testing ? tSetup("bankTesting") : tSetup("bankTestConnection")}
          variant="outline"
          onClick={handleTest}
          disabled={!allValid || testing || saving}
        >
          <PlugZap className="size-4" aria-hidden />
        </IconButton>
        <IconButton showLabel
          label={saving ? tCommon("saving") : tCommon("save")}
          variant="default"
          onClick={handleSave}
          disabled={!allValid || saving || testing}
        >
          <Check className="size-4" aria-hidden />
        </IconButton>
      </div>
    </div>
  );
}

function RecentSyncCard({
  lastSyncAt,
  transactionCount,
}: {
  lastSyncAt: string | null;
  transactionCount: number;
}) {
  const t = useTranslations("settings.bankDetail");
  const tBank = useTranslations("settings.bank");
  const locale = useLocale();
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t("recentSync")}
      </div>
      <div className="mt-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
        <div className="font-medium">
          {t("transactionCount", { count: transactionCount })}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {lastSyncAt
            ? t("lastSynced", {
                time: formatRelative(lastSyncAt, tBank, locale),
              })
            : tBank("statusNeverSynced")}
        </div>
      </div>
    </div>
  );
}

function DangerZone({
  credentialId,
  onRemoved,
}: {
  credentialId: number;
  onRemoved: () => void;
}) {
  const t = useTranslations("settings.bankDetail");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: () => deleteIntegration(credentialId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["setupStatus"] });
      toast.success(t("disconnected"));
      onRemoved();
    },
  });

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{t("disconnectTitle")}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("disconnectHint")}
          </p>
          {!confirming ? (
            <IconButton showLabel
              label={t("disconnect")}
              variant="outline"
              className="mt-3 text-destructive hover:text-destructive"
              onClick={() => setConfirming(true)}
            >
              <Unplug className="size-4" aria-hidden />
            </IconButton>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <IconButton
                label={tCommon("cancel")}
                onClick={() => setConfirming(false)}
              >
                <X className="size-4" aria-hidden />
              </IconButton>
              <IconButton showLabel
                label={mutation.isPending ? t("disconnecting") : t("confirmDisconnect")}
                variant="destructive"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
              >
                <Unplug className="size-4" aria-hidden />
              </IconButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRelative(
  iso: string,
  t: ReturnType<typeof useTranslations<"settings.bank">>,
  locale: string
): string {
  const then = new Date(iso.replace(" ", "T") + "Z");
  const diffSec = (Date.now() - then.getTime()) / 1000;
  if (diffSec < 60) return t("justNow");
  if (diffSec < 3600) return t("minutesAgo", { count: Math.round(diffSec / 60) });
  if (diffSec < 86400) return t("hoursAgo", { count: Math.round(diffSec / 3600) });
  if (diffSec < 86400 * 7) return t("daysAgo", { count: Math.round(diffSec / 86400) });
  return then.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
