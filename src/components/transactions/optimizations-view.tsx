"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowLeftRight, ChevronDown, History, ListChecks, Sparkles } from "lucide-react";
import { getFlowMatches, getHome } from "@/lib/api";
import { FlowMatchesCard } from "@/components/reviews/flow-matches-card";
import { CategorizeButton } from "@/components/dashboard/categorize-button";
import { MoneyOnTableCard } from "./money-on-table-card";

/** Optimizations: the tools that clean up the data, in one place, each opening in line. */
export function OptimizationsView() {
  const t = useTranslations("optimizations");
  const [open, setOpen] = useState<string | null>(null);
  const flows = useQuery({ queryKey: ["flow-matches"], queryFn: getFlowMatches });
  const home = useQuery({ queryKey: ["home"], queryFn: () => getHome() });
  const review = home.data?.needsAttention;
  const toReview = review ? review.uncategorized + review.flagged : null;
  const flowCount = flows.data ? flows.data.length : null;

  const tools = [
    { id: "transfers", Icon: ArrowLeftRight, badge: flowCount, body: flowCount ? <FlowMatchesCard /> : <p className="text-sm text-muted-foreground">{t("transfersNone")}</p> },
    { id: "ai", Icon: Sparkles, badge: review?.uncategorized ?? null, body: <div className="flex flex-wrap items-center gap-3"><CategorizeButton /><p className="text-sm text-muted-foreground">{t("aiHint")}</p></div> },
    { id: "review", Icon: ListChecks, badge: toReview, href: "/transactions?review=1" },
    { id: "rules", Icon: History, badge: null, href: "/settings/rules" },
  ] as const;

  return (
    <div className="space-y-4">
      <MoneyOnTableCard />
      <p className="max-w-2xl text-sm text-muted-foreground">{t("intro")}</p>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {tools.map((tool) => {
          const inline = "body" in tool;
          const isOpen = open === tool.id;
          const inner = <>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"><tool.Icon className="size-4" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-semibold">{t(`${tool.id}Title`)}{tool.badge ? <span className="rounded-full bg-primary/15 px-2 text-xs tabular-nums text-primary">{tool.badge}</span> : null}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{t(`${tool.id}Desc`)}</span>
            </span>
            {inline && <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`} aria-hidden />}
          </>;
          const cls = `flex h-full w-full items-start gap-3 rounded-2xl border bg-card p-4 text-start hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring ${isOpen ? "border-primary" : "border-border"}`;
          return (
            <li key={tool.id}>
              {inline
                ? <button type="button" aria-expanded={isOpen} aria-controls={`tool-${tool.id}`} onClick={() => setOpen(isOpen ? null : tool.id)} className={cls}>{inner}</button>
                : <Link href={tool.href} className={cls}>{inner}</Link>}
            </li>
          );
        })}
      </ul>
      {tools.map((tool) => "body" in tool && open === tool.id && (
        <section key={tool.id} id={`tool-${tool.id}`} aria-label={t(`${tool.id}Title`)} className="rounded-2xl border border-border bg-card p-4">{tool.body}</section>
      ))}
    </div>
  );
}
