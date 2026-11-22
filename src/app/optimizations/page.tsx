import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { OptimizationsView } from "@/components/transactions/optimizations-view";

export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("navGroups.pages");
  return (
    <AppShell>
      <PageHeader title={t("optimizations")} largeTitle={false} />
      <div className="mx-auto w-full max-w-[1920px] px-4 pb-8 pt-3 md:px-6 lg:px-8"><OptimizationsView /></div>
    </AppShell>
  );
}
