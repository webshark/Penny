"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Rocket, Trash2 } from "lucide-react";
import { loadPreference, storePreference } from "@/lib/preference-sync";
import { parseVentures, ventureSummary, VENTURE_STATUSES, type Venture } from "@/lib/ventures";
import { shekels } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
const STATUS_TONE: Record<Venture["status"], string> = { outstanding: "bg-muted text-muted-foreground", exited: "bg-status-on-track/15 text-status-on-track", written_off: "bg-expense/15 text-expense" };

/** Venture page: private deals with principal, fee, date and status, and what they returned. */
export function VenturesView() {
  const t = useTranslations("ventures");
  const locale = useLocale();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["preference", "ventures"], queryFn: () => loadPreference("ventures") });
  const deals = parseVentures(q.data);
  const [draft, setDraft] = useState<Venture | null>(null);
  const money = (n: number) => shekels(Math.round(n), locale);
  const date = (d: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d}T12:00:00`));
  const s = ventureSummary(deals);
  const label = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

  function save(next: Venture[]) {
    qc.setQueryData(["preference", "ventures"], next);
    return storePreference("ventures", next).catch(() => toast.error(t("saveFailed")));
  }
  const set = (patch: Partial<Venture>) => draft && setDraft({ ...draft, ...patch });
  const valid = !!draft && draft.name.trim() !== "" && draft.principal > 0 && draft.entryFee >= 0;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        {!draft && <Button onClick={() => setDraft({ id: crypto.randomUUID(), name: "", platform: "", principal: 0, entryFee: 0, date: today(), status: "outstanding", proceeds: 0 })}><Plus aria-hidden />{t("add")}</Button>}
      </div>

      {deals.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[[t("invested"), money(s.invested)], [t("outstanding"), money(s.outstanding)], [t("realized"), money(s.realized)], [t("deals"), String(s.count)]].map(([k, v], i) => (
            <div key={k} className="rounded-2xl border border-border bg-card p-4"><dt className={label}>{k}</dt><dd className={`mt-1 text-2xl font-semibold tabular-nums ${i === 2 ? (s.realized < 0 ? "text-expense" : s.realized > 0 ? "text-status-on-track" : "") : ""}`} data-money><bdi>{v}</bdi></dd></div>
          ))}
        </dl>
      )}

      {draft && (
        <form className="space-y-4 rounded-2xl border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); if (valid) void save([...deals.filter((d) => d.id !== draft.id), { ...draft, name: draft.name.trim(), platform: draft.platform.trim() }]).then(() => setDraft(null)); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">{t("name")}<Input required maxLength={60} placeholder={t("namePlaceholder")} value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
            <label className="space-y-1.5 text-sm font-medium">{t("platform")}<Input maxLength={40} placeholder={t("platformPlaceholder")} value={draft.platform} onChange={(e) => set({ platform: e.target.value })} /></label>
            <label className="space-y-1.5 text-sm font-medium">{t("principal")}<Input type="number" inputMode="decimal" min="1" required value={draft.principal || ""} onChange={(e) => set({ principal: Number(e.target.value) })} /></label>
            <label className="space-y-1.5 text-sm font-medium">{t("entryFee")}<Input type="number" inputMode="decimal" min="0" value={draft.entryFee || ""} onChange={(e) => set({ entryFee: Number(e.target.value) || 0 })} /></label>
            <label className="space-y-1.5 text-sm font-medium">{t("date")}<Input type="date" dir="ltr" required value={draft.date} onChange={(e) => set({ date: e.target.value })} /></label>
            <label className="space-y-1.5 text-sm font-medium">{t("status")}
              <select value={draft.status} onChange={(e) => set({ status: e.target.value as Venture["status"] })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring">
                {VENTURE_STATUSES.map((st) => <option key={st} value={st}>{t(`status_${st}`)}</option>)}
              </select>
            </label>
            {draft.status === "exited" && <label className="space-y-1.5 text-sm font-medium">{t("proceeds")}<Input type="number" inputMode="decimal" min="0" value={draft.proceeds || ""} onChange={(e) => set({ proceeds: Number(e.target.value) || 0 })} /></label>}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={!valid}>{t("save")}</Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>{t("cancel")}</Button>
          </div>
        </form>
      )}

      {q.isError ? <p role="alert" className="text-sm">{t("loadFailed")}</p>
        : !q.isFetched ? <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>
        : deals.length === 0 && !draft ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <Rocket className="mx-auto mb-3 size-8 text-primary" aria-hidden />
            <p className="font-semibold">{t("emptyTitle")}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("emptyHint")}</p>
          </div>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {[...deals].sort((a, b) => b.date.localeCompare(a.date)).map((d) => (
              <li key={d.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"><Rocket className="size-4" aria-hidden /></span>
                  <button type="button" onClick={() => setDraft(d)} className="min-w-0 flex-1 text-start focus-visible:outline-2 focus-visible:outline-ring">
                    <span className="block truncate font-semibold hover:underline" title={d.name}>{d.name}</span>
                    {d.platform && <span className="block truncate text-xs text-muted-foreground">{d.platform}</span>}
                  </button>
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[d.status]}`}>{t(`status_${d.status}`)}</span>
                  <Button size="icon" variant="ghost" aria-label={t("delete", { name: d.name })} onClick={() => { if (window.confirm(t("confirmDelete", { name: d.name }))) void save(deals.filter((x) => x.id !== d.id)); }}><Trash2 aria-hidden /></Button>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3 text-sm">
                  <div><dt className={label}>{t("principal")}</dt><dd className="font-semibold tabular-nums" data-money><bdi>{money(d.principal)}</bdi></dd></div>
                  <div><dt className={label}>{t("entryFee")}</dt><dd className="tabular-nums" data-money><bdi>{money(d.entryFee)}</bdi></dd></div>
                  <div><dt className={label}>{d.status === "exited" ? t("proceeds") : t("date")}</dt><dd className="tabular-nums">{d.status === "exited" ? <bdi data-money>{money(d.proceeds)}</bdi> : date(d.date)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
