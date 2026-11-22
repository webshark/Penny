"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AVATAR_COLORS } from "@/lib/profile-avatar";
import { ProfileAvatar } from "./profile-avatar";

export type AvatarDraft = { color: string | null; photo: string | null };

/** Squares and shrinks a picked image to 192px JPEG in the browser, so the stored picture stays small. */
async function toAvatarPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 192;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 192, 192);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** The picture of a profile: a photo, or the initial on a colour. Shared by Profiles and onboarding. */
export function AvatarEditor({ id, name, value, onChange }: { id: number; name: string; value: AvatarDraft; onChange: (v: AvatarDraft) => void }) {
  const t = useTranslations("profiles");
  const input = useRef<HTMLInputElement>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    try { onChange({ ...value, photo: await toAvatarPhoto(file) }); }
    catch { toast.error(t("photoFailed")); }
  };
  return (
    <div className="flex flex-col items-center gap-4">
      <ProfileAvatar profile={{ id, name, avatarColor: value.color, avatarPhoto: value.photo }} className="size-24 text-4xl" />
      <div className="flex flex-wrap justify-center gap-2">
        <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" onClick={() => input.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
          <Camera className="size-4" aria-hidden />{value.photo ? t("changePhoto") : t("addPhoto")}
        </button>
        {value.photo && (
          <button type="button" onClick={() => onChange({ ...value, photo: null })} className="inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <Trash2 className="size-4" aria-hidden />{t("removePhoto")}
          </button>
        )}
      </div>
      {!value.photo && (
        <div role="radiogroup" aria-label={t("color")} className="flex flex-wrap justify-center gap-2">
          {AVATAR_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={value.color === c} aria-label={c} onClick={() => onChange({ ...value, color: c })}
              className="size-8 rounded-full ring-offset-2 ring-offset-background focus-visible:outline-2 focus-visible:outline-ring aria-checked:ring-2 aria-checked:ring-foreground" style={{ background: c }} />
          ))}
        </div>
      )}
    </div>
  );
}
