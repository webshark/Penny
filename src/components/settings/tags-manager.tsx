"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Search, Tag, Trash2 } from "lucide-react";
import { deleteTag, getTagReport, renameTag } from "@/lib/api";
import { shekels } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingCard } from "@/components/settings/section-shell";

/** Tags admin: every tag with its use, renamed or removed everywhere at once. */
export function TagsManager() {
  const t = useTranslations("settings.tagsAdmin");
  const locale = useLocale();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tags"], queryFn: () => getTagReport() });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const list = (q.data?.tags ?? []).filter((x) => x.tag.toLowerCase().includes(search.trim().toLowerCase()));
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["tags"] }), qc.invalidateQueries({ queryKey: ["transactions"] })]);

  async function run(job: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await job(); await refresh(); toast.success(ok); setEditing(null); }
    catch { toast.error(t("failed")); }
    finally { setBusy(false); }
  }

  return (
    <SettingCard title={t("listTitle", { n: q.data?.tags.length ?? 0 })}>
      <label className="relative mb-3 block">
        <span className="sr-only">{t("search")}</span>
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} className="ps-9" />
      </label>
      {q.isError ? <p role="alert" className="text-sm">{t("failed")}</p>
        : !q.data ? <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>
        : list.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{q.data.tags.length ? t("noMatch") : t("empty")}</p>
        : <ul className="divide-y divide-border">
          {list.map((x) => (
            <li key={x.tag} className="flex min-h-14 flex-wrap items-center gap-3 py-2">
              {editing?.from === x.tag ? (
                <form className="flex flex-1 flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => renameTag(x.tag, editing.to), t("renamed")); }}>
                  <Input autoFocus required maxLength={40} aria-label={t("newName", { tag: x.tag })} value={editing.to} onChange={(e) => setEditing({ from: x.tag, to: e.target.value })} className="max-w-60" />
                  <Button type="submit" size="sm" disabled={busy || !editing.to.trim()}>{t("save")}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>{t("cancel")}</Button>
                </form>
              ) : <>
                <Tag className="size-4 shrink-0 text-primary" aria-hidden />
                <Link href={`/transactions?tag=${encodeURIComponent(x.tag)}`} className="min-w-0 flex-1 truncate font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring">#{x.tag}</Link>
                <span className="text-xs text-muted-foreground">{t("count", { n: x.count })}</span>
                <bdi className="w-24 text-end text-sm font-semibold tabular-nums" data-money>{shekels(Math.round(x.total), locale)}</bdi>
                <Button size="icon" variant="ghost" aria-label={t("rename", { tag: x.tag })} disabled={busy} onClick={() => setEditing({ from: x.tag, to: x.tag })}><Pencil aria-hidden /></Button>
                <Button size="icon" variant="ghost" aria-label={t("delete", { tag: x.tag })} disabled={busy}
                  onClick={() => { if (window.confirm(t("confirmDelete", { tag: x.tag, n: x.count }))) void run(() => deleteTag(x.tag), t("deleted")); }}><Trash2 aria-hidden /></Button>
              </>}
            </li>
          ))}
        </ul>}
    </SettingCard>
  );
}
