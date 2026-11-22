"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { SettingCard } from "@/components/settings/section-shell";

export function ExportCard() {
  const t = useTranslations("settings.data");
  return (
    <SettingCard title={t("exportTitle")} description={t("exportDescription")}>
      <a
        href="/api/data/export"
        download
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
      >
        <Download className="size-4" aria-hidden />
        {t("exportButton")}
      </a>
      <a
        href="/api/data/export?format=ofx"
        download
        className="ms-2 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
      >
        <Download className="size-4" aria-hidden />
        {t("exportOfx")}
      </a>
    </SettingCard>
  );
}
