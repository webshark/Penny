"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { markProfileChosen, useProfiles, useSwitchProfile } from "@/components/layout/workspace-switcher";
import { deleteProfile, saveProfile } from "@/lib/api";
import { profileName } from "@/lib/profile-avatar";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { AvatarEditor, type AvatarDraft } from "./avatar-editor";
import { ProfileAvatar } from "./profile-avatar";

// Immersive "who's using?" screen: always dark, whatever the app theme.
const tile = "group flex min-h-11 flex-col items-center gap-3 rounded-3xl p-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const square =
  "size-24 text-5xl md:size-36 md:text-6xl ring-white/0 ring-offset-4 ring-offset-[#0c0b14] motion-safe:transition motion-safe:duration-200 group-hover:ring-4 group-hover:ring-white group-focus-visible:ring-4 group-focus-visible:ring-white motion-safe:group-hover:scale-105 motion-safe:group-focus-visible:scale-105 motion-safe:group-active:scale-95";

type Draft = { id: number | null; name: string; avatar: AvatarDraft };

export function ProfilesPage() {
  const t = useTranslations("profiles");
  const px = useIsMobile() ? 88 : 132; // a little inside the 96/144 square
  const nameOf = (p: Profile) => profileName(p.name, t("me"));
  const router = useRouter();
  const qc = useQueryClient();
  const switchProfile = useSwitchProfile();
  const [managing, setManaging] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { profiles, activeId } = useProfiles();

  const choose = (p: Profile) => {
    markProfileChosen();
    switchProfile(p);
    router.push("/");
  };

  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : t("error"));

  const save = useMutation({
    mutationFn: (d: Draft) => saveProfile(d.id, d.name, { avatarColor: d.avatar.color, avatarPhoto: d.avatar.photo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      setDraft(null);
    },
    onError,
  });

  const remove = useMutation({
    // Removes the profile and its preferences only; the household's data stays.
    mutationFn: (id: number) => deleteProfile(id),
    onSuccess: (_r, id) => {
      const next = profiles.find((p) => p.id !== id);
      if (id === activeId && next) switchProfile(next);
      qc.invalidateQueries({ queryKey: ["profiles"] });
      setDraft(null);
    },
    onError,
  });

  const openEditor = (p?: Profile) => {
    setConfirmDelete(false);
    setDraft(
      p
        ? { id: p.id, name: nameOf(p), avatar: { color: p.avatarColor, photo: p.avatarPhoto } }
        : { id: null, name: "", avatar: { color: null, photo: null } }
    );
  };

  return (
    <main className="fixed inset-0 z-40 flex flex-col items-center justify-center overflow-y-auto bg-[#0c0b14] bg-[radial-gradient(ellipse_at_top,#2a2160_0%,transparent_60%)] px-4 py-12 text-white">
      {/* The brand lives here only; inside the app the sidebar stays free of it. */}
      <p className="absolute top-6 text-lg font-semibold tracking-tight text-white/80" lang="en" dir="ltr">Penny</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
        {managing ? t("manageTitle") : t("title")}
      </h1>

      <ul className="mt-10 flex max-w-3xl flex-wrap justify-center gap-6 sm:gap-10">
        {profiles.map((p, i) => (
          <li key={p.id} className="motion-safe:animate-[fadeIn_0.45s_ease-out_both]" style={{ animationDelay: `${120 + i * 70}ms` }}>
            <button
              type="button"
              className={tile}
              onClick={() => (managing ? openEditor(p) : choose(p))}
              aria-label={managing ? t("editProfile", { name: nameOf(p) }) : nameOf(p)}
            >
              <span className="relative">
                <ProfileAvatar profile={p} px={px} className={cn(square, managing && "brightness-50")} />
                {managing ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-12 items-center justify-center rounded-full border-2 border-white bg-black/40">
                      <Pencil className="size-6 text-white" />
                    </span>
                  </span>
                ) : null}
              </span>
              <span className="max-w-36 truncate text-lg text-white/60 group-hover:text-white group-focus-visible:text-white">
                {nameOf(p)}
              </span>
            </button>
          </li>
        ))}
        <li className="motion-safe:animate-[fadeIn_0.45s_ease-out_both]" style={{ animationDelay: `${120 + profiles.length * 70}ms` }}>
          <button type="button" className={tile} onClick={() => openEditor()}>
            <span
              className={cn(
                square,
                "flex items-center justify-center rounded-[28%] bg-white/10 text-white/70 group-hover:bg-white/20 group-hover:text-white"
              )}
            >
              <Plus className="size-10" />
            </span>
            <span className="text-lg text-white/60 group-hover:text-white group-focus-visible:text-white">{t("add")}</span>
          </button>
        </li>
      </ul>

      <Button
        variant="outline"
        size="lg"
        className={cn("mt-14 border-white/50 bg-transparent px-8 text-white/80 hover:bg-white hover:text-black", managing && "bg-white text-black")}
        aria-pressed={managing}
        onClick={() => setManaging((m) => !m)}
      >
        {managing ? t("done") : t("manage")}
      </Button>

      <Dialog open={draft != null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          {draft ? (
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.name.trim()) save.mutate(draft);
              }}
            >
              <DialogHeader>
                <DialogTitle>{draft.id == null ? t("add") : t("edit")}</DialogTitle>
              </DialogHeader>

              <AvatarEditor id={draft.id ?? profiles.length + 1} name={draft.name} value={draft.avatar} onChange={(avatar) => setDraft({ ...draft, avatar })} />

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t("name")}
                <Input
                  autoFocus
                  required
                  maxLength={60}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="h-11"
                />
              </label>


              {confirmDelete ? (
                <p role="alert" className="text-sm text-muted-foreground">
                  {t("deleteWarning")}
                </p>
              ) : null}

              <DialogFooter className="gap-2 sm:justify-between">
                {/* Never offer deleting the last profile; the server refuses it too. */}
                {draft.id != null && profiles.length > 1 ? (
                  confirmDelete ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="lg"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(draft.id!)}
                    >
                      {t("confirmDelete")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="lg"
                      className="text-destructive"
                      onClick={() => setConfirmDelete(true)}
                    >
                      {t("delete")}
                    </Button>
                  )
                ) : (
                  <span />
                )}
                <Button type="submit" size="lg" disabled={!draft.name.trim() || save.isPending}>
                  {t("save")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
