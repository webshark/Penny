"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * The app's safety net. Without a root error boundary any thrown render error falls
 * through to Next's bare "Application error" screen, which in a local-first app looks
 * like the data is gone. This renders inside the root layout, so theme, fonts and
 * translations still work here.
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error("[ui] page failed to render:", error);
  }, [error]);

  // A server error arrives as a plain Error whose message is withheld in production;
  // its digest is the id of the matching line in the server log.
  const detail = error instanceof Error ? error.message : "";
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "")
      : "";

  return (
    <div className="mx-auto w-full max-w-[1920px] px-4 pb-10 pt-6 md:px-6 lg:px-8">
      <section role="alert" className="rounded-2xl border border-border/60 bg-card px-6 py-10 sm:px-10">
        <TriangleAlert className="mb-5 size-7 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">{t("hint")}</p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button size="lg" onClick={() => retry()}>
            {t("retry")}
          </Button>
          <Button size="lg" variant="outline" onClick={() => window.location.reload()}>
            {t("reload")}
          </Button>
          <Link href="/" className={buttonVariants({ variant: "ghost", size: "lg" })}>
            {t("home")}
          </Link>
        </div>
        {(detail || digest) && (
          <details className="mt-6 text-footnote text-muted-foreground">
            <summary className="min-h-11 cursor-pointer select-none">{t("details")}</summary>
            {detail && (
              <p className="mt-2 break-words font-mono text-xs leading-relaxed" dir="ltr">
                {detail}
              </p>
            )}
            {digest && (
              <p className="mt-1 text-xs">
                {t("digest")}: <span className="font-mono" dir="ltr">{digest}</span>
              </p>
            )}
          </details>
        )}
      </section>
    </div>
  );
}
