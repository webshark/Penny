"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Clock, X } from "lucide-react";
import { getCashAhead, getHome, getInsights, getOverview, getResilience, getSuggestions } from "@/lib/api";
import { pipGuru, pipInsights, type PipInput, type PipTone } from "@/lib/pip-coach";
import { usePlan } from "@/hooks/use-plan";
import { useA11y } from "@/components/a11y/a11y-menu";
import { useGentle } from "@/hooks/use-gentle";
import { shekels } from "@/lib/money";
import { PIP_EVENT, pip, type PipReaction } from "@/lib/pip-bus";
import { PET_ACTION, PET_COLORS, skinFor, PET_SIZES, PET_SKINS, petKey, petLines, petMood, petSnooze, petSnoozeUntil, petToday, petTodo, type PetLine, type PetMood, type PetSettings, type PetStat } from "@/lib/pet";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const NEXT: Record<PetStat, string> = { health: "/overview", food: "/budget", tidy: "/transactions", energy: "/journey", joy: "/journey" };
const pill = "inline-flex min-h-11 items-center rounded-full px-4 text-footnote font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const iconBtn = "grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring";

/** The pet's state from the finances (shared by Home's hero and the corner pet); null until loaded, or when it is off. */
function usePet() {
  const { plan, loaded } = usePlan();
  const on = loaded && plan.pet.enabled;
  const home = useQuery({ queryKey: ["home"], queryFn: () => getHome(), enabled: on });
  const res = useQuery({ queryKey: ["resilience"], queryFn: getResilience, enabled: on });
  const cash = useQuery({ queryKey: ["cash-ahead"], queryFn: getCashAhead, enabled: on });
  // Pip speaks for every alert: its own care list plus what the checks noticed, one number on every screen.
  const sug = useQuery({ queryKey: ["suggestions"], queryFn: getSuggestions, enabled: on });
  const lines = useMemo(() => {
    if (!home.data || !res.data) return null;
    const m = home.data.thisMonth, f = (k: string) => res.data.factors.find((x) => x.key === k);
    const bank = cash.data?.bank;
    return petLines({
      spent: m?.spent ?? null, budget: m?.budget ?? null, elapsed: (m?.timeElapsedPercent ?? 50) / 100,
      emergencyMonths: res.data.emergencyMonths, targetMonths: plan.emergencyMonths, savingsRate: res.data.savingsRate,
      overdraft: f("debt")?.points === 0 || f("buffer")?.points === 0,
      overdraftAmount: bank != null && bank < 0 ? -bank : null,
      uncategorized: home.data.needsAttention?.uncategorized ?? 0,
    });
  }, [home.data, res.data, cash.data, plan.emergencyMonths]);
  if (!on || !lines) return null;
  const today = petToday();
  const todo = petTodo(lines, plan.pet.snooze, today);
  // Snoozed items don't weigh on its mood either: it shouldn't keep fretting over what you asked it to set aside.
  const pet = plan.pet;
  return { pet, mood: petMood(lines.filter((l) => l.ok || todo.includes(l))), todo, today, count: todo.length + (sug.data?.suggestions.length ?? 0) };
}
type PetState = NonNullable<ReturnType<typeof usePet>>;

/** Pocket Pal in Home's purple card: just the face and a "+n" badge; tapping it opens what needs care. */
export function PetHeroAside({ extra }: { extra?: React.ReactNode } = {}) {
  const p = usePet();
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<{ shown: boolean; small: boolean }>({ shown: false, small: false });
  useEffect(() => {
    // Simple mode renders the card twice (phone column, desktop layout) and hides one with CSS: only the visible copy gets a live face.
    const sync = () => setView({ shown: !!ref.current?.getClientRects().length, small: innerWidth < 768 });
    sync();
    addEventListener("resize", sync);
    return () => removeEventListener("resize", sync);
  }, [p == null]); // eslint-disable-line react-hooks/exhaustive-deps -- re-measure once the span exists
  if (!p) return null;
  // The aside is about a quarter of the width on phones, so the face shrinks with it.
  const px = Math.round(PET_SIZES[p.pet.size] * (view.small ? 0.6 : 0.9));
  return <span ref={ref} className="flex min-h-px min-w-px flex-col items-center">
    {view.shown && <>
      <PetButton p={p} px={px} onOpen={() => setOpen(true)} />
      <PetSheet p={p} open={open} onOpenChange={setOpen} />
    </>}
    {extra}
  </span>;
}

