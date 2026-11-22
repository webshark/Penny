"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Check, Palette, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { DEFAULT_STUDIO, type StudioPreferences } from "@/lib/budget-studio";
import { useStudio } from "@/components/studio-provider";
import { useStudioCopy } from "./studio-copy";

/** The design editor. `inline` shows it fully in place (Settings › Appearance); otherwise a button opens it in a sheet. */
export function StudioEditor({ compact = false, inline = false }: { compact?: boolean; inline?: boolean }) {
  const { preferences: value, preview, save: persist, resolvedStudioTheme } = useStudio();
  // Inline (Settings › Appearance) saves every choice at once; the sheet previews until Save.
  // shortcut: the color picker saves on every drag tick; debounce if server writes get noisy.
  const onChange = inline ? persist : preview;
  const locale = useLocale();
  const c = useStudioCopy();
  const [open, setOpen] = useState(false);
  const [original, setOriginal] = useState(value);
  const change = <K extends keyof StudioPreferences>(key: K, v: StudioPreferences[K]) => onChange({ ...value, [key]: v });
  const close = () => { onChange(original); setOpen(false); };
  const save = () => {
    if (persist(value)) toast.success(c.saved);
    setOpen(false);
  };
  function options<K extends "theme" | "accent" | "metric" | "density" | "layout" | "chart">(key: K, values: StudioPreferences[K][]) {
    return <fieldset className="studio-field"><legend>{c[key]}</legend><div className={`studio-options studio-options-${key}`}>
      {values.map((option) => <button type="button" key={option} aria-pressed={value[key] === option && (key !== "accent" || !value.customColor)} onClick={() => key === "accent" ? onChange({ ...value, accent: option as StudioPreferences["accent"], customColor: null }) : change(key, option)}>
        {key === "theme" && <span className={`studio-theme-sample sample-${option}`} aria-hidden="true"><i /><i /><i /></span>}
        {key === "accent" && <span className={`studio-swatch swatch-${option}`} aria-hidden="true" />}
        <span>{c[option]}</span>{value[key] === option && <Check size={14} aria-hidden="true" />}
      </button>)}
    </div></fieldset>;
  }
  const body = (
      <div className="studio-editor-scroll">
      <div className="studio-group bg-card">
      {options("density", ["comfortable", "compact"])}
      <label className="studio-toggle studio-motion-setting"><span>{c.motion}</span><input type="checkbox" role="switch" checked={value.motion} onChange={(e) => change("motion", e.target.checked)} /></label>
      </div>
      <h3 className="studio-section-label">{c.budgetSettings}</h3>
      <div className="studio-group bg-card">
      {options("metric", ["remaining", "spent"])}
      {options("chart", ["bars", "donut", "table"])}
      {options("layout", ["balanced", "stacked"])}
      <fieldset className="studio-field"><legend>{c.widgets}</legend>
        {(["showChart", "showJourney"] as const).map((key) => <label className="studio-toggle" key={key}><span>{c[key]}</span><input type="checkbox" role="switch" checked={value[key]} onChange={(e) => change(key, e.target.checked)} /></label>)}
      </fieldset>
      </div>
      <button className="studio-reset" onClick={() => onChange({ ...DEFAULT_STUDIO })}><RotateCcw size={15} aria-hidden="true" />{c.reset}</button>
    </div>
  );
  if (inline) {
    return <div className="budget-studio studio-editor studio-editor-inline" data-studio-theme={resolvedStudioTheme} data-studio-accent={value.accent} data-studio-motion={value.motion}>
      {body}
    </div>;
  }
  return <Sheet open={open} onOpenChange={(next) => { if (next) { setOriginal(value); setOpen(true); } else close(); }}>
    <SheetTrigger className={`studio-customize ${compact ? "studio-customize-icon" : ""}`} aria-label={c.customize} title={c.customize}><Palette size={17} aria-hidden="true" />{!compact && <>{c.customize}<Sparkles size={14} aria-hidden="true" /></>}</SheetTrigger>
    <SheetContent side="right" className="budget-studio studio-editor" data-studio-theme={resolvedStudioTheme} data-studio-accent={value.accent} data-studio-motion={value.motion} dir={locale === "he" ? "rtl" : "ltr"}>
      <div className="studio-editor-heading"><span className="studio-eyebrow">{c.designStudio}</span><SheetTitle className="text-2xl font-semibold">{c.studio}</SheetTitle><SheetDescription>{c.studioHint}</SheetDescription></div>
      {body}
      <div className="studio-editor-footer"><button className="studio-primary" onClick={save}>{c.save}</button><button className="studio-quiet" onClick={close}>{c.cancel}</button></div>
    </SheetContent>
  </Sheet>;
}
