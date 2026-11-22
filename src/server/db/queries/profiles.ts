import "server-only";

import { ApiError } from "@/server/lib/api-error";

import { getDb } from "../index";
import type { Profile } from "@/lib/types";
import { parsePip, type AvatarInput, type ProfilePip } from "@/lib/profile-avatar";

type Row = { id: number; workspace_id: number; name: string; avatar_emoji: string | null; avatar_color: string | null; avatar_pet: string | null; avatar_photo: string | null; created_at: string };
const COLS = "id, workspace_id, name, avatar_emoji, avatar_color, avatar_pet, avatar_photo, created_at";
const map = (r: Row): Profile => ({ id: r.id, workspaceId: r.workspace_id, name: r.name, avatarEmoji: r.avatar_emoji, avatarColor: r.avatar_color, avatarPet: readPip(r.avatar_pet), avatarPhoto: r.avatar_photo, createdAt: r.created_at });

/** Stored JSON; anything unreadable is treated as no Pip. */
function readPip(json: string | null): ProfilePip | null {
  try { return json ? parsePip(JSON.parse(json)) : null; } catch { return null; }
}
const pipJson = (p: ProfilePip | null | undefined) => (p ? JSON.stringify(p) : null);

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new ApiError("Profile name is required", 400);
  if (trimmed.length > 60) throw new ApiError("Profile name too long", 400);
  return trimmed;
}

/** Profiles of every household; in practice one household. Workspaces without profiles stay hidden. */
export function listProfiles(): Profile[] {
  return (getDb().prepare(`SELECT ${COLS} FROM profiles ORDER BY id`).all() as Row[]).map(map);
}

export function getProfile(id: number): Profile | null {
  const row = getDb().prepare(`SELECT ${COLS} FROM profiles WHERE id = ?`).get(id) as Row | undefined;
  return row ? map(row) : null;
}

/** The household new profiles join: the one existing profiles share (lowest workspace as a fallback). */
export function householdId(): number {
  const row = getDb().prepare("SELECT workspace_id AS id FROM profiles ORDER BY id LIMIT 1").get() as { id: number } | undefined;
  return row?.id ?? (getDb().prepare("SELECT MIN(id) AS id FROM workspaces").get() as { id: number }).id;
}

export function createProfile(name: string, avatar: AvatarInput = {}): Profile {
  const result = getDb()
    .prepare("INSERT INTO profiles (workspace_id, name, avatar_emoji, avatar_color, avatar_pet, avatar_photo) VALUES (?, ?, ?, ?, ?, ?)")
    .run(householdId(), cleanName(name), avatar.avatarEmoji ?? null, avatar.avatarColor ?? null, pipJson(avatar.avatarPet), avatar.avatarPhoto ?? null);
  return getProfile(Number(result.lastInsertRowid))!;
}

export function updateProfile(id: number, name: string, avatar: AvatarInput = {}): Profile {
  const existing = getProfile(id);
  if (!existing) throw new ApiError("Profile not found", 404);
  getDb()
    .prepare("UPDATE profiles SET name = ?, avatar_emoji = ?, avatar_color = ?, avatar_pet = ?, avatar_photo = ? WHERE id = ?")
    .run(
      cleanName(name),
      avatar.avatarEmoji !== undefined ? avatar.avatarEmoji : existing.avatarEmoji,
      avatar.avatarColor !== undefined ? avatar.avatarColor : existing.avatarColor,
      pipJson(avatar.avatarPet !== undefined ? avatar.avatarPet : existing.avatarPet),
      avatar.avatarPhoto !== undefined ? avatar.avatarPhoto : existing.avatarPhoto,
      id
    );
  return getProfile(id)!;
}

/** Removes the profile and its UI preferences only; household data is never touched. */
export function deleteProfile(id: number): void {
  const p = getProfile(id);
  if (!p) throw new ApiError("Profile not found", 404);
  const db = getDb();
  const left = (db.prepare("SELECT COUNT(*) AS n FROM profiles WHERE workspace_id = ?").get(p.workspaceId) as { n: number }).n;
  if (left <= 1) throw new ApiError("Cannot delete the only profile", 409, "last-profile");
  db.transaction(() => {
    db.prepare("DELETE FROM synced_preferences WHERE workspace_id = ? AND profile = ?").run(p.workspaceId, `p${id}`);
    db.prepare("DELETE FROM profiles WHERE id = ?").run(id);
  })();
}

/** The profile named by the X-Profile-ID header, if it belongs to this household. */
export function profileFromRequest(req: Request, workspaceId: number): Profile | null {
  const id = Number(req.headers.get("x-profile-id"));
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const p = getProfile(id);
  return p && p.workspaceId === workspaceId ? p : null;
}
