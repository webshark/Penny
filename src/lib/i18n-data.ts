"use client";

import { useTranslations } from "next-intl";
import type { FormatLastSyncLabels } from "./formatters";
import { BANK_PROVIDERS } from "./types";

type TranslatorFn = ReturnType<typeof useTranslations<string>>;

export function translateCategoryName(
  rawName: string,
  tCat: TranslatorFn,
): string {
  try {
    const translated = tCat(rawName);
    return translated && translated !== rawName ? translated : rawName;
  } catch {
    return rawName;
  }
}

export function translateProviderName(
  providerId: string,
  fallback: string,
  tBanks: TranslatorFn,
): string {
  try {
    const key = `${providerId}.name`;
    const translated = tBanks(key);
    return translated && translated !== key ? translated : fallback;
  } catch {
    return fallback;
  }
}

export function translateProviderBlurb(
  providerId: string,
  fallback: string,
  tBanks: TranslatorFn,
): string {
  try {
    const key = `${providerId}.blurb`;
    const translated = tBanks(key);
    return translated && translated !== key ? translated : fallback;
  } catch {
    return fallback;
  }
}

/** Localized label/placeholder/hint for a scraper credential field, falling back to the raw English. */
export function translateCredentialField(
  providerId: string,
  field: { key: string; label: string; placeholder?: string; hint?: string },
  tBanks: TranslatorFn,
): { label: string; placeholder?: string; hint?: string } {
  const base =
    field.key === "password" && providerId === "isracard" ? "isracardPassword"
    : field.key === "password" && providerId === "oneZero" ? "oneZeroPassword"
    : field.key;
  const tr = (prop: string, fallback?: string) => {
    if (fallback === undefined) return undefined;
    const key = `fields.${base}.${prop}`;
    return tBanks.has(key) ? tBanks(key) : fallback;
  };
  return {
    label: tr("label", field.label)!,
    placeholder: tr(field.key === "num" ? `${providerId}Placeholder` : "placeholder", field.placeholder),
    hint: tr("hint", field.hint),
  };
}

export function useFormatterLabels(): FormatLastSyncLabels {
  const t = useTranslations("formatters");
  return {
    never: t("neverSynced"),
    justNow: t("justNow"),
    minute: (n) => t("minutesAgoShort", { count: n }),
    hour: (n) => t("hoursAgoShort", { count: n }),
    day: (n) => t("daysAgoShort", { count: n }),
    week: (n) => t("weeksAgoShort", { count: n }),
    monthAgo: (n) => t("monthsAgoShort", { count: n }),
  };
}

/** A synced account's name in the user's language ("הפועלים · 0001"); other assets keep the name the person gave them. */
export function accountLabel(asset: { name: string; provider?: string }, tBanks: TranslatorFn): string {
  if (!asset.provider) return asset.name;
  const [english, last4] = asset.name.split(" · ");
  const bank = translateProviderName(asset.provider, english, tBanks);
  return last4 ? `${bank} · ${last4}` : bank;
}

/** A server-built "Bank Hapoalim · 0001" label in the user's language, matched by the provider's English name. */
export function localizeBankLabel(label: string, tBanks: TranslatorFn): string {
  const [english, ...rest] = label.split(" · ");
  const provider = BANK_PROVIDERS.find((p) => p.name === english);
  if (!provider) return label;
  return [translateProviderName(provider.id, english, tBanks), ...rest].join(" · ");
}
