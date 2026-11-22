"use client";

import { Switch } from "@/components/ui/switch";
import { usePlan } from "@/hooks/use-plan";
import { Segmented } from "@/components/ui/segmented";
import { HOME_STYLES, type HomeStyle } from "@/lib/plan";
import { useState } from "react";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { useStudio } from "@/components/studio-provider";

import { StudioEditor } from "@/components/dashboard/studio-editor";
import { PetCustomizer } from "@/components/home/pet-card";
import { useStudioCopy } from "@/components/dashboard/studio-copy";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { InfoTip } from "@/components/ui/info-tip";
import { SectionShell, SettingCard, SettingList, SettingRow } from "@/components/settings/section-shell";
import { ACCOUNT_GROUPS, type AccountGroupKey } from "@/lib/account-groups";
import { loadPreference, storePreference } from "@/lib/preference-sync";
import { useSidebarAccountsPref } from "@/components/layout/sidebar-accounts";
import { useShowUpcoming } from "@/components/transactions/upcoming-charges";


export default function AppearanceSettingsPage() {
  const t = useTranslations("settings.appearance");
  const c = useStudioCopy();

  return (
    <SectionShell title={t("title")} description={t("description")} icon={<Palette aria-hidden />}>

      <ThemeCard />
      <ComfortCard />
      <SidebarSectionsCard />
      <QuickStartCard />
      <UpcomingCard />

      <PetSettingsCard />

      <section>
        <div className="mb-2 flex items-center gap-1 px-4"><h3 className="text-sm font-semibold text-muted-foreground">{c.globalSettings}</h3><InfoTip text={c.studioHint} /></div>
        <StudioEditor inline />
      </section>

      <AboutCard />
    </SectionShell>
  );
}

/** Autosave for plan switches: toast on save; on failure usePlan puts the old value back. */
function useSavePlan() {
  const tCommon = useTranslations("common");
  const { update } = usePlan();
  return (patch: Parameters<typeof update>[0]) =>
    update(patch).then(
      () => { toast.success(tCommon("saved")); },
      (err) => { toast.error(err instanceof Error ? err.message : tCommon("tryAgain")); throw err; },
    );
}

/** Focus settings: fewer moving parts for people who lose their place easily. */
/** "Show upcoming transactions": the pinned coming-up section above the transactions list. */
function UpcomingCard() {
  const t = useTranslations("settings.appearance");
  const qc = useQueryClient();
  const shown = useShowUpcoming();
  const set = (show: boolean) => {
    const next = { hidden: !show };
    qc.setQueryData(["preference", "transactions-upcoming"], next);
    void storePreference("transactions-upcoming", next).catch(() => toast.error(t("sidebarSectionsFailed")));
  };
  return (
    <SettingCard title={t("upcomingTitle")}>
      <SettingList>
        <SettingRow label={t("upcomingShow")} hint={t("upcomingHint")} htmlFor="upcoming-show">
          <Switch id="upcoming-show" checked={shown} onCheckedChange={set} />
        </SettingRow>
      </SettingList>
    </SettingCard>
  );
}

/** Brings back the dashboard's Quick start after "Dismiss permanently" (or hides it). Household setting, like its tasks. */
function QuickStartCard() {
  const t = useTranslations("settings.appearance");
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["preference", "activation"], queryFn: () => loadPreference("activation") });
  const list = Array.isArray(q.data) ? q.data.filter((x): x is string => typeof x === "string") : [];
  const shown = !list.includes("quick-start-dismissed");
  const set = (show: boolean) => {
    const next = show ? list.filter((x) => x !== "quick-start-dismissed") : [...list, "quick-start-dismissed"];
    qc.setQueryData(["preference", "activation"], next);
    void storePreference("activation", next).catch(() => toast.error(t("sidebarSectionsFailed")));
  };
  return (
    <SettingCard title={t("quickStart")}>
      <SettingList>
        <SettingRow label={t("quickStartShow")} hint={t("quickStartHint")} htmlFor="quick-start-show">
          <Switch id="quick-start-show" checked={shown} disabled={!q.isFetched} onCheckedChange={set} />
        </SettingRow>
      </SettingList>
    </SettingCard>
  );
}

/** Which account groups the sidebar lists. Saved per profile. */
function SidebarSectionsCard() {
  const t = useTranslations("settings.appearance");
  const tGroups = useTranslations("accountsView.groups");
  const qc = useQueryClient();
  const { hidden, moves } = useSidebarAccountsPref();
  const toggle = (key: AccountGroupKey, show: boolean) => {
    const next = show ? hidden.filter((k) => k !== key) : [...hidden, key];
    qc.setQueryData(["preference", "sidebar-accounts"], { hidden: next, moves });
    void storePreference("sidebar-accounts", { hidden: next, moves }).catch(() => toast.error(t("sidebarSectionsFailed")));
  };
  return (
    <SettingCard title={t("sidebarSections")} description={t("sidebarSectionsHint")}>
      <SettingList>
        {ACCOUNT_GROUPS.map((key) => (
          <SettingRow key={key} label={tGroups(key)} htmlFor={`sidebar-${key}`}>
            <Switch id={`sidebar-${key}`} checked={!hidden.includes(key)} onCheckedChange={(v) => toggle(key, v)} />
          </SettingRow>
        ))}
      </SettingList>
    </SettingCard>
  );
}

