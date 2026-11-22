import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { FutureHero } from "@/components/ui/page-hero";
import { InvestmentsView } from "@/components/investments/investments-view";
import { VolatileHoldings } from "@/components/fi/volatile-holdings";
import { InvestmentCards } from "@/components/investments/investment-cards";

export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("investments");
  return (
    <AppShell>
      <PageHeader title={t("title")} largeTitle={false} />
      <div className="mx-auto w-full max-w-[1920px] px-4 pb-8 pt-3 md:px-6 lg:px-8">
        <div className="mb-4 md:mb-6"><InvestmentCards /></div>
        <div className="mb-4 md:mb-6"><FutureHero /></div>
        <div className="mb-4 md:mb-6"><VolatileHoldings /></div>
        <InvestmentsView />
      </div>
    </AppShell>
  );
}
