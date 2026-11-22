import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { FinancialControl } from "@/components/control/financial-control";

export default async function ControlPage() {
  const t = await getTranslations("moreHub");
  return (
    <AppShell>
      <PageHeader title={t("control_title")} />
      <div className="mx-auto w-full max-w-[1920px] px-4 py-6 md:px-8"><FinancialControl /></div>
    </AppShell>
  );
}
