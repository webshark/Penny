"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Trash2, AlertTriangle, EyeOff, X } from "lucide-react";
import {
  deleteAllTransactions,
  deleteExcludedMerchantRule,
  getSettings,
  listExcludedMerchants,
  updateSettings,
} from "@/lib/api";
import { toast } from "sonner";
import { SettingCard, SettingRow } from "@/components/settings/section-shell";
import { Button } from "@/components/ui/button";
import { BANK_PROVIDERS } from "@/lib/types";
import { translateProviderName } from "@/lib/i18n-data";

/** Data management on the accounts page: excluded merchants, troubleshooting, delete transactions. */
export function DangerZone() {
  const t = useTranslations("settings.data");
  const tCommon = useTranslations("common");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: deleteAllTransactions,
    onSuccess: (data) => {
      toast.success(
        t("deletedToast", {
          txCount: data.deleted.txCount,
          memoryCount: data.deleted.memoryCount,
        })
      );
      queryClient.invalidateQueries();
      setConfirmOpen(false);
      setConfirmText("");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("deleteFailedFallback"));
    },
  });

  const canConfirm = confirmText.trim().toLowerCase() === t("confirmInputPlaceholder").toLowerCase();

  return (
    <>
      <SettingCard title={t("dangerTitle")}>
        <SettingRow label={t("dangerButton")} hint={t("dangerDescription")}>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-4" aria-hidden />
            {t("dangerButton")}
          </Button>
        </SettingRow>
      </SettingCard>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!mutation.isPending) {
            setConfirmOpen(o);
            if (!o) setConfirmText("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                background:
                  "color-mix(in oklch, var(--status-over) 14%, transparent)",
              }}
            >
              <AlertTriangle
                className="h-5 w-5"
                style={{ color: "var(--status-over)" }}
              />
            </div>
            <div>
              <DialogTitle className="font-semibold text-xl">
                {t("confirmDialogTitle")}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                {t("confirmDialogDescription")}
              </DialogDescription>
            </div>
          </div>

          <div className="space-y-3 pt-2 text-sm">
            <p className="text-muted-foreground">{t("confirmRemovesIntro")}</p>
            <ul className="space-y-1 ps-5 text-xs text-muted-foreground">
              <li className="list-disc">{t("confirmRemovesAll")}</li>
              <li className="list-disc">{t("confirmRemovesSyncRuns")}</li>
              <li className="list-disc">{t("confirmRemovesMemory")}</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              {t("confirmKeeps")}
            </p>

            <div className="pt-2">
              <Label
                htmlFor="confirm-input"
                className="text-xs text-muted-foreground"
              >
                {t("confirmTypePrefix")}{" "}
                <code className="font-mono">{t("confirmInputPlaceholder")}</code> {t("confirmTypeSuffix")}
              </Label>
              <Input
                id="confirm-input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={t("confirmInputPlaceholder")}
                className="mt-1.5 h-9"
                autoFocus
                disabled={mutation.isPending}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <IconButton
              label={tCommon("cancel")}
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText("");
              }}
              disabled={mutation.isPending}
            >
              <X className="size-4" aria-hidden />
            </IconButton>
            <IconButton showLabel
              label={mutation.isPending ? tCommon("deleting") : t("deleteEverything")}
              variant="default"
              disabled={!canConfirm || mutation.isPending}
              onClick={() => mutation.mutate()}
              style={
                canConfirm
                  ? {
                      background: "var(--status-over)",
                      color: "var(--background)",
                    }
                  : undefined
              }
            >
              <Trash2 className="size-4" aria-hidden />
            </IconButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ExcludedMerchantsCard() {
  const t = useTranslations("settings.data");
  const tBanks = useTranslations("banks");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["excluded-merchants"],
    queryFn: listExcludedMerchants,
  });
  const removeMutation = useMutation({
    mutationFn: deleteExcludedMerchantRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["excluded-merchants"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["home"] });
      toast.success(t("excludedRemoved"));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("excludedRemoveFailed"));
    },
  });

  const rules = data?.rules ?? [];

  return (
    <SettingCard
      title={t("excludedTitle")}
      description={t("excludedDescription")}
    >
      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("excludedLoading")}</div>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
          {t("excludedEmpty")}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rules.map((rule) => {
            const info = BANK_PROVIDERS.find((b) => b.id === rule.provider);
            const providerName = translateProviderName(
              rule.provider,
              info?.name ?? rule.provider,
              tBanks,
            );
            return (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">
                      {rule.merchantKey}
                    </span>
                  </div>
                  <div className="ms-5 text-xs text-muted-foreground">
                    {providerName}
                  </div>
                </div>
                <IconButton
                  label={t("excludedRemoveBtn")}
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => removeMutation.mutate(rule.id)}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </SettingCard>
  );
}

function ShowBrowserToggle({ initial }: { initial: boolean }) {
  const t = useTranslations("settings.data");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(initial);
  const mutation = useMutation({
    mutationFn: (value: boolean) => updateSettings({ showBrowser: value }),
    onSuccess: (_, value) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(value ? t("browserVisibleSaved") : t("browserHiddenSaved"));
    },
    onError: (err, value) => {
      setEnabled(!value);
      toast.error(err instanceof Error ? err.message : tCommon("tryAgain"));
    },
  });

  const handleToggle = (value: boolean) => {
    setEnabled(value);
    mutation.mutate(value);
  };

  return (
    <SettingCard title={t("debugTitle")}>
      <SettingRow label={t("showBrowserLabel")} htmlFor="show-browser-toggle" hint={t("showBrowserHint")}>
        <Switch
          id="show-browser-toggle"
          checked={enabled}
          onCheckedChange={handleToggle}
        />
      </SettingRow>
    </SettingCard>
  );
}

export function ShowBrowserCard() {
  const tCommon = useTranslations("common");
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  return settings ? (
    <ShowBrowserToggle initial={settings.showBrowser} />
  ) : (
    <SettingCard>
      <div className="text-sm text-muted-foreground">{tCommon("loading")}</div>
    </SettingCard>
  );
}
