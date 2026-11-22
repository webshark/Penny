"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { AVATAR_COLORS, profileName } from "@/lib/profile-avatar";
import type { Profile } from "@/lib/types";

type AvatarLike = Pick<Profile, "id" | "name"> & { avatarColor?: string | null; avatarPhoto?: string | null };

/** A person's picture: their photo, or the first letter of their name on their colour (a stable one until they pick). */
export function ProfileAvatar({ profile, className }: { profile: AvatarLike; className?: string; px?: number }) {
  const color = profile.avatarColor ?? AVATAR_COLORS[Math.abs(profile.id - 1) % AVATAR_COLORS.length];
  const tp = useTranslations("profiles");
  const initial = Array.from(profileName(profile.name, tp("me")).trim())[0]?.toUpperCase() ?? "?";
  return (
    <span aria-hidden className={cn("flex size-7 shrink-0 select-none items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-white", className)} style={profile.avatarPhoto ? undefined : { background: color }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a small data URL; next/image adds nothing here */}
      {profile.avatarPhoto ? <img src={profile.avatarPhoto} alt="" className="size-full object-cover" /> : initial}
    </span>
  );
}
