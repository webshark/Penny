"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Compass } from "lucide-react";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { buttonVariants } from "@/components/ui/button";

/** An unknown or stale URL: keep the menu around it so there is a way back. */
export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <AppShell>
      <PageHeader title={t("notFoundTitle")} />
      <div className="mx-auto w-full max-w-[1920px] px-4 pb-10 pt-3 md:px-6 lg:px-8">
        <section className="rounded-2xl border border-border/60 bg-card px-6 py-10 sm:px-10">
          <Compass className="mb-5 size-7 text-muted-foreground" aria-hidden />
          {/* The page header already carries the title, so the card only explains. */}
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground">{t("notFoundHint")}</p>
          <Link href="/" className={buttonVariants({ size: "lg", className: "mt-6" })}>
            {t("home")}
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
