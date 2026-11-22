import { AppShell } from "@/components/layout/app-shell";
import { Dashboard } from "@/components/dashboard/dashboard";
import { BudgetHistoryCard } from "@/components/dashboard/budget-history-card";
import { ContextTips } from "@/components/tips/tips";

export const dynamic = "force-dynamic";

export default function BudgetPage() {
  return (
    <AppShell>
      <Dashboard />
      <div className="mx-auto w-full max-w-[1920px] px-4 pb-8 md:px-6 lg:px-8">
        <BudgetHistoryCard />
        <div className="mt-4"><ContextTips categories={["debt", "emergency", "budget"]} limit={1} /></div>
      </div>
    </AppShell>
  );
}
