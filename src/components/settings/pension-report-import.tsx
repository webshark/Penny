"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { importPensionReport, listPensionReports } from "@/lib/api";
import { formatLastSync } from "@/lib/formatters";
import { useFormatterLabels } from "@/lib/i18n-data";
import { shekels } from "@/lib/money";

/** An agent's pension / savings report, extracted to JSON (docs/pension-report.md), imported into assets and policies. */
export function PensionReportImport() {
  const t = useTranslations("settings.bank");
  const locale = useLocale();
  const labels = useFormatterLabels();
  const qc = useQueryClient();
  const reports = useQuery({ queryKey: ["pension-reports"], queryFn: listPensionReports });
  const last = reports.data?.reports[0];

  const upload = useMutation({
    mutationFn: async (file: File) => {
      let json: unknown;
      try {
        json = JSON.parse(await file.text());
      } catch {
        throw new Error(t("reportInvalidJson"));
      }
      return importPensionReport(json);
    },
    onSuccess: (r) => {
      toast.success(t("reportImported", { products: r.products, policies: r.policies }));
      void qc.invalidateQueries({ queryKey: ["assets"] });
      void qc.invalidateQueries({ queryKey: ["insurance"] });
      void qc.invalidateQueries({ queryKey: ["pension-reports"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("reportFailed")),
  });

  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(`${iso}T12:00:00`));

  return (
    <section aria-labelledby="pension-report" className="mt-4 rounded-2xl bg-card px-4 py-4">
      <div className="flex items-center gap-1">
        <h3 id="pension-report" className="text-sm font-semibold">{t("reportTitle")}</h3>
        <InfoTip text={t("reportHint")} />
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3">
        {/* The native picker's text follows the browser's language, not the app's; ours is translated. */}
        <input
          id="pension-report-file"
          type="file"
          accept="application/json,.json"
          className="peer sr-only"
          aria-disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file && !upload.isPending) upload.mutate(file);
          }}
        />
        <label
          htmlFor="pension-report-file"
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-secondary px-4 text-footnote font-medium text-secondary-foreground hover:bg-secondary/80 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-aria-disabled:pointer-events-none peer-aria-disabled:opacity-60"
        >
          <FileUp className="size-4" aria-hidden />
          {upload.isPending ? t("reportImporting") : t("reportChoose")}
        </label>
        <a href="/pension-report.example.json" download className="text-footnote text-primary underline underline-offset-4">
          {t("reportExample")}
        </a>
      </div>
      <p className="mt-2 text-caption text-pretty text-muted-foreground" role="status">
        {last
          ? `${t("reportLast", { date: date(last.asOf), products: last.products, total: shekels(last.totalSavings, locale) })} · ${t("reportImportedAt", {
              time: formatLastSync(`${last.importedAt.replace(" ", "T")}Z`, labels),
            })}`
          : t("reportNone")}
      </p>
    </section>
  );
}
