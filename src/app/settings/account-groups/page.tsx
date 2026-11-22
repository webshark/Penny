import { getTranslations } from "next-intl/server";
import { Layers } from "lucide-react";
import { SectionShell } from "@/components/settings/section-shell";
import { AccountGroupsEditor } from "@/components/settings/account-groups-editor";

export default async function AccountGroupsSettingsPage() {
  const t = await getTranslations("settings.accountGroups");
  return (
    <SectionShell title={t("title")} description={t("description")} icon={<Layers aria-hidden />}>
      <AccountGroupsEditor />
    </SectionShell>
  );
}
