"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, FileJson, FolderOpen, Lock, Printer, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/segmented";
import { SectionShell, SettingCard, SettingList, SettingRow } from "@/components/settings/section-shell";
import { getAssets, getInsights, listIntegrations, getLegacyNotes, getOwners, getPlan, getSettings, saveLegacyNotes, getLegacyExport, updateLegacyExport, postLegacyExport, type LegacyExportConfig } from "@/lib/api";
import { buildLegacySections, LEGACY_TEXT_MAX, type LegacyNotes, type LegacyRow } from "@/lib/legacy";
import { shekels } from "@/lib/money";
import { BANK_PROVIDERS } from "@/lib/types";
import { translateProviderName } from "@/lib/i18n-data";

/** Owned by this page only: paper look on screen, and print rules (white, page break per section). */
const LEGACY_CSS = `
.legacy-doc{background:var(--card,#fff);color:var(--foreground,#1c1c1e);font:15px/1.6 -apple-system,"SF Pro Text","Segoe UI",Arial,sans-serif;border-radius:18px;padding:32px;max-width:52rem;margin:0 auto}
.legacy-doc h1{font-size:26px;margin:0 0 4px}
.legacy-doc .meta{color:var(--muted-foreground,#6e6e73);font-size:14px;margin:0 0 16px}
.legacy-doc .intro{background:var(--muted,#f2f2f7);border-radius:12px;padding:12px 16px;font-size:14px}
.legacy-doc section{margin-top:28px}
.legacy-doc h2{font-size:19px;margin:0 0 6px;border-bottom:1px solid var(--border,#e5e5ea);padding-bottom:6px}
.legacy-doc .hint{color:var(--muted-foreground,#6e6e73);font-size:13px;margin:0 0 8px}
.legacy-doc table{width:100%;border-collapse:collapse;font-size:14px}
.legacy-doc td{padding:7px 4px;border-bottom:1px solid var(--border,#f2f2f7);vertical-align:top}
.legacy-doc td.num{text-align:end;white-space:nowrap;font-variant-numeric:tabular-nums}
.legacy-doc .sub{color:var(--muted-foreground,#6e6e73);font-size:13px}
.legacy-doc .empty{color:var(--muted-foreground,#8e8e93);font-size:14px}
.legacy-doc .text{white-space:pre-wrap}
.legacy-doc ol{padding-inline-start:22px;margin:0}
.legacy-doc ol li{margin:4px 0}
@media print{
  .legacy-doc{--card:#fff;--foreground:#1c1c1e;--muted:#f2f2f7;--muted-foreground:#6e6e73;--border:#e5e5ea;border-radius:0;padding:0;max-width:none;font-size:13pt}
  .legacy-doc section{break-before:page}
  .legacy-doc tr{break-inside:avoid}
  .legacy-print-hidden,aside{display:none!important}
}
`;

const today = () => new Date().toISOString().slice(0, 10);
const yearAgo = () => new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);

