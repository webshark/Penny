import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { FiView } from "@/components/fi/fi-view";
import { ContextTips } from "@/components/tips/tips";

export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("fi");
  return (
    <AppShell>
      <PageHeader title={t("title")} largeTitle={false} />
      <div className="mx-auto w-full max-w-[1920px] px-4 pb-8 pt-3 md:px-6 lg:px-8">
        <FiView />
        <div className="mt-4"><ContextTips categories={["retirement", "pension", "savings"]} /></div>
      </div>
    </AppShell>
  );
}
