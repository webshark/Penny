"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback, useSyncExternalStore, type ReactNode } from "react";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { readableAccent, DEFAULT_STUDIO, STUDIO_KEY, parseStudioPreferences, type StudioPreferences } from "@/lib/budget-studio";
import { loadPreference, storePreference } from "@/lib/preference-sync";
import {useActiveProfileId} from "@/lib/workspace-store";
import { useStudioCopy } from "./dashboard/studio-copy";

const profileKey = (id: number | null) => `${STUDIO_KEY}.profile${id ?? "default"}`;
function writeLocal(id: number | null, value: StudioPreferences) {
  const raw = JSON.stringify(value);
  localStorage.setItem(profileKey(id), raw);
  localStorage.setItem(STUDIO_KEY, raw);
}

type StudioContextValue = {
  preferences: StudioPreferences;
  preview: (value: StudioPreferences) => void;
  save: (value: StudioPreferences) => boolean;
  resolvedStudioTheme: "pearl" | "midnight";
};
const StudioContext = createContext<StudioContextValue | null>(null);

const noSubscribe = () => () => {}; // read once per render; writes go through state, other tabs via the storage listener
// Each profile keeps its own look; STUDIO_KEY mirrors the active one for the pre-paint script.
function readStored(id: number | null): StudioPreferences | null {
  try {
    const stored = localStorage.getItem(profileKey(id)) ?? localStorage.getItem(STUDIO_KEY);
    const legacy = localStorage.getItem("theme");
    return stored ? parseStudioPreferences(stored) : { ...DEFAULT_STUDIO, theme: legacy === "dark" ? "midnight" : legacy === "light" ? "pearl" : "system" } as StudioPreferences;
  } catch { return null; /* Preferences remain usable without storage. */ }
}

/** One owner for appearance, shared by routes and portalled menus/dialogs. */
export function StudioProvider({ children }: { children: ReactNode }) {
  const ready = useIsHydrated();
  const { resolvedTheme, setTheme } = useTheme();
  const profileId=useActiveProfileId(); // per profile: each person keeps their own look
  // Snapshot is the raw key set so it stays stable between reads; parsed below.
  const raw = useSyncExternalStore(noSubscribe, () => { try { return JSON.stringify([localStorage.getItem(profileKey(profileId)), localStorage.getItem(STUDIO_KEY), localStorage.getItem("theme")]); } catch { return ""; } }, () => "");
  const stored = useMemo(() => (raw ? readStored(profileId) : null), [raw, profileId]);
  const [own, setOwn] = useState<{ id: number | null; p: StudioPreferences } | null>(null);
  const preferences = own?.id === profileId ? own.p : stored ?? DEFAULT_STUDIO;
  const setPreferences = useCallback((p: StudioPreferences) => setOwn({ id: profileId, p }), [profileId]);
  useEffect(() => {
    if (stored) try { writeLocal(profileId, stored); } catch { /* Preferences remain usable without storage. */ }
  }, [profileId, stored]);
  useEffect(() => {
    let active=true;
    void loadPreference("studio").then(value=>{if(active&&value){const prefs=parseStudioPreferences(JSON.stringify(value));setPreferences(prefs);try{writeLocal(profileId,prefs);}catch{}}}).catch(()=>{});
    const sync = (event: StorageEvent) => {
      // Only this profile's key: STUDIO_KEY mirrors whichever profile another tab has open, and would overwrite this one's look.
      if (event.key === profileKey(profileId)) setPreferences(parseStudioPreferences(event.newValue));
    };
    window.addEventListener("storage", sync);
    return () => {active=false;window.removeEventListener("storage", sync);};
  }, [profileId, setPreferences]);
  useEffect(() => {
    if (ready) setTheme(preferences.theme === "system" ? "system" : preferences.theme === "midnight" ? "dark" : "light");
  }, [preferences.theme, ready, setTheme]);
  const resolvedStudioTheme = preferences.theme === "system" ? resolvedTheme === "dark" ? "midnight" : "pearl" : preferences.theme;
  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    root.classList.add("app-studio");
    root.dataset.studioTheme = resolvedStudioTheme;
    root.dataset.studioAccent = preferences.accent;
    root.dataset.studioDensity = preferences.density;
    root.dataset.studioMotion = String(preferences.motion);
    root.dataset.studioCustom = String(!!preferences.customColor);
    if (preferences.customColor) root.style.setProperty("--custom-primary", readableAccent(preferences.customColor, resolvedStudioTheme === "midnight"));
    else root.style.removeProperty("--custom-primary");
  }, [ready, resolvedStudioTheme, preferences.accent, preferences.density, preferences.motion, preferences.customColor]);
  const copy = useStudioCopy();
  const save = useCallback((value: StudioPreferences) => {
    setPreferences(value);
    void storePreference("studio",value).catch(()=>toast.error(copy.syncFailed));
    try { writeLocal(profileId, value); return true; }
    catch { toast.error(copy.storageError); return false; }
  }, [copy, profileId, setPreferences]);
  return <StudioContext.Provider value={{ preferences, preview: setPreferences, save, resolvedStudioTheme }}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const value = useContext(StudioContext);
  if (!value) throw new Error("useStudio requires StudioProvider");
  return value;
}
