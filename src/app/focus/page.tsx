import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { HomePage } from "@/components/home/home-page";
import { ProfileGate } from "@/components/profiles/profile-gate";
import { onboardingStep } from "@/server/lib/onboarding";

export const dynamic = "force-dynamic";

/** Focus: the calm one-page home, reached only from its own menu item. */
export default function FocusPage() {
  if (onboardingStep()) redirect("/setup");
  return (
    <AppShell>
      <ProfileGate />
      <HomePage focus />
    </AppShell>
  );
}