/** A small live pet on every other page (its eyes follow the pointer), with the same badge and sheet: in the sidebar footer on desktop, next to the menu button in the page header on phones, so it never covers content. */
export function PetMini({ inSidebar }: { inSidebar?: boolean }) {
  const path = usePathname();
  const p = usePet();
  const [open, setOpen] = useState(false);
  if (!p || path === "/") return null;
  const pet = <><PetButton p={p} px={inSidebar ? 44 : 34} onOpen={() => setOpen(true)} mini={inSidebar ? "lg" : "sm"} /><PetSheet p={p} open={open} onOpenChange={setOpen} /></>;
  return <div className={inSidebar ? "hidden justify-center py-1 md:flex" : "flex md:hidden"}>{pet}</div>;
}

function PetButton({ p, px, onOpen, mini }: { p: PetState; px: number; onOpen: () => void; mini?: "lg" | "sm" }) {
  const t = useTranslations("pet");
  const name = p.pet.name || t("defaultName");
  const n = p.count;
  const label = `${t("artLabel", { name, mood: t(`mood_${p.mood}`) })}${n ? `. ${t("badge", { n })}` : ""}`;
  return (
    <button type="button" onClick={() => { pip({ kind: "play", action: "love" }); onOpen(); }} onDoubleClick={() => pip({ kind: "play", action: "random" })} aria-haspopup="dialog" aria-label={label}
      className={`relative grid place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${mini === "lg" ? "size-14 bg-card/90 shadow-lg ring-1 ring-border backdrop-blur" : mini ? "size-11" : ""}`}>
      <PetFace mood={p.mood} pet={p.pet} px={px} />
      {n > 0 && (
        <span aria-hidden dir="ltr" className={`absolute -end-1 -top-1 grid place-items-center rounded-full bg-destructive font-semibold text-destructive-foreground tabular-nums shadow ${mini ? "min-w-5 px-1 text-caption" : "min-w-7 px-1.5 py-0.5 text-footnote"}`}>
          +{n}
        </span>
      )}
    </button>
  );
}

