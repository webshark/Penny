import "server-only";
import pkg from "../../../package.json";
import { pennyEnv } from "@/lib/legacy-names";
import { checkForUpdate, HOW_TO_UPDATE, installKind, type InstallKind, type UpdateInfo } from "./check";
import { isDemoMode } from "@/server/demo/mode";

const SIX_HOURS = 6 * 60 * 60 * 1000;
let cache: { at: number; info: UpdateInfo | null } | null = null;

// The demo asks no outside service, GitHub included, even if someone sets UPDATE_CHECK=1.
export const updatesEnabled = () => !isDemoMode() && pennyEnv("UPDATE_CHECK") !== "0";
export const currentInstall = (): InstallKind => installKind(pennyEnv("INSTALL"));

/** The newest release if it is newer than this build; asks GitHub at most every six hours. Off with PENNY_UPDATE_CHECK=0. */
export async function latestUpdate(): Promise<(UpdateInfo & { install: InstallKind; howTo: string }) | null> {
  if (!updatesEnabled()) return null;
  if (!cache || Date.now() - cache.at > SIX_HOURS) {
    cache = { at: Date.now(), info: await checkForUpdate({ repo: pennyEnv("UPDATE_REPO") || "Sergey-Bar/Penny", current: pkg.version }) };
  }
  const install = currentInstall();
  return cache.info && { ...cache.info, install, howTo: HOW_TO_UPDATE[install] };
}
