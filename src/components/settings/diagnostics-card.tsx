"use client";

import { LifeBuoy } from "lucide-react";
import { useTranslations } from "next-intl";
import { SettingCard } from "@/components/settings/section-shell";

/** A support file to send when something breaks: setup and sync states only, no money data. */
export function DiagnosticsCard() {
  const t = useTranslations("settings.data");
  return (
    <SettingCard title={t("diagTitle")} description={t("diagDescription")}>
      <a
        href="/api/diagnostics"
        download
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
      >
        <LifeBuoy className="size-4" aria-hidden />
        {t("diagButton")}
      </a>
    </SettingCard>
  );
}
