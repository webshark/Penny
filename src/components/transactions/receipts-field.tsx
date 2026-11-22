"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText, Paperclip, X } from "lucide-react";
import { deleteReceipt, fetchReceipt, getReceipts, uploadReceipt } from "@/lib/api";

/** Receipts and invoices on a transaction: open, remove, or add a PDF or photo. */
export function ReceiptsField({ transactionId }: { transactionId: number }) {
  const t = useTranslations("receipts");
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const key = ["receipts", transactionId];
  const q = useQuery({ queryKey: key, queryFn: () => getReceipts(transactionId) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const upload = useMutation({ mutationFn: (f: File) => uploadReceipt(transactionId, f), onSuccess: () => { void refresh(); toast.success(t("added")); }, onError: (e) => toast.error(e instanceof Error ? e.message : t("failed")) });
  const remove = useMutation({ mutationFn: deleteReceipt, onSuccess: refresh, onError: () => toast.error(t("failed")) });

  async function open(id: number) {
    try {
      const url = URL.createObjectURL(await fetchReceipt(id));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { toast.error(t("failed")); }
  }

  const receipts = q.data?.receipts ?? [];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{t("title")}</span>
      {receipts.length > 0 && (
        <ul className="flex flex-col gap-1">
          {receipts.map((r) => (
            <li key={r.id} className="flex min-h-11 items-center gap-2 rounded-lg bg-muted/60 ps-3">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <button type="button" onClick={() => void open(r.id)} className="min-w-0 flex-1 truncate text-start text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring" title={r.originalName}>{r.originalName}</button>
              <button type="button" aria-label={t("remove", { name: r.originalName })} disabled={remove.isPending} onClick={() => remove.mutate(r.id)}
                className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} />
      <button type="button" disabled={upload.isPending} onClick={() => input.current?.click()}
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <Paperclip className="size-4" aria-hidden />{upload.isPending ? t("uploading") : t("add")}
      </button>
    </div>
  );
}
