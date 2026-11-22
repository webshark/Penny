"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { SettingCard } from "@/components/settings/section-shell";

/** The open-source scrapers behind the automatic connection, linked so the reader can inspect them. */
const LIBRARIES = [
  { name: "@sergienko4/israeli-bank-scrapers", href: "https://github.com/sergienko4/israeli-bank-scrapers" },
  { name: "israeli-bank-scrapers", href: "https://github.com/eshaham/israeli-bank-scrapers" },
  { name: "israeli-pension-scrapers", href: "https://github.com/MotionPeak/israeli-pension-scrapers" },
];

/** What an automatic connection does, what it cannot do, and which code reads the bank's site. */
export function ScraperDisclaimer() {
  const t = useTranslations("settings.bank");
  return (
    <SettingCard title={t("disclaimerTitle")}>
      <div className="space-y-3 text-footnote">
        <p className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[var(--status-heads-up)]" aria-hidden />
          <span>{t("disclaimerBody")}</span>
        </p>
        <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
          <li>{t("disclaimerPointLogin")}</li>
          <li>{t("disclaimerPointBreak")}</li>
          <li>{t("disclaimerPointLocal")}</li>
        </ul>
        <div>
          <p className="mb-1 text-muted-foreground">{t("disclaimerLibraries")}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {LIBRARIES.map((lib) => (
              <li key={lib.href}>
                <a
                  href={lib.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <bdi dir="ltr">{lib.name}</bdi>
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SettingCard>
  );
}
