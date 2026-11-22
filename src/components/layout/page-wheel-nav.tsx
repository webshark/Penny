"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp } from "lucide-react";
import { FOOTER_NAV, NAV } from "./app-sidebar";
import { usePlan } from "@/hooks/use-plan";
import { SETTINGS_GROUPS } from "@/components/settings/settings-sidebar";
import { SECTIONS } from "./section-tabs";

type Page = { href: string; labelKey: string; Icon: React.ComponentType<{ className?: string }>; match: (p: string, tab: string, view?: string | null) => boolean };

/** One continuous order: every main page, each tabbed area through its tabs, then the settings sections. */
export function pagingOrder(simpleHome = false): Page[] {
  const main = NAV.flatMap((n): Page[] => {
    const tabs = SECTIONS.find((s) => s[0].href === n.href);
    // In Simple mode home has two stops: Simple, then the advanced view (?view=detail), before the next page.
    if (n.href === "/" && simpleHome) return [
      { ...n, labelKey: "nav.home", match: (p, _t, view) => p === "/" && view !== "detail" },
      { ...n, href: "/?view=detail", labelKey: "home.simple.advanced", match: (p, _t, view) => p === "/" && view === "detail" },
    ];
    if (!tabs) return [{ ...n, labelKey: `nav.${n.labelKey}`, match: (p) => n.match(p) }];
    return tabs.map((x) => {
      const [path, query] = x.href.split("?");
      return { href: x.href, labelKey: `sections.${x.key}`, Icon: n.Icon, match: (p, tab) => p.startsWith(path) && (!query || query === `tab=${tab}`) };
    });
  });
  const settings = SETTINGS_GROUPS.flatMap((g) => g.items).map((p): Page => ({
    ...p,
    labelKey: p.labelKey.includes(".") ? p.labelKey : `settings.sidebar.${p.labelKey}`,
    match: (path) => p.match(path),
  }));
  return [...main, ...settings];
}

/** Where a page sits in the order; a page outside it (e.g. /insights, /settings) counts as its area's first page. */
export function pagingIndex(pages: Page[], pathname: string, tab: string, view?: string | null) {
  const i = pages.findIndex((p) => p.match(pathname, tab, view));
  if (i >= 0) return i;
  const area = [...NAV, ...FOOTER_NAV].find((n) => n.match(pathname));
  return area ? pages.findIndex((p) => area.match(p.href.split("?")[0])) : -1;
}

function innerScrollsVertically(el: Element, dir: number) {
  for (let e: Element | null = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
    const oy = getComputedStyle(e).overflowY;
    if ((oy === "auto" || oy === "scroll") && e.scrollHeight > e.clientHeight + 1) {
      const atEnd = dir > 0 ? e.scrollTop + e.clientHeight >= e.scrollHeight - 2 : e.scrollTop <= 0;
      if (!atEnd) return true;
    }
  }
  return false;
}

/** Wheel distance past the end of a page before it moves on, so a normal scroll never jumps by accident. */
const THRESHOLD = 600;
/** A pause this long resets the pull. */
const RESET_MS = 700;

/**
 * Keep scrolling past the bottom of a page to open the next one in the menu, or past the top
 * to go back. The end of every page has a "Continue to …" button that fills as the pull builds
 * (and works on click or Enter); pulling up past the top shows a matching "Back to …" button.
 */
const noSubscribe = () => () => {};

export function PageWheelNav() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const params = useSearchParams();
  const tab = params.get("tab") ?? "period";
  const view = params.get("view");
  const { plan } = usePlan();
  // Home is one stop: the simple/advanced switch is a toggle on the page, never a wheel jump.
  const pages = pagingOrder(false);
  // Simple mode never moves pages by scrolling; the setting is for the advanced view only.
  const index = plan.wheelPaging ? pagingIndex(pages, pathname, tab, view) : -1;
  // The plan can differ between the server render and the client (cached locally), so the buttons appear after hydration.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [pull, setPull] = useState(0);
  const pullRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (href: string) => {
    router.push(href);
    // A tab-only change (same path) keeps the old scroll position; every paged-to page starts at its top.
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (index < 0) return;
    function onWheel(e: WheelEvent) {
      // Dialogs, menus and inner scroll areas keep their own scrolling.
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("[role=dialog], [role=menu], [role=listbox], [data-slot=sidebar]")) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      // Only an inner box that can still scroll vertically this way keeps the wheel (a horizontal-only table wrapper must not).
      if (target && innerScrollsVertically(target, dir)) return;
      const doc = document.documentElement;
      const atBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 2;
      const atTop = window.scrollY <= 0;
      if (!((dir > 0 && atBottom && index < pages.length - 1) || (dir < 0 && atTop && index > 0))) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      if (Math.sign(pullRef.current) !== dir) pullRef.current = 0;
      pullRef.current += e.deltaY;
      setPull(pullRef.current);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        pullRef.current = 0;
        setPull(0);
      }, RESET_MS);
      if (Math.abs(pullRef.current) >= THRESHOLD) {
        pullRef.current = 0;
        setPull(0);
        go(pages[index + dir].href);
      }
    }
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
    // pages is rebuilt each render from constant lists; index captures the change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, pages.length, router]);

  if (!hydrated || index < 0) return null;
  const next = pages[index + 1];
  const prev = pages[index - 1];
  const fill = (dir: number) => (Math.sign(pull) === dir ? Math.min(1, Math.abs(pull) / THRESHOLD) : 0);
  const btn = "relative isolate inline-flex min-h-11 items-center gap-2 overflow-hidden rounded-full border border-border bg-card px-5 text-footnote font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  // The fill shows how far the pull is toward the threshold; no animation, so reduced motion needs nothing extra.
  const bar = (dir: number) => <span aria-hidden className="absolute inset-y-0 start-0 -z-10 bg-primary/15" style={{ width: `${fill(dir) * 100}%` }} />;
  return (
    <>
      {prev && pull < 0 && (
        <div className="fixed inset-x-0 top-20 z-30 flex justify-center">
          <button type="button" onClick={() => go(prev.href)} className={`${btn} glass-popover shadow-lg`}>
            {bar(-1)}
            <ArrowUp className="size-4" aria-hidden />
            {t("nav.backTo", { page: t(prev.labelKey) })}
          </button>
        </div>
      )}
      {next && (
        <div className="print-hidden flex justify-center px-4 pt-10 pb-6">
          <button type="button" onClick={() => go(next.href)} className={btn}>
            {bar(1)}
            {t("nav.continueTo", { page: t(next.labelKey) })}
            <ArrowDown className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
