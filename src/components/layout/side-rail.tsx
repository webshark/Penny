"use client";

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Bell, ChevronsLeft, X } from "lucide-react";
import { getSuggestions } from "@/lib/api";
import { SuggestionsCard } from "@/components/home/suggestions-card";
import { usePip } from "@/components/home/pet-card";

// Open or closed survives page changes and reloads (each page mounts its own shell).
const KEY = "penny.sideRail";
const listeners = new Set<() => void>();
const read = () => { try { return localStorage.getItem(KEY) === "open"; } catch { return false; } };
// Only a toggle animates: a page that loads with the rail open shows it open at once.
let toggled = false;
export function setSideRail(open: boolean) {
  toggled = true;
  try { localStorage.setItem(KEY, open ? "open" : "closed"); } catch {}
  listeners.forEach((l) => l());
}
export function useSideRail() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, read, () => false);
}

/** The notification count the rail and the top bar's bell share. */
export function useAlertCount() {
  const { data } = useQuery({ queryKey: ["suggestions"], queryFn: getSuggestions });
  return data?.suggestions.length ?? 0;
}

/**
 * The second rail on the far edge (wide screens): closed, a slim strip with Pip and the alert count;
 * open, a panel beside the page with Pip and everything worth a look. It pushes the page, never covers it.
 */
export function SideRail() {
  const t = useTranslations("sideRail");
  const open = useSideRail();
  const pip = usePip();
  const count = useAlertCount();
  // Pip's count already includes the alerts; without Pip, the alerts alone.
  const total = pip ? pip.count : count;

  return (
    // One panel that grows and shrinks in width, pushing the page, with its content fading in once there is room.
    <aside aria-label={t("title")} className={`sticky top-0 hidden h-svh shrink-0 overflow-hidden border-s border-border md:flex ${open ? "w-[22rem] bg-card" : "w-12 bg-background"} ${toggled ? "transition-[width,background-color] duration-300 ease-[var(--ease-soft)] motion-reduce:transition-none" : ""}`}>
      {!open ? (
      <div className="flex w-12 flex-col items-center gap-3 py-3">
        <button type="button" onClick={() => setSideRail(true)} aria-expanded={false} aria-label={total ? t("openCount", { count: total }) : t("open")} title={t("open")}
          className="flex flex-col items-center gap-3 rounded-xl px-1 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <ChevronsLeft className="size-4 ltr:rotate-0 rtl:rotate-180" aria-hidden />
          {pip && <span className="relative grid size-9 place-items-center">{pip.face(32)}</span>}
          <span className="relative grid size-8 place-items-center">
            <Bell className="size-4" aria-hidden />
            {total > 0 && <span aria-hidden className="absolute -end-1 -top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums">{total > 9 ? "9+" : total}</span>}
          </span>
          <span className="text-[11px] font-medium [writing-mode:vertical-rl]">{t("title")}</span>
        </button>
      </div>
      ) : (
      <div className="flex w-[22rem] shrink-0 flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="flex min-h-14 items-center gap-2 border-b border-border px-4">
        <h2 className="flex-1 text-sm font-semibold">{t("title")}</h2>
        <button type="button" onClick={() => setSideRail(false)} aria-expanded aria-label={t("close")} title={t("close")}
          className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-4">
        {pip && (
          <section aria-labelledby="rail-pip">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-muted">{pip.face(40)}</span>
              <div className="min-w-0">
                <h3 id="rail-pip" className="text-sm font-semibold">{pip.name}</h3>
                <p className="text-xs text-muted-foreground">{pip.mood}</p>
              </div>
            </div>
            {pip.body(() => {})}
          </section>
        )}
        <section aria-labelledby="rail-alerts">
          <h3 id="rail-alerts" className="mb-2 text-sm font-semibold">{t("alerts")}{count > 0 && <span className="ms-1.5 text-muted-foreground tabular-nums">{count}</span>}</h3>
          <SuggestionsCard bare limit={8} href="/more" empty={<p className="py-4 text-center text-footnote text-muted-foreground">{t("empty")}</p>} />
        </section>
      </div>
      </div>
      )}
    </aside>
  );
}