/** What needs care, most important first; each item can be snoozed (tomorrow, a week) or hidden until next month, for the whole household. */
function PipBody({ p, onNavigate, compact = false }: { p: PetState; onNavigate: () => void; compact?: boolean }) {
  const t = useTranslations("pet");
  const tc = useTranslations("common");
  const locale = useLocale();
  const gentle = useGentle();
  const { plan, update } = usePlan();
  const name = p.pet.name || t("defaultName");
  const reason = (key: string) => (gentle && t.has(`${key}_gentle`) ? `${key}_gentle` : key);
  const vars = (l: PetLine) => (l.vars?.amount != null ? { ...l.vars, amount: shekels(l.vars.amount, locale) } : l.vars ?? {});
  // Hidden at once, before the save lands; quick taps build on each other, not on the not-yet-refreshed plan.
  const [gone, setGone] = useState<string[]>([]);
  const snooze = useRef(plan.pet.snooze);
  useEffect(() => { snooze.current = plan.pet.snooze; }, [plan.pet.snooze]);
  const todo = p.todo.filter((l) => !gone.includes(petKey(l)));
  const hide = (l: PetLine, kind: "day" | "week" | "dismiss") => {
    setGone((g) => [...g, petKey(l)]);
    snooze.current = petSnooze(snooze.current, petKey(l), petSnoozeUntil(kind), p.today);
    // A failed save must say so: the line is already hidden here, and reloading brings it back.
    void update({ pet: { ...plan.pet, snooze: snooze.current } }).catch(() => toast.error(tc("saveFailed")));
  };
  return (
    <div className="space-y-5">
      {/* The side rail is narrow: there Pip stays small, with no size choice. */}
      {!compact && <div className="grid place-items-center"><PetFace mood={p.mood} pet={p.pet} px={PET_SIZES[p.pet.size]} /></div>}
      {/* Bigger is a choice, not a hidden setting: the size lives here, next to the face it changes. */}
      {!compact && <Segmented label={t("sizeLabel")} value={p.pet.size}
        onChange={(size) => { void update({ pet: { ...plan.pet, size } }).catch(() => toast.error(tc("saveFailed"))); }}
        options={(Object.keys(PET_SIZES) as (keyof typeof PET_SIZES)[]).map((s) => ({ value: s, label: t(`size_${s}`) }))} />}
      <PipCoach onNavigate={() => onNavigate()} />
      {todo.length ? (
        <ol className="space-y-3" aria-label={t("todoLabel")}>
          {todo.map((l) => (
            <li key={petKey(l)} className="rounded-2xl bg-muted/60 p-3">
              <div className="flex items-start gap-1">
                <p className="min-w-0 flex-1 pt-2.5 text-footnote">{t(reason(`reason_${l.reason}`), vars(l))}</p>
                <DropdownMenu>
                  <DropdownMenuTrigger className={iconBtn} aria-label={t("snoozeMenu")}><Clock className="size-4" aria-hidden /></DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => hide(l, "day")}>{t("snoozeDay")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => hide(l, "week")}>{t("snoozeWeek")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button type="button" onClick={() => hide(l, "dismiss")} aria-label={t("dismiss")} title={t("dismiss")} className={iconBtn}><X className="size-4" aria-hidden /></button>
              </div>
              <Link href={NEXT[l.stat]} onClick={() => onNavigate()} className={`${pill} mt-1 bg-primary text-primary-foreground`}>{t(`next_${l.stat}`)}</Link>
            </li>
          ))}
        </ol>
      ) : <p className="text-footnote">{t("allGood", { name })}</p>}
    </div>
  );
}

function PetSheet({ p, open, onOpenChange }: { p: PetState; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations("pet");
  const name = p.pet.name || t("defaultName");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{name}</SheetTitle>
          <SheetDescription>{t(`mood_${p.mood}`)}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6"><PipBody p={p} onNavigate={() => onOpenChange(false)} /></div>
      </SheetContent>
    </Sheet>
  );
}

/** Pip for the side rail: its face and count when the rail is closed, its whole panel when open. Null when the pet is off. */
export function usePip() {
  const p = usePet();
  const t = useTranslations("pet");
  if (!p) return null;
  return {
    name: p.pet.name || t("defaultName"),
    mood: t(`mood_${p.mood}`),
    count: p.count,
    face: (px: number) => <PetFace mood={p.mood} pet={p.pet} px={px} />,
    body: (onNavigate: () => void) => <PipBody p={p} onNavigate={onNavigate} compact />,
  };
}

const TONE_DOT: Record<PipTone, string> = { act: "bg-destructive", watch: "bg-status-heads-up", good: "bg-status-on-track" };

/** The soonest card charge the forecast expects, with its distance in days from today. */
function nextBill(forecast: { date: string; total: number }[]): { amount: number; days: number } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = [...forecast]
    .map((b) => ({ ...b, days: Math.round((new Date(`${b.date}T12:00:00`).getTime() - today.getTime()) / 86_400_000) }))
    .filter((b) => b.days >= 0 && b.total > 0)
    .sort((a, b) => a.days - b.days)[0];
  return next ? { amount: next.total, days: next.days } : null;
}

/**
 * Pip's read of the month: the resilience score, the single thing worth fixing first, then the numbers behind it.
 * Every line comes from data the rest of the app already loaded, so it never guesses.
 */
