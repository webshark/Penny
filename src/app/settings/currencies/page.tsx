import { getTranslations } from "next-intl/server";
import { Coins } from "lucide-react";
import { SectionShell } from "@/components/settings/section-shell";
import { CurrenciesList } from "@/components/settings/currencies-list";

export default async function CurrenciesSettingsPage() {
  const t = await getTranslations("settings.currencies");
  return (
    <SectionShell title={t("title")} description={t("description")} icon={<Coins aria-hidden />}>
      <CurrenciesList />
    </SectionShell>
  );
}
