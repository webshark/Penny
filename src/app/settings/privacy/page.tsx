import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Forward } from "@/components/ui/dir-chevron";
import { Lock } from "lucide-react";
import { SectionShell, SettingCard, SettingList, SettingRow } from "@/components/settings/section-shell";
import { PrivacyModeCard } from "@/components/settings/privacy-mode-switch";
import { AppLockCard } from "@/components/settings/app-lock-card";
import { LanAccessCard } from "@/components/settings/lan-access-card";
import { InfoTip } from "@/components/ui/info-tip";
import { dataDir } from "@/server/lib/data-dir";

const STORED = ["storedTransactions", "storedCredentials", "storedKey", "storedSettings"] as const;
const LEAVES = ["leavesBanks", "leavesAi", "leavesTelegram", "leavesUpdate"] as const;

export default async function PrivacySettingsPage() {
  const t = await getTranslations("settings.privacy");
  const list = (keys: readonly string[]) => (
    <ul className="list-disc space-y-1.5 ps-5">{keys.map((k) => <li key={k}>{t(k)}</li>)}</ul>
  );
  // One row: title, a short line, the details behind the "i".
  const rows = [
    { title: t("storedTitle"), line: t("storedDescription"), info: list(STORED) },
    { title: t("leavesTitle"), line: t("leavesDescription"), info: list(LEAVES) },
    { title: t("protectTitle"), line: t("protectShort"), info: t("protectBody") },
  ];
  return (
    <SectionShell title={t("title")} description={t("description")} icon={<Lock aria-hidden />}>
      <AppLockCard />

      <PrivacyModeCard />

      <LanAccessCard />

      <SettingCard title={t("dataTitle")}>
        <SettingList>
          {rows.map((r) => (
            <SettingRow key={r.title} label={r.title} hint={r.line}>
              <InfoTip text={r.info} />
            </SettingRow>
          ))}
          <SettingRow label={t("whereLabel")} hint={<code dir="ltr" className="mt-1 block break-all font-mono text-xs">{dataDir()}</code>} />
        </SettingList>
      </SettingCard>

      <SettingCard title={t("deleteTitle")}>
        <Link href="/settings/bank#danger" className="-mx-4 -my-3 flex min-h-11 items-center gap-3 rounded-2xl px-4 py-3 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-ring">
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-destructive">{t("deleteCta")}</span>
            <span className="block text-sm text-muted-foreground">{t("deleteDescription")}</span>
          </span>
          <Forward className="text-muted-foreground" />
        </Link>
      </SettingCard>
    </SectionShell>
  );
}
