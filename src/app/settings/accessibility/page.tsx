"use client";

import { useTranslations } from "next-intl";
import { Accessibility } from "lucide-react";
import { SectionShell } from "@/components/settings/section-shell";
import { A11yOptions } from "@/components/a11y/a11y-menu";

export default function AccessibilitySettingsPage() {
  const t = useTranslations("a11y");
  // The options already carry their own grouped card; wrapping them again nested a card in a card.
  return (
    <SectionShell title={t("title")} description={t("settingsDescription")} icon={<Accessibility aria-hidden />}>
      <A11yOptions idPrefix="a11y-settings" />
    </SectionShell>
  );
}
