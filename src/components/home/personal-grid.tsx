"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {loadPreference,storePreference} from "@/lib/preference-sync";
import {useActiveProfileId} from "@/lib/workspace-store";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { parseLayout, presetLayout, type Tile, type WidgetId, type LayoutPreset } from "@/lib/personal-layout";

type Saved = { name: string; tiles: Tile[] };

const noSubscribe = () => () => {}; // read once per render; this component's own writes go through state
const cleanSaved = (saved: unknown): Saved[] => Array.isArray(saved) ? saved.filter((s: Saved) => typeof s?.name === "string").slice(0, 8).map((s: Saved) => ({ name: s.name.slice(0, 40), tiles: parseLayout(s.tiles) })) : [];
// undefined: server and hydration render; false: storage unavailable.
function readLayout(raw: string | null | false | undefined): { tiles: Tile[]; saved: Saved[] } {
  if (raw === undefined || raw === false) return { tiles: presetLayout("daily"), saved: [] };
  try { const data = JSON.parse(raw ?? "null"); return { tiles: parseLayout(data?.tiles), saved: cleanSaved(data?.saved) }; }
  catch { return { tiles: presetLayout("daily"), saved: [] }; }
}

/** `exclude` drops cards another part of the page already shows, so nothing appears twice. */
export function PersonalGrid({ render, exclude = [] }: { render: (id: WidgetId) => ReactNode; exclude?: WidgetId[] }) {
  const t = useTranslations("homeGrid");
  const mobile = useIsMobile();
  const profileId=useActiveProfileId(); // per profile: each person keeps their own look
  const key = `penny.home-layout.v1.${mobile ? "mobile" : "desktop"}`;
  const remoteKey=mobile?"home-mobile":"home-desktop";
  const tag = `${key}|${profileId}`;
  const raw = useSyncExternalStore(noSubscribe, () => { try { return localStorage.getItem(key); } catch { return false; } }, () => undefined);
  const stored = useMemo(() => readLayout(raw), [raw]);
  const [own, setOwn] = useState<{ tag: string; tiles: Tile[]; saved: Saved[] } | null>(null);
  const { tiles: allTiles, saved } = own?.tag === tag ? own : stored;
  const tiles = allTiles.filter((x) => !exclude.includes(x.id));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [drag, setDrag] = useState<WidgetId | null>(null);
  const [prevTag, setPrevTag] = useState(tag);
  if (tag !== prevTag) { setPrevTag(tag); setEditing(false); }
  useEffect(() => {
    let active=true;
    void loadPreference(remoteKey).then(value=>{if(!active||!value||typeof value!=="object")return;const data=value as {tiles:unknown;saved:Saved[]};setOwn({tag,tiles:parseLayout(data.tiles),saved:cleanSaved(data.saved)});}).catch(()=>{});
    return ()=>{active=false;};
  }, [tag,remoteKey]);
  function persist(next: Tile[], layouts = saved) {
    setOwn({ tag, tiles: next, saved: layouts });
    void storePreference(remoteKey,{tiles:next,saved:layouts}).catch(()=>toast.error(t("syncFailed")));
    try { localStorage.setItem(key, JSON.stringify({ tiles: next, saved: layouts })); }
    catch { toast.error(t("browserStorageUnavailable")); }
  }
  function move(id: WidgetId, target: number) {
    const next = [...tiles]; const from = next.findIndex(t => t.id === id);
    if (from < 0 || target < 0 || target >= next.length) return;
    next.splice(target, 0, ...next.splice(from, 1)); persist(next);
  }
  const patch = (id: WidgetId, changes: Partial<Tile>) => persist(tiles.map(t => t.id === id ? { ...t, ...changes } : t));
  return <section className="mt-6" aria-label={t("title")}>
    {/* Quiet header: the cards are the content, arranging them is a secondary action. */}
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-footnote font-semibold text-muted-foreground">{t("title")}</h2><Button variant={editing ? "default" : "ghost"} size="sm" onClick={() => setEditing(!editing)}>{editing ? t("done") : t("arrange")}</Button></div>
    {editing && <div className="mb-4 space-y-4 rounded-2xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{t(mobile ? "savedHintMobile" : "savedHintDesktop")}</p>
      <div className="flex flex-wrap gap-2">{(["daily", "planning", "minimal"] as LayoutPreset[]).map((p) => <Button key={p} variant="secondary" onClick={() => persist(presetLayout(p))}>{t(`preset_${p}`)}</Button>)}</div>
      <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); if (name.trim()) { persist(tiles, [...saved.filter(s => s.name !== name.trim()), { name: name.trim(), tiles }].slice(-8)); setName(""); } }}><input aria-label={t("layoutName")} className="min-h-11 rounded-lg border bg-background px-3" maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder={t("nameThisLayout")} required /><Button type="submit">{t("saveLayout")}</Button></form>
      {saved.length > 0 && <div className="flex flex-wrap gap-2">{saved.map(s => <div key={s.name} className="flex gap-1"><Button variant="outline" onClick={() => persist(s.tiles)}>{s.name}</Button><Button variant="ghost" aria-label={t("deleteLayout", { name: s.name })} onClick={() => persist(tiles, saved.filter(x => x.name !== s.name))}>×</Button></div>)}</div>}
    </div>}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {tiles.filter(t => editing || t.visible).map(tile => <div key={tile.id} className={`${tile.wide ? "md:col-span-2" : ""} min-w-0 ${editing ? "rounded-2xl border border-dashed p-3" : ""}`} onDragOver={e => { if (editing) e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (drag) move(drag, tiles.findIndex(t => t.id === tile.id)); setDrag(null); }}>
        {editing && <div className="mb-3 flex flex-wrap items-center gap-2">
          <button draggable onDragStart={() => setDrag(tile.id)} onDragEnd={() => setDrag(null)} className="min-h-11 cursor-grab rounded-lg border px-3" aria-label={t("dragTile", { name: t(`tile_${tile.id}`) })}>⠿ {t(`tile_${tile.id}`)}</button>
          <Button variant="ghost" disabled={tiles[0].id === tile.id} onClick={() => move(tile.id, tiles.findIndex(t => t.id === tile.id) - 1)} aria-label={t("moveUp")}>↑</Button><Button variant="ghost" disabled={tiles.at(-1)?.id === tile.id} onClick={() => move(tile.id, tiles.findIndex(t => t.id === tile.id) + 1)} aria-label={t("moveDown")}>↓</Button>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={tile.visible} onChange={e => patch(tile.id, { visible: e.target.checked })} />{t("show")}</label>
          {!mobile && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={tile.wide} onChange={e => patch(tile.id, { wide: e.target.checked })} />{t("fullWidth")}</label>}
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={tile.tall} onChange={e => patch(tile.id, { tall: e.target.checked })} />{t("expandedHeight")}</label>
        </div>}
        {tile.visible && <div className={tile.tall ? "min-h-96 [&>*]:min-h-96" : ""}>{render(tile.id)}</div>}
      </div>)}
    </div>
  </section>;
}
