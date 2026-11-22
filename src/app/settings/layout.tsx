import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { SettingsFrame } from "@/components/settings/settings-sidebar";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("settings");
  return (
    <AppShell>
      <PageHeader title={t("pageTitle")} largeTitle={false} />
      <SettingsFrame>{children}</SettingsFrame>
    </AppShell>
  );
}
