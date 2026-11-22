"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { getHome } from "@/lib/api";
import { formatLastSync } from "@/lib/formatters";
import { useFormatterLabels } from "@/lib/i18n-data";
import { CommandPalette, OPEN_COMMAND_PALETTE, OPEN_INLINE_SEARCH } from "./command-palette";

const NUDGED_KEY = "penny-stale-nudged";

/**
 * Floating search, opened from the sidebar's Search button, "/" or Ctrl/⌘K; closes with Esc or a click outside.
 * Also owns the once-per-session "your data is out of date" nudge.
 */
export function BottomBar() {
  const t = useTranslations("nav");
  const router = useRouter();
  const labels = useFormatterLabels();
  const [shown, setShown] = useState(false);
  const hide = useCallback(() => setShown(false), []);
  const home = useQuery({ queryKey: ["home"], queryFn: () => getHome() });

  // Wide screens search in place in the top bar; phones keep the floating bar.
  const openSearch = useCallback(() => { if (matchMedia("(min-width: 768px)").matches) window.dispatchEvent(new Event(OPEN_INLINE_SEARCH)); else setShown(true); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        openSearch();
      }
    }
    const open = () => openSearch();
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE, open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE, open);
    };
  }, [openSearch]);

  // Once per browser session: if any bank is stale, failed or never synced, suggest updating.
  const health = home.data?.bankHealth;
  useEffect(() => {
    if (!health?.length) return;
    try { if (sessionStorage.getItem(NUDGED_KEY)) return; sessionStorage.setItem(NUDGED_KEY, "1"); } catch {}
    const bad = health.find((h) => h.status === "error") ?? health.find((h) => h.status === "never") ?? health.find((h) => h.status === "stale");
    if (!bad) return;
    const description = bad.status === "error" ? t("staleError") : bad.status === "never" || !bad.lastSyncAt ? t("staleNever") : t("staleBody", { when: formatLastSync(bad.lastSyncAt, labels) });
    toast(t("staleTitle"), { description, duration: 15000, action: { label: t("updateNow"), onClick: () => router.push("/settings/bank?sync=1") } });
  }, [health, labels, router, t]);

  if (!shown) return null;
  // Portalled to the body: inside the sidebar's <main> the fixed overlay is confined to that box, so it dimmed
  // only part of the screen and left the sidebar's buttons half covered instead of properly behind it.
  return createPortal(
    <>
    {/* Spotlight-style: the page dims and blurs behind the bar, so the search stands apart from busy content. */}
    <div aria-hidden onClick={hide} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] dark:bg-black/50" />
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6">
      {/* Solid in every theme (glass included): the bar floats over busy content and must stay readable. */}
      <div data-search-root className="pointer-events-auto relative flex w-full max-w-2xl items-center gap-1 rounded-full border border-border bg-popover p-1.5 text-popover-foreground shadow-2xl ring-1 ring-black/5">
        <CommandPalette placeholder={t("askBar")} onClose={hide} />
      </div>
    </div>
    </>,
    document.body,
  );
}
