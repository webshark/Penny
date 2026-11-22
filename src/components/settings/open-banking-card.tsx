"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingCard } from "@/components/settings/section-shell";
import { saveBankCredentials, testBankConnection } from "@/lib/api";
import type { Integration } from "@/lib/types";
import { CheckCircle2, Landmark, Loader2, ShieldCheck } from "lucide-react";

/**
 * Open banking: the bank answers an API instead of a browser being driven through
 * its site. The connection needs a consent issued by the bank (or an aggregator),
 * so the card asks for the endpoint and the token that consent produced.
 */
export function OpenBankingCard({
  connected,
  onOpen,
}: {
  connected: Integration | null;
  onOpen: () => void;
}) {
  const t = useTranslations("settings.openBanking");
  const queryClient = useQueryClient();
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [consentId, setConsentId] = useState("");
  const [label, setLabel] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const credentials = () => ({
    baseUrl: baseUrl.trim(),
    token: token.trim(),
    ...(consentId.trim() ? { consentId: consentId.trim() } : {}),
  });

  const ready = baseUrl.trim().length > 0 && token.trim().length > 0;

  async function test() {
    setTesting(true);
    try {
      const result = await testBankConnection("openBanking", { credentials: credentials() });
      if (result.success) {
        toast.success(t("testOk", { count: result.accountsFound ?? 0 }));
      } else {
        toast.error(result.message || t("testFailed"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("testFailed"));
    } finally {
      setTesting(false);
    }
  }

  async function connect() {
    setSaving(true);
    try {
      await saveBankCredentials("openBanking", credentials(), {
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ["integrations"] });
      setToken("");
      setConsentId("");
      toast.success(t("saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (connected) {
    return (
      <SettingCard title={t("connectedTitle")}>
        <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <CheckCircle2 className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{connected.label}</p>
            <p className="text-footnote text-muted-foreground">{t("connectedHint")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onOpen}>
            {t("manage")}
          </Button>
        </div>
      </SettingCard>
    );
  }

  return (
    <SettingCard title={t("title")}>
      <div className="space-y-4 px-4 pb-4">
        <p className="text-footnote text-pretty text-muted-foreground">{t("description")}</p>

        <ul className="space-y-2 text-footnote text-muted-foreground">
          {[t("point1"), t("point2"), t("point3")].map((point) => (
            <li key={point} className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              <span className="text-pretty">{point}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ob-base-url">{t("baseUrl")}</Label>
            <Input
              id="ob-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://xs2a.example.co.il"
              inputMode="url"
              dir="ltr"
              autoComplete="off"
            />
            <p className="text-caption text-muted-foreground">{t("baseUrlHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ob-token">{t("token")}</Label>
            <Input
              id="ob-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t("tokenPlaceholder")}
              dir="ltr"
              autoComplete="off"
            />
            <p className="text-caption text-muted-foreground">{t("tokenHint")}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ob-consent">{t("consentId")}</Label>
              <Input
                id="ob-consent"
                value={consentId}
                onChange={(e) => setConsentId(e.target.value)}
                dir="ltr"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-label">{t("label")}</Label>
              <Input
                id="ob-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("labelPlaceholder")}
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={connect} disabled={!ready || saving || testing}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Landmark className="size-4" aria-hidden />}
            {t("connect")}
          </Button>
          <Button variant="outline" onClick={test} disabled={!ready || testing || saving}>
            {testing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("test")}
          </Button>
        </div>
      </div>
    </SettingCard>
  );
}
