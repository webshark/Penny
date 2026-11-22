"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumField } from "@/components/ui/num-field";
import { Segmented } from "@/components/ui/segmented";
import { getSuggestions } from "@/lib/api";
import { shekels } from "@/lib/money";
import { IL } from "@/lib/il-defaults";
import { bankFeeAudit, foundAction, likelyRights, FOUND_KINDS, LOST_MONEY_LINKS, RIGHT_LINKS, type FoundKind, type RightsAnswers } from "@/lib/life-tools";
import { cn } from "@/lib/utils";

function Panel({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl bg-card p-5 sm:p-6">
      <h2 id={id} className="text-headline font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-footnote text-pretty text-muted-foreground">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function OutLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
      {children}<ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input type="checkbox" className="size-4 accent-[var(--foreground)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

// ── Lost money ──────────────────────────────────────────────────────────────

const STEPS = ["search", "banks", "list", "decide", "fees"] as const;

export function LostMoneyChecklist() {
  const t = useTranslations("lifeTools.lostMoney");
  // shortcut: ticks and found items live in this page's state only; persist them if people come back to finish.
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [found, setFound] = useState<{ name: string; kind: FoundKind }[]>([]);
  const [draft, setDraft] = useState<{ name: string; kind: FoundKind }>({ name: "", kind: "pension" });
  const [active, setActive] = useState(true);
  return (
    <div className="space-y-6">
      <Panel id="lm-steps" title={t("stepsTitle")} hint={t("intro")}>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-start gap-3">
              <input type="checkbox" id={`lm-step-${s}`} className="mt-1 size-4 shrink-0 accent-[var(--foreground)]" checked={!!done[s]} onChange={(e) => setDone({ ...done, [s]: e.target.checked })} />
              <div className="min-w-0">
                <label htmlFor={`lm-step-${s}`} className={cn("block cursor-pointer font-medium", done[s] && "text-muted-foreground line-through")}>{i + 1}. {t(`step_${s}`)}</label>
                <p className="text-footnote text-pretty text-muted-foreground">{t(`step_${s}_why`)}</p>
                {s === "search" && <OutLink href={LOST_MONEY_LINKS.pension}>{t("linkPension")}</OutLink>}
                {s === "banks" && <OutLink href={LOST_MONEY_LINKS.bank}>{t("linkBank")}</OutLink>}
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel id="lm-found" title={t("foundTitle")} hint={t("foundHint")}>
        <Check checked={active} onChange={setActive}>{t("hasActive")}</Check>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.name.trim()) return;
            setFound([...found, { ...draft, name: draft.name.trim() }]);
            setDraft({ ...draft, name: "" });
          }}
        >
          <Segmented label={t("kindLabel")} value={draft.kind} onChange={(k) => setDraft({ ...draft, kind: k })} options={FOUND_KINDS.map((k) => ({ value: k, label: t(`kind_${k}`) }))} />
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="lm-name">{t("nameLabel")}</Label>
              <Input id="lm-name" maxLength={60} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("namePlaceholder")} />
            </div>
            <button type="submit" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <Plus className="size-4" aria-hidden />{t("add")}
            </button>
          </div>
        </form>
        {found.length > 0 && (
          <ul className="mt-4 divide-y divide-border/60" aria-live="polite">
            {found.map((f, i) => {
              const action = foundAction(f.kind, active);
              return (
                <li key={`${f.name}-${i}`} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{f.name} <span className="text-footnote font-normal text-muted-foreground">· {t(`kind_${f.kind}`)}</span></p>
                    <p className="text-footnote text-pretty"><span className="font-semibold">{t(`action_${action}`)}</span> {t(`action_${action}_how`)}</p>
                  </div>
                  <button type="button" aria-label={t("remove", { name: f.name })} onClick={() => setFound(found.filter((_, j) => j !== i))} className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel id="lm-fees" title={t("feesTitle")}>
        <p className="text-sm text-pretty">{t("feesBody")}</p>
        <p className="mt-2 text-sm text-pretty">{t("scamBody")}</p>
        <OutLink href={LOST_MONEY_LINKS.pensionInfo}>{t("linkInfo")}</OutLink>
        <p className="mt-3 text-footnote text-muted-foreground">{t("notAdvice")}</p>
      </Panel>
    </div>
  );
}

// ── Rights checker ──────────────────────────────────────────────────────────

export function RightsChecker() {
  const t = useTranslations("lifeTools.rights");
  const [a, setA] = useState<RightsAnswers>({ worked: true, income: 9_000, kids: 2, age55: false, reserveDays: 0, renting: false, lostJob: false, singleParent: false, disability: false });
  const set = (patch: Partial<RightsAnswers>) => setA({ ...a, ...patch });
  const rights = likelyRights(a);
  const flags = ["worked", "age55", "renting", "lostJob", "singleParent", "disability"] as const;
  return (
    <div className="space-y-6">
      <Panel id="rt-q" title={t("qTitle")} hint={t("intro")}>
        <div className="grid grid-cols-1 gap-4 min-[22rem]:grid-cols-3">
          <NumField id="rt-income" label={t("income")} value={a.income} step={500} onChange={(n) => set({ income: n })} />
          <NumField id="rt-kids" label={t("kids")} value={a.kids} max={15} onChange={(n) => set({ kids: n })} />
          <NumField id="rt-reserve" label={t("reserveDays")} value={a.reserveDays} max={366} onChange={(n) => set({ reserveDays: n })} />
        </div>
        <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
          {flags.map((k) => <Check key={k} checked={a[k]} onChange={(v) => set({ [k]: v })}>{t(`q_${k}`)}</Check>)}
        </div>
      </Panel>

      <Panel id="rt-out" title={t("outTitle", { count: rights.length })}>
        {rights.length === 0 ? <p className="text-sm text-muted-foreground">{t("none")}</p> : (
          <ul className="divide-y divide-border/60" aria-live="polite">
            {rights.map((r) => (
              <li key={r} className="py-3">
                <p className="font-semibold">{t(`r_${r}`)}</p>
                <p className="text-footnote text-pretty text-muted-foreground">{t(`r_${r}_why`)}</p>
                {RIGHT_LINKS[r] ? <OutLink href={RIGHT_LINKS[r]}>{t("official")}</OutLink> : <p className="mt-1 text-footnote">{t("localAuthority")}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-footnote text-muted-foreground">{t("estimate")}</p>
      </Panel>
    </div>
  );
}

// ── Bank fees ───────────────────────────────────────────────────────────────

export function BankFeesAudit() {
  const t = useTranslations("lifeTools.bankFees");
  const locale = useLocale();
  const money = (n: number) => shekels(n, locale);
  // Fee transactions already detected from the last 12 months; typed in otherwise.
  const detected = useQuery({ queryKey: ["suggestions"], queryFn: getSuggestions }).data?.suggestions.find((s) => s.type === "fees");
  const detectedMonthly = detected && detected.type === "fees" ? Math.round(detected.yearly / 12) : null;
  const [typed, setTyped] = useState<number | null>(null);
  const [direct, setDirect] = useState(8);
  const [teller, setTeller] = useState(0);
  const monthlyPaid = typed ?? detectedMonthly ?? 30;
  const r = bankFeeAudit({ monthlyPaid, direct, teller });
  const tracks = IL.bankFeeTracks;
  return (
    <div className="space-y-6">
      <Panel id="bf-in" title={t("inTitle")} hint={detectedMonthly != null && typed == null ? t("detected", { amount: money(detectedMonthly) }) : t("typeIt")}>
        <div className="grid grid-cols-1 gap-4 min-[22rem]:grid-cols-3">
          <NumField id="bf-paid" label={t("paid")} value={monthlyPaid} onChange={setTyped} />
          <NumField id="bf-direct" label={t("direct")} value={direct} onChange={setDirect} />
          <NumField id="bf-teller" label={t("teller")} value={teller} onChange={setTeller} />
        </div>
      </Panel>

      <Panel id="bf-out" title={t("outTitle")}>
        <div aria-live="polite" className="rounded-2xl bg-primary/8 p-4 sm:p-5">
          <p className="text-title font-semibold text-pretty tabular-nums">
            {r.track ? (r.yearlySaving > 0 ? t("save", { amount: money(r.yearlySaving), track: t(`track_${r.track}`) }) : t("fine", { track: t(`track_${r.track}`) })) : t("noTrack")}
          </p>
        </div>
        <dl className="mt-4 divide-y divide-border/60 text-footnote">
          {(Object.keys(tracks) as (keyof typeof tracks)[]).map((k) => (
            <div key={k} className="flex items-baseline justify-between gap-3 py-2">
              <dt>
                <span className="block font-medium first-letter:uppercase">{t(`track_${k}`)}</span>
                <span className="text-muted-foreground">{t("includes", { direct: tracks[k].direct, teller: tracks[k].teller })}</span>
              </dt>
              <dd className="font-semibold tabular-nums">{k === "extended" ? t("about", { amount: money(tracks[k].price) }) : t("upTo", { amount: money(tracks[k].price) })}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-pretty">{t("how")}</p>
        <p className="mt-2 text-sm text-pretty">{t("reform")}</p>
        <p className="mt-3 text-footnote text-muted-foreground">{t("source", { year: IL.year })}</p>
      </Panel>
    </div>
  );
}
