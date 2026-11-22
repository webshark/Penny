"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, HardDriveDownload, Upload } from "lucide-react";
import { SettingCard } from "@/components/settings/section-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BackupFile {
  name: string;
  size: number;
  at: string;
}

const MIN_PASSPHRASE = 8;

/**
 * One encrypted file with the database and the key that reads the credentials in it. Restore asks
 * for the passphrase and a confirmation, and the server keeps the replaced database in data/backups.
 */
export function BackupCard() {
  const t = useTranslations("settings.data");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [passphrase, setPassphrase] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const backups = useQuery({
    queryKey: ["backups"],
    queryFn: async () => ((await (await fetch("/api/backup")).json()) as { backups?: BackupFile[] }).backups ?? [],
  });

  const errorText = (code: string) => {
    switch (code) {
      case "weakPassphrase":
        return t("backupWeak");
      case "badPassphrase":
        return t("backupBadPassphrase");
      case "badFile":
        return t("backupBadFile");
      case "fileRequired":
        return t("backupFileMissing");
      case "lockOn":
        return t("backupLockOn");
      default:
        return t("backupFailed");
    }
  };

  const download = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "backupFailed");
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "penny-backup.pennybak";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      return name;
    },
    onSuccess: () => {
      setPassphrase("");
      toast.success(t("backupDone"));
      void queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e) => toast.error(errorText(e instanceof Error ? e.message : "backupFailed")),
  });

  const restore = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("fileRequired");
      const form = new FormData();
      form.set("file", file);
      form.set("passphrase", passphrase);
      const res = await fetch("/api/backup/restore", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string; counts?: { transactions: number } };
      if (!res.ok) throw new Error(body.error ?? "restoreFailed");
      return body;
    },
    onSuccess: (body) => {
      setPassphrase("");
      setFile(null);
      setConfirmed(false);
      toast.success(t("backupRestored", { count: body.counts?.transactions ?? 0 }));
      void queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(errorText(e instanceof Error ? e.message : "restoreFailed")),
  });

  const canDownload = passphrase.length >= MIN_PASSPHRASE;
  const canRestore = canDownload && !!file && confirmed;

  return (
    <SettingCard title={t("backupTitle")} description={t("backupDescription")}>
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="backup-passphrase">{t("backupPassphrase")}</Label>
          <Input
            id="backup-passphrase"
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            dir="ltr"
          />
          <p className="text-caption text-muted-foreground">{t("backupPassphraseHint", { min: MIN_PASSPHRASE })}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={!canDownload || download.isPending} onClick={() => download.mutate()}>
            <Download className="size-4" aria-hidden />
            {download.isPending ? t("backupWorking") : t("backupDownload")}
          </Button>
          <p className="text-caption text-muted-foreground">{t("backupWhere")}</p>
        </div>

        <div className="space-y-3 border-t border-border/60 pt-4">
          <div>
            <h4 className="text-sm font-medium">{t("backupRestoreTitle")}</h4>
            <p className="text-caption text-muted-foreground">{t("backupRestoreHint")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="backup-file"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Upload className="size-4" aria-hidden />
              {file ? file.name : t("backupChooseFile")}
            </label>
            <input
              id="backup-file"
              type="file"
              accept=".pennybak,application/octet-stream"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <label className="flex items-center gap-2 text-caption">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              {t("backupRestoreConfirm")}
            </label>
            <Button type="button" variant="outline" disabled={!canRestore || restore.isPending} onClick={() => restore.mutate()}>
              <HardDriveDownload className="size-4" aria-hidden />
              {restore.isPending ? t("backupWorking") : t("backupRestore")}
            </Button>
          </div>
        </div>

        <div className="space-y-1 border-t border-border/60 pt-4">
          <h4 className="text-sm font-medium">{t("backupListTitle")}</h4>
          {backups.data && backups.data.length > 0 ? (
            <ul className="space-y-1 text-caption text-muted-foreground">
              {backups.data.slice(0, 5).map((b) => (
                <li key={b.name} dir="ltr" className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{b.name}</span>
                  <span>{(b.size / 1024 / 1024).toFixed(1)} MB</span>
                  <span>{new Date(b.at).toLocaleString(locale)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-muted-foreground">{t("backupNone")}</p>
          )}
        </div>
      </div>
    </SettingCard>
  );
}
