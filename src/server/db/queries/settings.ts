import "server-only";

import { getDb } from "../index";
import { getWorkspace, updateWorkspace } from "./workspaces";
import { updateProfile } from "./profiles";
import { normalizeOllamaUrl, OLLAMA_URL_ERROR } from "@/lib/url-guard";
import type { AppSettings } from "@/lib/types";
import { EMPTY_HOUSEHOLD, parseHousehold, type Household } from "@/lib/household";

// Global settings live in the `settings` table and apply to every workspace.
// Currently: ai_provider, ai_ollama_url, ai_ollama_model, plus the encrypted
// Claude API key triple (ai_api_key_encrypted/iv/auth_tag).
export function getGlobalSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setGlobalSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value);
}

export function deleteGlobalSetting(key: string): void {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

// Per-workspace settings live in `workspace_settings`.
// Currently: months_to_sync, payday_day, scraper_show_browser.
export function getWorkspaceSetting(
  workspaceId: number,
  key: string
): string | null {
  const row = getDb()
    .prepare(
      "SELECT value FROM workspace_settings WHERE workspace_id = ? AND key = ?"
    )
    .get(workspaceId, key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setWorkspaceSetting(
  workspaceId: number,
  key: string,
  value: string
): void {
  getDb()
    .prepare(
      `INSERT INTO workspace_settings (workspace_id, key, value, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(workspace_id, key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    )
    .run(workspaceId, key, value);
}

// Back-compat aliases so existing call sites that store the Claude API key
// (settings.ts in src/server/ai/providers/claude.ts) keep working unchanged.
export const getSetting = getGlobalSetting;
export const setSetting = setGlobalSetting;

const AUTO_SYNC_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** profileName: the active profile (X-Profile-ID); its name is the greeting. */
export function getAppSettings(workspaceId: number, profileName?: string): AppSettings {
  const targetRaw = getWorkspaceSetting(workspaceId, "monthly_target");
  const target = targetRaw != null ? Number(targetRaw) : NaN;
  const storedTime = getGlobalSetting("auto_sync_time");
  const storedLang = getGlobalSetting("language");
  return {
    monthsToSync: Number(getWorkspaceSetting(workspaceId, "months_to_sync") ?? "3"),
    aiProvider: (getGlobalSetting("ai_provider") ?? "none") as AppSettings["aiProvider"],
    ollamaUrl: getGlobalSetting("ai_ollama_url") ?? "http://localhost:11434",
    ollamaModel: getGlobalSetting("ai_ollama_model") ?? "llama3.2:3b",
    showBrowser: getWorkspaceSetting(workspaceId, "scraper_show_browser") === "true",
    paydayDay: Number(getWorkspaceSetting(workspaceId, "payday_day") ?? "1"),
    monthlyTarget: Number.isFinite(target) && target > 0 ? target : null,
    autoSyncEnabled: getGlobalSetting("auto_sync_enabled") !== "false",
    autoSyncTime:
      storedTime && AUTO_SYNC_TIME_RE.test(storedTime) ? storedTime : "06:00",
    language: storedLang === "en" ? "en" : "he",
    displayName: profileName && profileName !== "Default" ? profileName : profileDisplayName(workspaceId),
    household: readHousehold(workspaceId),
  };
}

/** The active profile's name is the display name. The seeded "Default" profile has none. */
function profileDisplayName(workspaceId: number): string {
  const ws = getWorkspace(workspaceId);
  const legacy = getGlobalSetting("display_name")?.trim() ?? "";
  if (!ws) return legacy;
  // One-time migration: the old separate display name becomes the seeded profile's name (no-op once renamed).
  if (ws.name === "Default" && legacy) {
    try {
      return updateWorkspace(ws.id, legacy).name;
    } catch {
      return legacy;
    }
  }
  return ws.name === "Default" ? "" : ws.name;
}

function readHousehold(workspaceId: number): Household {
  const raw = getWorkspaceSetting(workspaceId, "household");
  if (!raw) return EMPTY_HOUSEHOLD;
  try {
    return parseHousehold(JSON.parse(raw));
  } catch {
    return EMPTY_HOUSEHOLD;
  }
}

export function updateAppSettings(
  workspaceId: number,
  settings: Partial<AppSettings>,
  profile?: { id: number; name: string } | null
): AppSettings {
  const db = getDb();
  const update = db.transaction(() => {
    if (settings.monthsToSync !== undefined) {
      const months = settings.monthsToSync;
      if (!Number.isInteger(months) || months < 1 || months > 36) {
        throw new Error("monthsToSync must be 1-36 months");
      }
      setWorkspaceSetting(workspaceId, "months_to_sync", String(months));
    }
    if (settings.aiProvider !== undefined) {
      setGlobalSetting("ai_provider", settings.aiProvider);
    }
    if (settings.ollamaUrl !== undefined) {
      const url = normalizeOllamaUrl(settings.ollamaUrl);
      if (!url) throw new Error(OLLAMA_URL_ERROR);
      setGlobalSetting("ai_ollama_url", url);
    }
    if (settings.ollamaModel !== undefined) {
      setGlobalSetting("ai_ollama_model", settings.ollamaModel);
    }
    if (settings.showBrowser !== undefined) {
      setWorkspaceSetting(
        workspaceId,
        "scraper_show_browser",
        settings.showBrowser ? "true" : "false"
      );
    }
    if (settings.paydayDay !== undefined) {
      if (typeof settings.paydayDay !== "number" || !Number.isFinite(settings.paydayDay)) {
        throw new Error("paydayDay must be a number 1-28");
      }
      const clamped = Math.max(1, Math.min(28, Math.round(settings.paydayDay)));
      setWorkspaceSetting(workspaceId, "payday_day", String(clamped));
    }
    if (settings.monthlyTarget !== undefined) {
      const t = settings.monthlyTarget;
      // A wrong type is a bad request; only null/0 mean "clear the target".
      if (t != null && (typeof t !== "number" || !Number.isFinite(t))) {
        throw new Error("monthlyTarget must be a positive number or null");
      }
      if (t == null || t <= 0) {
        getDb()
          .prepare(
            "DELETE FROM workspace_settings WHERE workspace_id = ? AND key = ?"
          )
          .run(workspaceId, "monthly_target");
      } else {
        setWorkspaceSetting(workspaceId, "monthly_target", String(Math.round(t)));
      }
    }
    if (settings.autoSyncEnabled !== undefined) {
      setGlobalSetting(
        "auto_sync_enabled",
        settings.autoSyncEnabled ? "true" : "false"
      );
    }
    if (settings.autoSyncTime !== undefined) {
      if (!AUTO_SYNC_TIME_RE.test(settings.autoSyncTime)) {
        throw new Error("autoSyncTime must be HH:MM 24-hour");
      }
      setGlobalSetting("auto_sync_time", settings.autoSyncTime);
    }
    if (settings.language !== undefined) {
      if (settings.language !== "en" && settings.language !== "he") {
        throw new Error("language must be 'en' or 'he'");
      }
      setGlobalSetting("language", settings.language);
    }
    if (settings.displayName !== undefined) {
      const name = String(settings.displayName).trim().slice(0, 40);
      if (name && profile) profile = updateProfile(profile.id, name); // the display name is the profile name
      else if (name) updateWorkspace(workspaceId, name);
    }
    if (settings.household !== undefined) {
      setWorkspaceSetting(
        workspaceId,
        "household",
        JSON.stringify(parseHousehold(settings.household))
      );
    }
  });
  update();
  return getAppSettings(workspaceId, profile?.name);
}
