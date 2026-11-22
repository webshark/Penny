import { getTranslations } from "next-intl/server";
import { Store } from "lucide-react";
import { SectionShell } from "@/components/settings/section-shell";
import { PayeesList } from "@/components/settings/payees-list";

export default async function PayeesSettingsPage() {
  const t = await getTranslations("settings.payees");
  return (
    <SectionShell title={t("title")} description={t("description")} icon={<Store aria-hidden />}>
      <PayeesList />
    </SectionShell>
  );
}
