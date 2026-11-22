import { getTranslations } from "next-intl/server";
import { Languages } from "lucide-react";
import { SectionShell } from "@/components/settings/section-shell";
import { LanguageCard } from "@/components/settings/language-card";

export default async function LanguageSettingsPage() {
  const t = await getTranslations("settings.appearance");
  return (
    <SectionShell title={t("languageCardTitle")} description={t("languageCardDescription")} icon={<Languages aria-hidden />}>
      <LanguageCard />
    </SectionShell>
  );
}
