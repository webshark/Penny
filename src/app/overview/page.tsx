import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { OverviewTabs } from "@/components/overview/overview-tabs";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const t = await getTranslations("overview");
  return (
    <AppShell>
      <PageHeader title={t("title")} largeTitle={false} />
      <div className="mx-auto w-full max-w-[1920px] px-4 pb-8 pt-3 md:px-6 lg:px-8">
        <Suspense>
          <OverviewTabs />
        </Suspense>
      </div>
    </AppShell>
  );
}
