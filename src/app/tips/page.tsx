import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { TipsLibrary } from "@/components/tips/tips";

export default async function TipsPage() {
  const t = await getTranslations("tipsUi");
  return (
    <AppShell>
      <PageHeader title={t("pageTitle")} meta={t("pageMeta")} />
      <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-3 md:px-6 lg:px-8">
        <TipsLibrary />
      </div>
    </AppShell>
  );
}
