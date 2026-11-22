import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { LoansView } from "@/components/accounts/loans-view";
import { CreditScoreCard } from "@/components/accounts/credit-score-card";

export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("loans");
  return (
    <AppShell>
      <PageHeader title={t("title")} largeTitle={false} />
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-4 px-4 pb-8 pt-3 md:px-6 lg:px-8"><LoansView /><CreditScoreCard /></div>
    </AppShell>
  );
}
