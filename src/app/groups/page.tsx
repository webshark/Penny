import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { GroupsTable } from "@/components/transactions/groups-table";
import { SharesCard } from "@/components/transactions/shares-card";

export const dynamic = "force-dynamic";

/** Transaction groups: a trip, a wedding or a renovation, tagged, and what it really cost. */
export default async function Page() {
  const t = await getTranslations("navGroups.pages");
  return (
    <AppShell>
      <PageHeader title={t("groups")} largeTitle={false} />
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-4 px-4 pb-8 pt-3 md:px-6 lg:px-8 [&>*]:min-w-0"><GroupsTable /><SharesCard /></div>
    </AppShell>
  );
}
