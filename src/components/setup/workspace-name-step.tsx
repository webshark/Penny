"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

interface WorkspaceNameStepProps {
  onComplete: (name: string) => void;
  submitting?: boolean;
}

const SUGGESTION_KEYS = [
  "workspaceSuggestionPersonal",
  "workspaceSuggestionBusiness",
  "workspaceSuggestionJoint",
  "workspaceSuggestionSide",
] as const;

export function WorkspaceNameStep({
  onComplete,
  submitting = false,
}: WorkspaceNameStepProps) {
  const t = useTranslations("setup");
  const [name, setName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onComplete(trimmed);
  }

  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 pt-8 text-center">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {t("workspaceStep")}
      </div>
      <h1 className="max-w-[440px] font-semibold text-4xl leading-[1.08] tracking-tight">
        {t("workspaceTitle")}
      </h1>
      <p className="max-w-[380px] text-sm leading-relaxed text-muted-foreground">
        {t("workspaceDescriptionBefore")}{" "}
        <span className="text-foreground underline decoration-primary underline-offset-2">
          {t("workspaceExample")}
        </span>
        {t("workspaceDescriptionAfter")}
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-2 flex w-full max-w-[380px] flex-col items-center gap-3"
      >
        <div className="relative w-full rounded-2xl bg-card p-5 text-start shadow-sm">
          <div className="absolute end-5 top-5 text-xs font-semibold text-muted-foreground">
            {t("workspaceCharCount", { count: name.length })}
          </div>
          <label
            htmlFor="workspace-name"
            className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
          >
            {t("workspaceLabel")}
          </label>
          <input
            id="workspace-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
            disabled={submitting}
            placeholder={t("workspaceExample")}
            className="mt-2 w-full border-0 bg-transparent p-0 font-semibold text-2xl leading-tight tracking-tight text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring placeholder:text-muted-foreground/70"
          />
        </div>

        <div className="flex flex-wrap justify-center gap-1.5">
          {SUGGESTION_KEYS.map((key) => t(key)).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setName(s)}
              disabled={submitting}
              className="rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          {t("workspaceRenameHint")}
        </p>

        <IconButton showLabel
          label={submitting ? t("workspaceCreating") : t("workspaceCreateButton")}
          variant="default"
          type="submit"
          disabled={!name.trim() || submitting}
        >
          <Plus className="size-4" aria-hidden />
        </IconButton>
      </form>

      <div className="mt-6 flex w-full max-w-[380px] items-center justify-between text-xs text-muted-foreground/80">
        <span>{t("workspaceEncryptedLocally")}</span>
        <span>
          {t("workspacePressEnter")}{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-semibold">
            ↵
          </kbd>{" "}
          {t("workspaceToContinue")}
        </span>
      </div>
    </div>
  );
}
