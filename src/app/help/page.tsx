import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { CONCEPTS } from "@/lib/orientation";
import { ImportGuide } from "@/components/settings/import-guide";

export const dynamic = "force-dynamic";

const STEPS = ["connect", "today", "budget", "rituals"] as const;
const KEYS = [["Ctrl / ⌘ + K", "palette"], ["/", "search"], ["Esc", "close"], ["Tab", "move"]] as const;

export default async function HelpPage() {
  const t = await getTranslations("help");
  const tc = await getTranslations("concepts");
  const tOn = await getTranslations("onboarding");
  const section = "card-surface";
  return (
    <AppShell>
      <PageHeader title={t("title")} />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-8 pt-3 md:px-6 lg:px-8">
        <section className={section} aria-labelledby="help-how">
          <h2 id="help-how" className="card-title">{t("howTitle")}</h2>
          <ol className="mt-4 list-decimal space-y-3 ps-5 marker:font-semibold marker:text-primary leading-6">
            {STEPS.map((s) => <li key={s}><span className="font-semibold">{t(`step_${s}_title`)}</span><span className="block text-muted-foreground">{t(`step_${s}_body`)}</span></li>)}
          </ol>
          {/* A ghost button that may wrap: the label is a full sentence and does not fit on one line at 320. */}
          <Link href="/setup?force=1" className="mt-4 inline-flex min-h-11 max-w-full items-center justify-center rounded-full px-5 py-2 text-center text-sm leading-5 font-medium text-primary transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none">{tOn("reopen")}</Link>
        </section>

        <section className={section} aria-labelledby="help-concepts">
          <h2 id="help-concepts" className="card-title">{t("conceptsTitle")}</h2>
          <dl className="mt-4 space-y-4">
            {CONCEPTS.map((c) => (
              <div key={c}>
                <dt className="leading-6 font-semibold">{tc(`${c}.term`)}</dt>
                <dd className="mt-0.5 leading-6 text-muted-foreground">{tc(`${c}.body`)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={section} aria-labelledby="help-import">
          <h2 id="help-import" className="card-title">{t("importTitle")}</h2>
          <div className="mt-4"><ImportGuide /></div>
          <Link href="/settings/bank#import" className={`${buttonVariants({ variant: "ghost" })} mt-4`}>{t("importCta")}</Link>
        </section>

        <section className={`${section} hidden md:block`} aria-labelledby="help-keys">
          <h2 id="help-keys" className="card-title">{t("keysTitle")}</h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 leading-6">
            {KEYS.map(([k, d]) => (
              <div key={d} className="contents">
                <dt><kbd dir="ltr" className="rounded-lg border border-border bg-muted px-2 py-1 font-mono text-footnote">{k}</kbd></dt>
                <dd>{t(`key_${d}`)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={section} aria-labelledby="help-you">
          <h2 id="help-you" className="card-title">{t("youTitle")}</h2>
          <p className="mt-2 text-footnote text-pretty text-muted-foreground">{t("youBody")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/welcome" className={buttonVariants()}>{t("youCta")}</Link>
            <Link href="/settings/appearance" className={buttonVariants({ variant: "ghost" })}>{t("simpleCta")}</Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
