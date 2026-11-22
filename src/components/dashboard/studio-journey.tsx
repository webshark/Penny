"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Check, Sparkles, ArrowUpLeft, Circle } from "lucide-react";
import { toast } from "sonner";
import { useActiveWorkspaceId } from "@/lib/workspace-store";
import type { DashboardSummary } from "@/lib/types";
import { useStudioCopy } from "./studio-copy";

const noSubscribe = () => () => {}; // read once per render; this component's own writes go through state

export function StudioJourney({ data, month }: { data: DashboardSummary; month: string }) {
  const c = useStudioCopy();
  const workspace = useActiveWorkspaceId();
  const key = `shekel.budget-review.v1.${workspace ?? "default"}.${month}`;
  const stored = useSyncExternalStore(noSubscribe, () => { try { return localStorage.getItem(key) === "true"; } catch { return false; } }, () => false);
  const [toggled, setToggled] = useState<{ key: string; on: boolean } | null>(null);
  const reviewed = toggled?.key === key ? toggled.on : stored;
  // categoryBreakdown contains leaf transactions, unlike parent rollups.
  const categorizedCount = data.categoryBreakdown.filter((row) => row.categoryId > 0).reduce((sum, row) => sum + row.count, 0);
  const steps = [
    { label: c.budgetStep, done: data.totalBudget > 0, href: "/settings/general#section-monthly-target" },
    { label: c.dataStep, done: data.transactionCount > 0 && categorizedCount >= data.transactionCount, href: "/transactions" },
    { label: c.reviewStep, done: reviewed },
  ];
  const complete = steps.filter((step) => step.done).length;
  const toggle = () => {
    setToggled({ key, on: !reviewed });
    try { if (reviewed) localStorage.removeItem(key); else localStorage.setItem(key, "true"); }
    catch { toast.error(c.storageError); }
    if (!reviewed) toast.success(c.reviewed);
  };
  return <section className="studio-panel studio-journey" aria-labelledby="studio-journey-title">
    <div className="studio-journey-icon"><Sparkles size={21} aria-hidden="true" /></div>
    <div className="studio-journey-main"><div className="studio-panel-heading"><div><h2 id="studio-journey-title">{c.journey}</h2><p>{c.journeyHint}</p></div><span className="studio-milestone-count" aria-live="polite">{complete}/3 <small>{c.milestones}</small></span></div>
      <div className="studio-milestone-track" aria-hidden="true">{steps.map((step) => <i key={step.label} data-complete={step.done} />)}</div>
      <ul className="studio-steps">{steps.map((step) => <li key={step.label} data-complete={step.done}>{step.done ? <Check size={15} aria-label={c.complete} /> : <Circle size={13} aria-label={c.pending} />}{step.href ? <Link href={step.href}>{step.label}</Link> : <span>{step.label}</span>}</li>)}</ul>
      <div className="studio-journey-actions"><button className="studio-soft-button" onClick={toggle} aria-pressed={reviewed}>{reviewed ? c.undoReview : c.review}</button><Link href="/journey">{c.goals}<ArrowUpLeft size={14} aria-hidden="true" className="ltr:-scale-x-100" /></Link></div>
      <p className="studio-local-note">{c.reviewLocal}</p>
    </div>
  </section>;
}
