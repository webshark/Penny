"use client";

import { useRouter } from "next/navigation";
import { profileName } from "@/lib/profile-avatar";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Accessibility, Check, ChevronsUpDown, LifeBuoy, Lock, RefreshCw, Settings, Users } from "lucide-react";
import { useA11y } from "@/components/a11y/a11y-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { listProfiles } from "@/lib/api";
import { getActiveWorkspaceIdSync, setActiveProfile, useActiveProfileId } from "@/lib/workspace-store";
import type { Profile } from "@/lib/types";
import { useTranslations } from "next-intl";
import { ProfileAvatar } from "@/components/profiles/profile-avatar";

const PROFILE_CHOSEN_KEY = "penny.profileChosen";

/** Remembers for this browser session that the "who's using?" screen was shown. */
export function markProfileChosen() {
  try {
    sessionStorage.setItem(PROFILE_CHOSEN_KEY, "1");
  } catch {}
}

export function profileChosen() {
  try {
    return sessionStorage.getItem(PROFILE_CHOSEN_KEY) === "1";
  } catch {
    return true; // no storage: never nag
  }
}

export function useSwitchProfile() {
  const queryClient = useQueryClient();
  return (profile: Profile) => {
    const sameHousehold = getActiveWorkspaceIdSync() === profile.workspaceId;
    setActiveProfile(profile);
    // Same household: data stays; only the greeting (settings) and per-profile prefs change.
    if (sameHousehold) queryClient.invalidateQueries({ queryKey: ["settings"] });
    else queryClient.invalidateQueries();
  };
}

/** Profiles list, and a valid active profile (the first one when none or a stale one is stored). */
export function useProfiles() {
  const activeId = useActiveProfileId();
  const switchProfile = useSwitchProfile();
  const query = useQuery<Profile[]>({ queryKey: ["profiles"], queryFn: listProfiles, staleTime: 60_000 });
  const profiles = query.data ?? [];
  const active = profiles.find((p) => p.id === activeId);
  useEffect(() => {
    // Also moves a browser still pointed at a hidden (pre-profiles) workspace back to the household.
    if (profiles.length && (!active || getActiveWorkspaceIdSync() !== active.workspaceId)) switchProfile(active ?? profiles[0]);
  }, [active, profiles, switchProfile]);
  return { ...query, profiles, active: active ?? profiles[0], activeId };
}

/**
 * The profile button at the sidebar's foot: switch profile, then accessibility, settings,
 * help and the app lock in one menu. Shown even with one profile, since it now carries those tools.
 */
/** The bank sync line in the profile menu: its sentence, its tone dot, whether it is running, and whether it needs a look. */
export type SyncLine = { label: string; dot: string; busy: boolean; alert: boolean };

export function WorkspaceSwitcher({ side = "top", onSettings, onLock, sync }: { side?: "top" | "bottom"; onSettings?: () => void; onLock?: () => void; sync?: SyncLine }) {
  const tm = useTranslations("profileMenu");
  const a11y = useA11y();
  const router = useRouter();
  const tp = useTranslations("profiles");
  const switchProfile = useSwitchProfile();
  const { profiles: workspaces, active, activeId } = useProfiles();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                tooltip={active ? profileName(active.name, tp("me")) : tp("switch")}
              />
            }
          >
            {active ? (
              // The menu button shrinks every svg to 16px; the avatar art must fill its 28px box.
              <span className="relative shrink-0">
                <ProfileAvatar profile={active} className="size-7 text-base [&_svg]:size-full!" />
                {/* A failed or stale sync shows on the avatar, since its line now lives in this menu. */}
                {sync?.alert && <span aria-hidden className={`absolute -end-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-sidebar ${sync.dot}`} />}
              </span>
            ) : (
              <div className="size-7 shrink-0 rounded-[28%] bg-primary" />
            )}
            <div className="flex min-w-0 flex-1 flex-col text-start group-data-[collapsible=icon]:sr-only">
              <span className="truncate text-sm font-medium">
                {active ? profileName(active.name, tp("me")) : tp("switch")}
              </span>
            </div>
            <ChevronsUpDown className="ms-auto size-4 shrink-0 opacity-60 group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            side={side}
            sideOffset={8}
            className="min-w-[14rem]"
          >
            {workspaces.length > 1 && workspaces.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onClick={() => switchProfile(w)}
                className="gap-2"
              >
                <ProfileAvatar profile={w} className="size-5 text-xs" px={20} />
                <span className="flex-1 truncate">{profileName(w.name, tp("me"))}</span>
                {w.id === activeId ? (
                  <Check className="size-4 text-primary" />
                ) : null}
              </DropdownMenuItem>
            ))}
            {workspaces.length > 1 && <DropdownMenuSeparator />}
            {sync && <>
              <DropdownMenuItem onClick={() => router.push("/settings/bank")} className="gap-2">
                <RefreshCw className={`size-4 ${sync.busy ? "motion-safe:animate-spin" : ""}`} />
                <span className="flex-1">{sync.label}</span>
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${sync.dot}`} />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>}
            <DropdownMenuItem onClick={() => router.push("/profiles")} className="gap-2">
              <Users className="size-4" />
              {tp("manage")}
            </DropdownMenuItem>
            {onSettings && <DropdownMenuItem onClick={onSettings} className="gap-2"><Settings className="size-4" />{tm("settings")}</DropdownMenuItem>}
            <DropdownMenuItem onClick={() => a11y.setOpen(true)} className="gap-2"><Accessibility className="size-4" />{tm("accessibility")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/help")} className="gap-2"><LifeBuoy className="size-4" />{tm("help")}</DropdownMenuItem>
            {onLock && <><DropdownMenuSeparator /><DropdownMenuItem onClick={onLock} className="gap-2 text-expense"><Lock className="size-4" />{tm("lock")}</DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