function PipCoach({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations("pet.coach");
  const locale = useLocale();
  const { plan } = usePlan();
  const money = (n: number) => shekels(Math.abs(n), locale);
  // Same query keys as Home, so opening Pip costs no extra round trip once the page has loaded.
  const home = useQuery({ queryKey: ["home"], queryFn: () => getHome() });
  const res = useQuery({ queryKey: ["resilience"], queryFn: getResilience });
  const cash = useQuery({ queryKey: ["cash-ahead"], queryFn: getCashAhead });
  const overview = useQuery({ queryKey: ["overview", "month", 1], queryFn: () => getOverview("month", 1) });
  const insights = useQuery({ queryKey: ["insights"], queryFn: getInsights });

  const month = home.data?.thisMonth;
  const o = overview.data;
  const mover = o?.categories.length
    ? [...o.categories].sort((a, b) => Math.abs(b.spent - b.previous) - Math.abs(a.spent - a.previous))[0]
    : null;
  const input: PipInput = {
    month: month ? { spent: month.spent, budget: month.budget, elapsed: (month.timeElapsedPercent ?? 50) / 100 } : null,
    flow: o ? { income: o.totals.income, expenses: o.totals.expenses, previousExpenses: o.previous.expenses, savingsRate: o.totals.savingsRate, uncategorized: o.uncategorized } : null,
    mover: mover ? { name: mover.name, spent: mover.spent, previous: mover.previous } : null,
    runway: res.data ? { months: res.data.emergencyMonths, target: plan.emergencyMonths } : null,
    cash: cash.data ? { safeToSpend: cash.data.safeToSpend, billsDue: cash.data.billsDue, daysLeft: cash.data.daysLeft, bank: cash.data.bank } : null,
    debts: insights.data ? { installments: insights.data.installments.total, anomalies: insights.data.anomalies.length } : null,
    nextBill: nextBill(insights.data?.forecast ?? []),
    fmt: money,
  };
  const list = pipInsights(input).slice(0, 5);
  const guru = pipGuru(res.data?.weakest, input);

  return (
    <section aria-label={t("title")} className="space-y-2.5 rounded-2xl border border-border/60 bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("title")}</h3>
        {res.data && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums">
            {t("score", { score: res.data.score })} · {t(`band_${res.data.band}`)}
          </span>
        )}
      </div>
      <p className="text-footnote leading-relaxed">{t(guru.key, guru.vars)}</p>
      {list.length > 0 && (
        <ul className="space-y-1.5">
          {list.map((x) => (
            <li key={x.key} className="flex items-start gap-2 text-footnote text-muted-foreground">
              <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full ${TONE_DOT[x.tone]}`} />
              <span className="min-w-0 flex-1">{t(x.key, x.vars)}</span>
            </li>
          ))}
        </ul>
      )}
      <Link href="/insights" onClick={onNavigate} className="inline-flex min-h-9 items-center rounded-full px-2 text-footnote font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        {t("openInsights")}
      </Link>
    </section>
  );
}

/** Name, color, size and skin of the pet, shown inline in Settings; each choice is saved for the whole household. */
export function PetCustomizer() {
  const t = useTranslations("pet");
  const tc = useTranslations("common");
  const { plan, update, loaded } = usePlan();
  const [draft, setDraft] = useState<PetSettings>(plan.pet);
  const [wasLoaded, setWasLoaded] = useState(loaded);
  if (loaded !== wasLoaded) { setWasLoaded(loaded); if (loaded) setDraft(plan.pet); } // take the stored pet once it loads
  const save = (next: PetSettings) => { setDraft(next); void update({ pet: next }).catch(() => toast.error(tc("saveFailed"))); };
  const name = draft.name || t("defaultName");
  const swatch = "size-11 rounded-full ring-offset-2 ring-offset-background focus-visible:outline-2 focus-visible:outline-ring aria-checked:ring-2 aria-checked:ring-foreground";

  return (
        <div className="space-y-6">
          <div role="img" aria-label={t("artLabel", { name, mood: t("mood_happy") })} className="grid place-items-center"><PetFace mood="happy" pet={draft} px={PET_SIZES[draft.size]} /></div>
          <label className="block space-y-2">
            <span className="block font-medium">{t("nameLabel")}</span>
            <input value={draft.name} placeholder={t("defaultName")} maxLength={24}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onBlur={() => { const v = draft.name.trim(); if (v !== plan.pet.name) save({ ...draft, name: v }); }}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3" />
          </label>
          <div className="space-y-2">
            <span id="pet-color" className="block font-medium">{t("colorLabel")}</span>
            <div role="radiogroup" aria-labelledby="pet-color" className="flex flex-wrap items-center gap-3">
              <button type="button" role="radio" aria-checked={!draft.color} aria-label={t("colorTheme")} onClick={() => save({ ...draft, color: "" })} className={`${swatch} bg-primary`} />
              {PET_COLORS.map((c, i) => (
                <button key={c} type="button" role="radio" aria-checked={draft.color === c} aria-label={t(`color_${i + 1}`)} onClick={() => save({ ...draft, color: c })} className={swatch} style={{ background: c }} />
              ))}
              <label className="inline-flex min-h-11 items-center gap-2 text-footnote">
                <input type="color" value={draft.color || "#0a84ff"} onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                  onBlur={() => { if (draft.color !== plan.pet.color) save(draft); }} className="size-11 cursor-pointer rounded-full border border-border bg-transparent" />
                {t("colorCustom")}
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <span className="block font-medium">{t("sizeLabel")}</span>
            <Segmented label={t("sizeLabel")} value={draft.size} onChange={(size) => save({ ...draft, size })}
              options={(Object.keys(PET_SIZES) as (keyof typeof PET_SIZES)[]).map((s) => ({ value: s, label: t(`size_${s}`) }))} />
          </div>
          <div className="space-y-2">
            <span className="block font-medium">{t("skinLabel")}</span>
            <Segmented label={t("skinLabel")} value={draft.skin} onChange={(skin) => save({ ...draft, skin })}
              options={["", ...PET_SKINS].map((s) => ({ value: s, label: t(`skin_${s || "none"}`) }))} />
            <p className="text-caption text-muted-foreground">{t("skinHint")}</p>
          </div>
          <label className="block space-y-2">
            <span className="flex justify-between font-medium">{t("roundnessLabel")}<span className="tabular-nums text-muted-foreground">{draft.roundness ?? 50}</span></span>
            {/* Live while dragging; saved once the hand lets go. */}
            <input type="range" min={0} max={100} step={5} value={draft.roundness ?? 50} className="w-full accent-[var(--primary)]"
              onChange={(e) => setDraft({ ...draft, roundness: Number(e.target.value) })}
              onPointerUp={() => save(draft)} onKeyUp={() => save(draft)} />
            <span className="flex justify-between text-caption text-muted-foreground"><span>{t("roundnessSquare")}</span><span>{t("roundnessRound")}</span></span>
          </label>
          <p className="text-caption text-muted-foreground">{t("playHint")}</p>
        </div>
  );
}

/** Colour and look of one Pip, controlled (the profile editor uses it for each person's own Pip). */
export function PipPicker({ value, onChange }: { value: Pick<PetSettings, "color" | "skin">; onChange: (v: Pick<PetSettings, "color" | "skin">) => void }) {
  const t = useTranslations("pet");
  const id = useId();
  const swatch = "size-11 rounded-full ring-offset-2 ring-offset-background focus-visible:outline-2 focus-visible:outline-ring aria-checked:ring-2 aria-checked:ring-foreground";
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span id={id} className="block text-sm font-medium">{t("colorLabel")}</span>
        <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap items-center gap-3">
          <button type="button" role="radio" aria-checked={!value.color} aria-label={t("colorTheme")} onClick={() => onChange({ ...value, color: "" })} className={`${swatch} bg-primary`} />
          {PET_COLORS.map((c, i) => (
            <button key={c} type="button" role="radio" aria-checked={value.color === c} aria-label={t(`color_${i + 1}`)} onClick={() => onChange({ ...value, color: c })} className={swatch} style={{ background: c }} />
          ))}
          <label className="inline-flex min-h-11 items-center gap-2 text-footnote">
            <input type="color" value={value.color || "#0a84ff"} onChange={(e) => onChange({ ...value, color: e.target.value })} className="size-11 cursor-pointer rounded-full border border-border bg-transparent" />
            {t("colorCustom")}
          </label>
        </div>
      </div>
      <div className="space-y-2">
        <span className="block text-sm font-medium">{t("skinLabel")}</span>
        <Segmented label={t("skinLabel")} value={value.skin} onChange={(skin) => onChange({ ...value, skin })}
          options={["", ...PET_SKINS].map((s) => ({ value: s, label: t(`skin_${s || "none"}`) }))} />
      </div>
    </div>
  );
}

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "boop-face": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { size?: string; color?: string; motion?: string; skin?: string };
    }
  }
}

const FALLBACK: Record<PetMood, string> = { happy: "😊", ok: "🙂", hungry: "😋", caring: "🤗" };
type Face = HTMLElement & { play?: (a: string) => unknown; setPointerFollow?: (on: boolean) => unknown; startWaiting?: (o?: { variant?: "spin" | "wrap" | "wave" }) => unknown; stopWaiting?: () => unknown; input?: (on?: boolean) => unknown; setHeadRoundness?: (n: number) => unknown; setPressSqueeze?: (on: boolean) => unknown; setAntennaDrag?: (on: boolean) => unknown };

/**
 * The face is BoopFace (CX ArtLab, MIT): a client-only web component, loaded on demand (the lite build; the full one with its skin painters only once a skin is picked).
 * Until it is ready the box stays empty: no emoji underneath and no flat face before the skin, so a refresh never shows layers. The emoji is only for a failed load.
 */
export function PetFace({ mood, pet, px }: { mood: PetMood; pet: Pick<PetSettings, "color" | "skin"> & { roundness?: number | null }; px: number }) {
  const ref = useRef<Face>(null);
  const still = useA11y().prefs.stopMotion; // the menu's "Stop animations" (BoopFace already honors the OS setting under motion="auto")
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  // The face sets color as an SVG fill, so it needs a resolved color, not a CSS variable (only read on the client: the face never renders on the server).
  const [theme] = useState(() => (typeof document === "undefined" ? undefined : getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || undefined));
  useEffect(() => {
    let live = true;
    (pet.skin ? import("boopface").then((m) => m.loadSkins()) : import("boopface/lite"))
      .then(() => customElements.whenDefined("boop-face"))
      .then(() => { if (live) setState("ready"); }, () => { if (live) setState("failed"); });
    return () => { live = false; };
  }, [pet.skin]);
  useEffect(() => {
    if (state !== "ready") return;
    const face = ref.current;
    face?.setPointerFollow?.(true); // eyes follow the pointer anywhere on the page (BoopFace listens on window)
    face?.setPressSqueeze?.(true); // press and hold its middle to squeeze it
    face?.setAntennaDrag?.(true); // pull its antenna: it springs back, a little cross
    if (pet.roundness != null) face?.setHeadRoundness?.(pet.roundness);
    void face?.play?.(PET_ACTION[mood]);
  }, [state, mood, pet.skin, pet.roundness]);
  // Reactions from anywhere in the app (lib/pip-bus): play one, then settle back into the money mood.
  useEffect(() => {
    if (state !== "ready") return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const back = (ms: number) => { clearTimeout(settle); settle = setTimeout(() => void ref.current?.play?.(PET_ACTION[mood]), ms); };
    const on = (e: Event) => {
      const r = (e as CustomEvent<PipReaction>).detail;
      const face = ref.current;
      if (!face) return;
      if (r.kind === "waiting") { if (r.on) { clearTimeout(settle); void face.startWaiting?.({ variant: "spin" }); } else face.stopWaiting?.(); return; }
      if (r.kind === "typing") { void face.input?.(r.on); if (!r.on) back(400); return; }
      void face.play?.(r.action);
      back(r.action === "bored" ? 6000 : 2600);
    };
    window.addEventListener(PIP_EVENT, on);
    return () => { clearTimeout(settle); window.removeEventListener(PIP_EVENT, on); };
  }, [state, mood]);
  const skin = pet.skin ? skinFor(pet.skin, pet.color || theme || "") : undefined;
  return (
    <span aria-hidden className="grid place-items-center" style={{ width: px, height: px }}>
      {state === "ready" ? <boop-face key={skin} ref={ref} size={String(px)} color={pet.color || theme} skin={skin} motion={still ? "reduce" : "auto"} auto-sleep="0" wake-on="activity" press-squeeze="true" antenna-drag="true" />
        : state === "failed" ? <span style={{ fontSize: px * 0.45 }}>{FALLBACK[mood]}</span> : null}
    </span>
  );
}
