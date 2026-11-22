"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { NAVIGATION_GROUPS } from "./navigation-groups";
import { useStudio } from "@/components/studio-provider";
import { EyeOff, HandHeart, HeartHandshake, LifeBuoy, Milestone, MessageCircleQuestion, Moon, RefreshCw, Search, Settings2, Sparkles, Sun, Zap } from "lucide-react";
import { toast } from "sonner";
import { usePlan } from "@/hooks/use-plan";
import { usePrivacyMode } from "@/hooks/use-privacy-mode";
import { PRIVACY_SHORTCUT } from "@/components/settings/privacy-mode-switch";
import { cn } from "@/lib/utils";
import { askQuestion } from "@/lib/api";
import { looksLikeQuestion, type AskAnswer } from "@/lib/ask";
import { AskAnswerView } from "@/components/ask/ask-answer";

interface Command {
  id: string;
  label: string;
  hint?: string;
  Icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

export const OPEN_COMMAND_PALETTE = "penny:open-command-palette";
/** Desktop: the search grows in place in the top bar instead of floating at the bottom. */
export const OPEN_INLINE_SEARCH = "penny:open-inline-search";

const SETTINGS = ["general", "appearance", "bank", "ai", "categories", "rules"] as const;

/** The search field: type to jump to a page, setting or action, or ask a question. Results open right above it. */
export function CommandPalette({ placeholder, onClose, dropDown = false }: { placeholder: string; onClose: () => void; dropDown?: boolean }) {
  const t = useTranslations("palette");
  const tNavGroups = useTranslations("navGroups");
  const tSettings = useTranslations("settings.sidebar");
  const tRecap = useTranslations("recap");
  const tAsk = useTranslations("ask");
  const tLife = useTranslations("life");
  const tWell = useTranslations("wellbeing");
  const router = useRouter();
  const { preferences, save, resolvedStudioTheme } = useStudio();
  const resolvedTheme = resolvedStudioTheme === "midnight" ? "dark" : "light";
  const { plan, update } = usePlan();
  const tPrivacy = useTranslations("settings.privacy");
  const [privacyOn, togglePrivacy] = usePrivacyMode();
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Answer shown inside the palette after choosing "Ask: …"; null while browsing commands.
  const [asked, setAsked] = useState<{ q: string; answer: AskAnswer | null; failed?: boolean } | null>(null);

  const close = () => { setOpen(false); setQ(""); setActive(0); setAsked(null); onClose(); };

  // Focus after the opening click settles (a tooltip or menu may take focus back on that click).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    // Give focus back to whatever opened the search, unless the user already moved it elsewhere.
    return () => { clearTimeout(id); if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body)) opener.focus(); };
  }, []);
  useEffect(() => {
    // Clicking anywhere outside the search closes it (unmounting resets the query).
    const onPointer = (e: PointerEvent) => { if (!rootRef.current?.closest("[data-search-root]")?.contains(e.target as Node)) onClose(); };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [onClose]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    return [
      ...NAVIGATION_GROUPS.flatMap(group => group.items.map(p => ({ id: p.href, label: tNavGroups(`pages.${p.key}`), hint: tNavGroups(`groups.${group.key}`), Icon: p.Icon, run: go(p.href) }))),
      { id: "recap", label: tRecap("palette"), hint: t("page"), Icon: Sparkles, run: go("/recap") },
      { id: "ask-page", label: tAsk("title"), hint: t("page"), Icon: MessageCircleQuestion, run: go("/ask") },
      { id: "life", label: tLife("title"), hint: t("page"), Icon: Milestone, run: go("/life") },
      { id: "wellbeing", label: tWell("palette"), hint: t("page"), Icon: HeartHandshake, run: go("/wellbeing") },
      { id: "help", label: t("help"), hint: t("page"), Icon: LifeBuoy, run: go("/help") },
      { id: "welcome", label: t("welcome"), hint: t("page"), Icon: HandHeart, run: go("/welcome") },
      { id: "sync", label: t("sync"), hint: t("action"), Icon: RefreshCw, run: go("/settings/bank?sync=1") },
      ...SETTINGS.map((s) => ({ id: `settings-${s}`, label: tSettings(s), hint: t("settings"), Icon: Settings2, run: go(`/settings/${s}`) })),
      {
        id: "theme",
        label: resolvedTheme === "dark" ? t("light") : t("dark"),
        hint: t("action"),
        Icon: resolvedTheme === "dark" ? Sun : Moon,
        run: () => save({ ...preferences, theme: resolvedTheme === "dark" ? "pearl" : "midnight" }),
      },
      { id: "simple", label: plan.simpleMode ? t("simpleOff") : t("simpleOn"), hint: t("action"), Icon: Zap, run: () => { void update({ simpleMode: !plan.simpleMode }).catch(() => toast.error(t("saveFailed"))); } },
      { id: "privacy", label: privacyOn ? tPrivacy("modeOffAction") : tPrivacy("modeOnAction"), hint: PRIVACY_SHORTCUT, Icon: EyeOff, run: () => { togglePrivacy(); toast(privacyOn ? tPrivacy("modeOffToast") : tPrivacy("modeOnToast"), { id: "privacy-mode" }); } },
    ];
  }, [router, t, tNavGroups, tSettings, tRecap, tAsk, tLife, tWell, resolvedTheme, preferences, save, plan.simpleMode, update, tPrivacy, privacyOn, togglePrivacy]);

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const askCommand: Command[] = looksLikeQuestion(q)
    ? [{ id: "ask", label: tAsk("askPrefix", { q: q.trim() }), hint: tAsk("hint"), Icon: MessageCircleQuestion, run: () => {} }]
    : [];
  const results = [...askCommand, ...commands].filter((c) => c.id === "ask" || words.every((w) => `${c.label} ${c.hint ?? ""}`.toLowerCase().includes(w)));
  const current = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current, open]);

  function ask(question: string) {
    setAsked({ q: question, answer: null });
    askQuestion(question).then(
      (answer) => setAsked((a) => (a?.q === question ? { q: question, answer } : a)),
      () => setAsked((a) => (a?.q === question ? { q: question, answer: null, failed: true } : a)),
    );
  }

  function choose(c: Command | undefined) {
    if (!c) return;
    if (c.id === "ask") return ask(q.trim());
    close();
    c.run();
  }

  return (
    <div ref={rootRef} className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3 ring-1 ring-border transition-shadow focus-within:bg-card focus-within:ring-2 focus-within:ring-ring">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
        ref={inputRef}
        onFocus={() => setOpen(true)}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
          setAsked(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(results[current]);
          }
        }}
        placeholder={placeholder}
        aria-label={t("title")}
        aria-controls="palette-list"
        aria-activedescendant={results[current] ? `palette-${results[current].id}` : undefined}
        role="combobox"
        aria-expanded={open}
        className="h-9 min-w-0 w-full bg-transparent text-base outline-none focus-visible:outline-none placeholder:text-muted-foreground md:text-sm"
      />
      <kbd dir="ltr" className="hidden rounded border border-border px-1.5 text-[0.6875rem] text-muted-foreground md:inline">/</kbd>
      {open && (
        // Opens upward from the bar and spans its full width (the bar is the positioned parent).
        <div className={`absolute z-50 flex ${dropDown ? "top-full mt-2 inset-x-0 min-w-[26rem]" : "inset-x-0 bottom-full mb-2"} max-h-[60dvh] flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl`}>
        {asked ? (
          <div className="min-h-0 max-h-[min(28rem,60dvh)] overflow-y-auto overscroll-contain p-5">
            {asked.answer ? <AskAnswerView answer={asked.answer} onExample={(e) => { setQ(e); ask(e); }} onNavigate={close} />
              : asked.failed ? <p role="alert" className="text-footnote text-destructive">{tAsk("error")}</p>
              : <p role="status" className="text-footnote text-muted-foreground">{tAsk("loading")}</p>}
          </div>
        ) : (
        <>
        <p role="status" className="sr-only">{t("count", { n: results.length })}</p>
        <ul id="palette-list" ref={listRef} role="listbox" className="min-h-0 max-h-[min(24rem,55dvh)] overflow-y-auto overscroll-contain p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-footnote text-muted-foreground">{t("none")}</li>}
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`palette-${c.id}`}
              role="option"
              aria-selected={i === current}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(c)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-footnote", i === current && "bg-accent")}
            >
              <c.Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate font-medium" title={c.label}>{c.label}</span>
              {c.hint && <span className="text-caption text-muted-foreground">{c.hint}</span>}
            </li>
          ))}
        </ul>
        </>
        )}
          <p className="shrink-0 border-t border-border px-5 py-2 text-caption text-muted-foreground">{t("footer")}</p>
        </div>
      )}
    </div>
  );
}
