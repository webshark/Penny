"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { SettingCard } from "@/components/settings/section-shell";
import { getSettings, updateSettings } from "@/lib/api";
import type { AppSettings } from "@/lib/types";

type Lang = "en" | "he";

/** The interface language, on its own settings page. */
export function LanguageCard() {
  const t = useTranslations("settings.appearance");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = useLocale() as Lang;

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const storedLang: Lang = settings?.language ?? locale;

  const mutation = useMutation({
    mutationFn: (next: Lang) =>
      updateSettings({ language: next } as Partial<AppSettings>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      // No "saved" toast: it would show in the old language, and the whole app switching is the confirmation.
      router.refresh();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : tCommon("tryAgain"));
    },
  });

  const langOptions: { value: Lang; label: string; description: string }[] = [
    { value: "en", label: t("languageEnglish"), description: t("languageEnglishDesc") },
    { value: "he", label: t("languageHebrew"), description: t("languageHebrewDesc") },
  ];

  return (
      <SettingCard title={t("languageCardTitle")} description={t("languageCardDescription")}>
        <div role="radiogroup" aria-label={t("languageCardTitle")} className="grid grid-cols-2 gap-2 py-1">
          {langOptions.map((o) => {
            const isActive = (mutation.isPending ? mutation.variables : storedLang) === o.value; // optimistic; reverts on error
            const isPending = mutation.isPending && mutation.variables === o.value;
            const dir = o.value === "he" ? "rtl" : "ltr";
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                lang={o.value}
                dir={dir}
                onClick={() => {
                  if (storedLang === o.value || mutation.isPending) return;
                  mutation.mutate(o.value);
                }}
                disabled={mutation.isPending}
                className={`relative flex min-h-24 flex-col justify-between overflow-hidden rounded-xl border p-3 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70 ${
                  isActive ? "border-primary bg-primary/10" : "border-border/60 hover:border-border hover:bg-muted/40"
                }`}
              >
                <span className="flex w-full items-start justify-between gap-2">
                  <span className="text-lg leading-6 font-semibold">{o.label}</span>
                  <span aria-hidden className={`flex size-5 shrink-0 items-center justify-center rounded-full ${isActive ? "bg-primary text-primary-foreground" : "border border-border"}`}>
                    {isPending ? <Loader2 className="size-3 animate-spin" /> : isActive ? <Check className="size-3.5" /> : null}
                  </span>
                </span>
                <span className={`mt-2 line-clamp-2 text-caption leading-tight ${isActive ? "text-foreground/80" : "text-muted-foreground"}`}>
                  {isPending ? t("languageSaving") : o.description}
                </span>
              </button>
            );
          })}
        </div>
      </SettingCard>
  );
}
