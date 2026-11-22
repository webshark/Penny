import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { WellbeingView } from "@/components/wellbeing/wellbeing-view";

export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("wellbeing");
  return (
    <AppShell>
      <PageHeader title={t("title")} meta={t("subtitle")} />
      <div className="mx-auto w-full max-w-[1920px] px-4 pb-8 pt-3 md:px-6 lg:px-8">
        <WellbeingView />
      </div>
    </AppShell>
  );
}
