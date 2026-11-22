"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CloudUpload, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/segmented";
import { SettingCard, SettingList, SettingRow } from "@/components/settings/section-shell";
import { autoBackupAction, getAutoBackup, updateAutoBackup, type AutoBackupConfig } from "@/lib/api";

/** Encrypted backups on a schedule into a folder that a cloud drive syncs, so a dead disk doesn't take the data. */
export function AutoBackupCard() {
  const t = useTranslations("settings.data");
  const locale = useLocale();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["auto-backup"], queryFn: getAutoBackup });
  const set = (c: AutoBackupConfig) => qc.setQueryData(["auto-backup"], c);
  const errorText = (e: unknown) => {
    const m = e instanceof Error ? e.message : "";
    return t(/weak/i.test(m) ? "autoWeak" : /noPassphrase/i.test(m) ? "autoNeedPass" : /absolute/i.test(m) ? "autoBadPath" : "autoFailed");
  };
  const update = useMutation({ mutationFn: updateAutoBackup, onSuccess: set, onError: (e) => toast.error(errorText(e)) });
  const run = useMutation({
    mutationFn: () => autoBackupAction("run"),
    onSuccess: (c) => { set(c); if (c.status === "ok") toast.success(t("autoDone")); else toast.error(t(c.status === "locked" ? "autoLocked" : "autoFailed")); },
    onError: () => toast.error(t("autoFailed")),
  });
  const open = useMutation({ mutationFn: () => autoBackupAction("open"), onError: () => toast.error(t("autoFailed")) });
  const [dir, setDir] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const c = q.data;
  if (!c) return null;
  const last = c.lastAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(c.lastAt)) : null;

  return (
    <SettingCard title={t("autoTitle")} description={t("autoDescription")}>
      <SettingList>
        <div className="space-y-1.5 py-3">
          <Label htmlFor="auto-backup-pass" className="font-medium">{c.hasPassphrase ? t("autoPassChange") : t("autoPass")}</Label>
          <div className="flex flex-wrap gap-2">
            <Input id="auto-backup-pass" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} className="min-w-0 flex-1" aria-describedby="auto-backup-pass-hint" />
            <Button variant="outline" disabled={pass.length < 8 || update.isPending} onClick={() => update.mutate({ passphrase: pass }, { onSuccess: () => { setPass(""); toast.success(t("autoPassSaved")); } })}>{t("autoPassSave")}</Button>
          </div>
          <p id="auto-backup-pass-hint" className="text-footnote text-muted-foreground">{t("autoPassHint")}</p>
        </div>
        <SettingRow label={t("autoEnable")} htmlFor="auto-backup-on">
          <Switch id="auto-backup-on" checked={c.enabled} disabled={!c.hasPassphrase} onCheckedChange={(v) => update.mutate({ enabled: v })} />
        </SettingRow>
        <SettingRow label={t("autoFrequency")}>
          <Segmented label={t("autoFrequency")} value={c.frequency} onChange={(v) => update.mutate({ frequency: v })} options={[{ value: "daily", label: t("autoDaily") }, { value: "weekly", label: t("autoWeekly") }]} />
        </SettingRow>
        <div className="space-y-1.5 py-3">
          <Label htmlFor="auto-backup-dir" className="font-medium">{t("autoFolder")}</Label>
          <Input id="auto-backup-dir" dir="ltr" value={dir ?? c.dir} onChange={(e) => setDir(e.target.value)} onBlur={() => dir !== null && dir.trim() !== c.dir && update.mutate({ dir })} aria-describedby="auto-backup-dir-hint" />
          <p id="auto-backup-dir-hint" className="text-footnote text-muted-foreground">{t("autoFolderHint")}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2" role="status">
          <span className="text-footnote text-muted-foreground">{last ? t("autoLast", { date: last }) : t("autoNever")}</span>
          <span className="flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" className="text-primary" disabled={!c.hasPassphrase || run.isPending} onClick={() => run.mutate()}><CloudUpload className="size-4" aria-hidden />{t("autoRun")}</Button>
            <Button variant="ghost" size="sm" className="-me-2 text-primary" onClick={() => open.mutate()}><FolderOpen className="size-4" aria-hidden />{t("autoOpen")}</Button>
          </span>
        </div>
        {c.status === "locked" && <p className="pt-2 text-sm text-muted-foreground">{t("autoLocked")}</p>}
        {c.status === "error" && <p role="alert" className="pt-2 text-sm text-destructive">{t("autoError")}</p>}
      </SettingList>
    </SettingCard>
  );
}