function ComfortCard() {
  const t = useTranslations("settings.appearance");
  const { plan, loaded } = usePlan();
  const update = useSavePlan();
  // Show the picked style at once; it follows plan.homeStyle again once saved (or if saving fails).
  const [picked, setPicked] = useState<HomeStyle | null>(null);
  if (picked && picked === plan.homeStyle) setPicked(null);
  // Never saved: Home renders classic (it only checks for "companion"), so show that.
  const homeStyle: HomeStyle = picked ?? plan.homeStyle ?? "classic";
  const rows = [
    { key: "simpleMode", label: t("simpleMode"), hint: t("simpleModeHint") },
    // Paging moves between pages; in Simple mode there is no scrolling between pages at all.
    { key: "wheelPaging", label: t("wheelPaging"), hint: t("wheelPagingHint") },
  ] as const;
  return (
    <SettingCard title={t("comfortTitle")} description={t("comfortDescription")}>
      <SettingList>
        <SettingRow label={t("homeStyle")} hint={t(`homeStyleHint_${homeStyle}`)}>
          <Segmented label={t("homeStyle")} value={homeStyle} onChange={(next) => { if (!loaded || next === homeStyle) return; setPicked(next); update({ homeStyle: next }).catch(() => setPicked(null)); }}
            options={HOME_STYLES.map((s) => ({ value: s, label: t(`homeStyle_${s}`) }))} />
        </SettingRow>
        {rows.map((r) => (
          <SettingRow key={r.key} label={r.label} hint={r.hint} htmlFor={`comfort-${r.key}`}>
            <Switch id={`comfort-${r.key}`} checked={plan[r.key]} disabled={!loaded}
              onCheckedChange={(v) => void update({ [r.key]: v }).catch(() => {})} />
          </SettingRow>
        ))}
      </SettingList>
    </SettingCard>
  );
}

/** Pocket Pal: its own section, apart from the app's look, with the customization right under the switch. */
function PetSettingsCard() {
  const t = useTranslations("settings.appearance");
  const { plan, loaded } = usePlan();
  const update = useSavePlan();
  return (
    <SettingCard title={t("petMode")} description={t("petModeHint")}>
      <SettingList>
        <SettingRow label={t("petShow")} htmlFor="pet-mode">
          <Switch id="pet-mode" checked={plan.pet.enabled} disabled={!loaded} onCheckedChange={(v) => void update({ pet: { ...plan.pet, enabled: v } }).catch(() => {})} />
        </SettingRow>
        {plan.pet.enabled && <div className="pt-4 pb-2"><PetCustomizer /></div>}
      </SettingList>
    </SettingCard>
  );
}

/** Credits for open-source pieces shown in the app. */
function AboutCard() {
  const t = useTranslations("settings.appearance");
  return (
    <SettingCard title={t("aboutTitle")}>
      <div className="space-y-2 text-sm">
        <p>{t("boopCredit")}</p>
        <p className="text-xs text-muted-foreground">{t("boopLicense")}</p>
        <a href="https://github.com/CX-ArtLab/boopface" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t("boopRepo")}</a>
      </div>
    </SettingCard>
  );
}

/** The theme comes first: light, dark, or follow the device. Penny keeps its extra looks in the studio below. */
function ThemeCard() {
  const t = useTranslations("settings.appearance");
  const { preferences, save } = useStudio();
  const current = preferences.theme === "midnight" ? "dark" : preferences.theme === "system" ? "system" : "light";
  const options = [
    { value: "light", Icon: Sun, theme: "pearl" },
    { value: "dark", Icon: Moon, theme: "midnight" },
    { value: "system", Icon: Monitor, theme: "system" },
  ] as const;
  return (
    <SettingCard title={t("themeTitle")} description={t("themeHint")}>
      <div role="radiogroup" aria-label={t("themeTitle")} className="flex flex-wrap gap-2">
        {options.map(({ value, Icon, theme }) => (
          <button key={value} type="button" role="radio" aria-checked={current === value} onClick={() => save({ ...preferences, theme })}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring ${current === value ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent"}`}>
            <Icon className="size-4" aria-hidden />{t(`theme_${value}`)}
          </button>
        ))}
      </div>
    </SettingCard>
  );
}