export function LegacyDocument() {
  const t = useTranslations("legacy");
  const tBanks = useTranslations("banks");
  const locale = useLocale();
  const qc = useQueryClient();
  const [docEl, setDocEl] = useState<HTMLDivElement | null>(null); // state, not a ref: the export buttons read it while rendering their handlers


  const assets = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const plan = useQuery({ queryKey: ["plan"], queryFn: getPlan });
  const settings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const integrations = useQuery({ queryKey: ["integrations"], queryFn: listIntegrations });
  const insights = useQuery({ queryKey: ["insights"], queryFn: getInsights });
  const owners = useQuery({ queryKey: ["owners", "legacy"], queryFn: () => getOwners(yearAgo(), today()) });
  const notesQ = useQuery({ queryKey: ["legacy-notes"], queryFn: getLegacyNotes });

  const save = useMutation({
    mutationFn: saveLegacyNotes,
    onSuccess: (data) => qc.setQueryData(["legacy-notes"], data),
    onError: () => toast.error(t("saveError")),
  });

  const notes = notesQ.data;
  const sections = buildLegacySections({
    assets: assets.data?.assets ?? [],
    policies: plan.data?.policies ?? [],
    goals: plan.data?.goals ?? [],
    integrations: integrations.data ?? [],
    accounts: owners.data?.accounts ?? [],
    recurring: insights.data?.series ?? [],
    providerName: (id) => translateProviderName(id, BANK_PROVIDERS.find((b) => b.id === id)?.name ?? id, tBanks),
  });
  const me = settings.data?.household?.members.find((m) => m.role === "me")?.name || settings.data?.displayName || "";
  const dateText = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date());
  const money = (n: number | null | undefined) => (n == null ? "" : shekels(n, locale));
  const steps = (notes?.steps ?? t("defaultSteps")).split("\n").map((s) => s.trim()).filter(Boolean);

  const download = (name: string, type: string, body: string) => {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    a.click();
    URL.revokeObjectURL(url);
  };
  const docHtml = () =>
    `<!doctype html><html lang="${locale}" dir="${locale === "he" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t("docTitle")}</title><style>body{margin:0;padding:24px;background:#f2f2f7}${LEGACY_CSS}</style></head><body>${docEl?.outerHTML ?? ""}</body></html>`;
  const exportHtml = () => download(`family-document-${today()}.html`, "text/html", docHtml());
  const exportJson = () =>
    download(`family-document-${today()}.json`, "application/json", JSON.stringify({ generatedAt: new Date().toISOString(), owner: me, notes, sections }, null, 2));

  const loading = [assets, plan, settings].some((q) => q.isLoading);

  const autoQ = useQuery({ queryKey: ["legacy-export"], queryFn: getLegacyExport });
  const auto = autoQ.data;
  const sentRef = useRef("");
  // While auto-export is on, every change to the rendered document (or folder) is sent and written, debounced.
  useEffect(() => {
    if (!auto?.enabled || loading || !docEl) return;
    const html = docHtml();
    const key = auto.dir + html;
    if (key === sentRef.current) return;
    const id = setTimeout(() => {
      sentRef.current = key;
      postLegacyExport({ html }).then((d) => qc.setQueryData(["legacy-export"], d)).catch(() => {});
    }, 2000);
    return () => clearTimeout(id);
  });

  return (
    <SectionShell title={t("title")} description={t("description")} icon={<HeartHandshake aria-hidden />}>
      <style>{LEGACY_CSS}</style>
      <div className="legacy-print-hidden print-hidden space-y-4">
        <section aria-labelledby="legacy-export-title">
          <h3 id="legacy-export-title" className="mb-2 px-4 text-sm font-semibold text-muted-foreground">{t("exportTitle")}</h3>
          <div className="divide-y divide-border overflow-hidden rounded-2xl bg-card">
            {([[Printer, t("print"), () => window.print()], [Download, t("downloadHtml"), exportHtml], [FileJson, t("downloadJson"), exportJson]] as const).map(([Icon, label, run]) => (
              <button key={label} type="button" onClick={run} className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-start font-medium text-primary hover:bg-foreground/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                <Icon className="size-4" aria-hidden />{label}
              </button>
            ))}
          </div>
          <p role="note" className="mt-2 flex gap-1.5 px-4 text-footnote text-muted-foreground"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t("privacyNotice")}</p>
        </section>
        {notes && (
          <SettingCard title={t("notesTitle")} description={t("notesDescription")}>
            <div className="divide-y divide-border">
              {(["contacts", "documents", "wishes", "steps"] as const).map((k) => (
                <NoteField
                  key={`${k}:${notes[k] ?? ""}`}
                  id={`legacy-${k}`}
                  label={t(`fields.${k}`)}
                  placeholder={t(`placeholders.${k}`)}
                  initial={k === "steps" ? notes.steps ?? t("defaultSteps") : notes[k]}
                  onSave={(v) => save.mutate({ ...notes, [k]: v } as LegacyNotes)}
                />
              ))}
            </div>
          </SettingCard>
        )}
        {auto && <AutoExportCard config={auto} onChange={(d) => qc.setQueryData(["legacy-export"], d)} />}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : (
        <div ref={setDocEl} className="legacy-doc" dir={locale === "he" ? "rtl" : "ltr"}>
          <h1>{t("docTitle")}</h1>
          <p className="meta">{me ? t("belongsTo", { name: me, date: dateText }) : t("dated", { date: dateText })}</p>
          <p className="intro">{t("docIntro")}</p>

          {sections.map((s) => (
            <section key={s.id}>
              <h2>{t(`sections.${s.id}`)}</h2>
              {t.has(`hints.${s.id}`) && <p className="hint">{t(`hints.${s.id}`)}</p>}
              {s.rows.length === 0 ? (
                <p className="empty">{t("nothingHere")}</p>
              ) : (
                <table>
                  <tbody>
                    {s.rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <div>{r.title}</div>
                          <div className="sub">{rowSub(r, t)}</div>
                        </td>
                        <td className="num">
                          {r.amount != null && <div>{money(r.amount)}</div>}
                          {r.saved != null && <div className="sub">{t("saved", { amount: money(r.saved) })}</div>}
                          {r.monthly != null && <div className={r.amount != null ? "sub" : undefined}>{t("perMonth", { amount: money(r.monthly) })}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}

          {(["contacts", "documents", "wishes"] as const).map((k) => (
            <section key={k}>
              <h2>{t(`fields.${k}`)}</h2>
              {notes?.[k]?.trim() ? <p className="text">{notes[k]}</p> : <p className="empty">{t("notWrittenYet")}</p>}
            </section>
          ))}
          <section>
            <h2>{t("fields.steps")}</h2>
            <p className="hint">{t("stepsIntro")}</p>
            <ol>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </section>
        </div>
      )}
    </SectionShell>
  );
}

function rowSub(r: LegacyRow, t: ReturnType<typeof useTranslations<"legacy">>) {
  const parts = [r.kind && t.has(`kinds.${r.kind}`) ? t(`kinds.${r.kind}`) : null, r.detail, r.when ? t("when", { when: r.when }) : null];
  return parts.filter(Boolean).join(" · ");
}

function NoteField({ id, label, placeholder, initial, onSave }: { id: string; label: string; placeholder: string; initial: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="space-y-1.5 py-3 first:pt-0 last:pb-0">
      <Label htmlFor={id} className="font-medium">{label}</Label>
      <textarea
        id={id}
        value={value}
        rows={4}
        maxLength={LEGACY_TEXT_MAX}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== initial && onSave(value)}
        className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}

function AutoExportCard({ config, onChange }: { config: LegacyExportConfig; onChange: (c: LegacyExportConfig) => void }) {
  const t = useTranslations("legacy.auto");
  const locale = useLocale();
  const [dir, setDir] = useState(config.dir);
  const update = useMutation({ mutationFn: updateLegacyExport, onSuccess: onChange, onError: () => toast.error(t("badPath")) });
  const open = useMutation({ mutationFn: () => postLegacyExport({ action: "open" }), onError: () => toast.error(t("openError")) });
  const last = config.lastAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(config.lastAt)) : null;
  return (
    <SettingCard title={t("title")} description={t("description")}>
      <SettingList>
        <SettingRow label={t("enable")} htmlFor="legacy-auto">
          <Switch id="legacy-auto" checked={config.enabled} onCheckedChange={(v) => update.mutate({ enabled: v })} />
        </SettingRow>
        <SettingRow label={t("frequency")}>
          <Segmented
            label={t("frequency")}
            value={config.frequency}
            onChange={(v) => update.mutate({ frequency: v })}
            options={[{ value: "weekly", label: t("weekly") }, { value: "monthly", label: t("monthly") }]}
          />
        </SettingRow>
        <div className="space-y-1.5 py-3 last:pb-0">
          <Label htmlFor="legacy-dir" className="font-medium">{t("folder")}</Label>
          <Input id="legacy-dir" dir="ltr" value={dir} onChange={(e) => setDir(e.target.value)} onBlur={() => dir.trim() !== config.dir && update.mutate({ dir })} aria-describedby="legacy-dir-hint" />
          <p id="legacy-dir-hint" className="text-footnote text-muted-foreground">{t("secureHint")}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2" role="status">
          <span className="text-footnote text-muted-foreground">{last ? t("last", { date: last }) : t("never")}</span>
          <Button variant="ghost" size="sm" className="-me-2 text-primary" onClick={() => open.mutate()}>
            <FolderOpen className="size-4" aria-hidden />{t("openFolder")}
          </Button>
        </div>
        {config.status === "locked" && <p className="pt-2 text-sm text-muted-foreground">{t("locked")}</p>}
        {config.status === "error" && <p role="alert" className="pt-2 text-sm text-destructive">{t("error")}</p>}
      </SettingList>
    </SettingCard>
  );
}