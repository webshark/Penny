import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { ReviewsView } from "@/components/reviews/reviews-view";
import { FlowMatchesCard } from "@/components/reviews/flow-matches-card";

export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("reviews");
  return (
    <AppShell>
      <PageHeader title={t("title")} meta={t("subtitle")} />
      <div className="mx-auto w-full max-w-4xl px-4 pb-8 pt-3 md:px-6 lg:px-8">
        <Suspense>
          <ReviewsView />
        </Suspense>
        <div className="mt-4">
          <FlowMatchesCard />
        </div>
      </div>
    </AppShell>
  );
}
