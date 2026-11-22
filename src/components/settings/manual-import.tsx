"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileUp } from "lucide-react";
import { SettingCard } from "@/components/settings/section-shell";
import { StatementImportCard } from "@/components/settings/statement-import-card";
import { FolderImportCard } from "@/components/settings/folder-import-card";
import { SheetImportCard } from "@/components/settings/sheet-import-card";
import { InstitutionGrid, InstitutionTile } from "@/components/settings/institution-grid";
import { Button } from "@/components/ui/button";
import { BANK_PROVIDERS } from "@/lib/types";
import { INVESTMENT_HOUSES } from "@/lib/investment-houses";
import { translateProviderName } from "@/lib/i18n-data";

const OTHER = "other";

const pickFile = () => {
  document.getElementById("import")?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("statement-file")?.click();
};

interface Institution {
  id: string;
  label: string;
  color: string;
  domain: string;
}

/**
 * The manual path: pick the institution the file came from, then upload the statement.
 * The choice only names the account, so rows dedupe per institution against the automatic sync.
 */
export function ManualImport() {
  const t = useTranslations("settings.bank");
  const tBanks = useTranslations("banks");
  const locale = useLocale();
  const [chosen, setChosen] = useState<string>("");

  const groups = useMemo(() => {
    const byName = (x: Institution, y: Institution) => x.label.localeCompare(y.label, locale);
    const bank = (kind: "bank" | "card"): Institution[] =>
      BANK_PROVIDERS.filter((b) => b.enabled && b.kind === kind)
        .map((b) => ({ id: b.id, label: translateProviderName(b.id, b.name, tBanks), color: b.color, domain: b.domain }))
        .sort(byName);
    return [
      { key: "banks", title: t("groupBanks"), items: bank("bank") },
      { key: "cards", title: t("groupCards"), items: bank("card") },
      {
        key: "houses",
        title: t("groupInvestment"),
        items: INVESTMENT_HOUSES.map((h) => ({ id: h.id, label: locale === "he" ? h.name.he : h.name.en, color: h.color, domain: h.domain })).sort(byName),
      },
    ];
  }, [locale, t, tBanks]);

  const all = groups.flatMap((g) => g.items);
  const account = chosen === OTHER || !chosen ? "" : all.find((i) => i.id === chosen)?.label ?? "";
  const chosenLabel = all.find((i) => i.id === chosen)?.label ?? (chosen === OTHER ? t("manualOther") : "");

  return (
    <>
      <SettingCard title={t("manualTitle")} description={t("manualHint")}>
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              <h4 className="text-footnote font-semibold text-muted-foreground">{g.title}</h4>
              <InstitutionGrid>
                {g.items.map((item) => (
                  <InstitutionTile
                    key={item.id}
                    label={item.label}
                    color={item.color}
                    domain={item.domain}
                    selected={chosen === item.id}
                    onClick={() => setChosen(item.id)}
                  />
                ))}
              </InstitutionGrid>
            </div>
          ))}

          <div className="space-y-2">
            <h4 className="text-footnote font-semibold text-muted-foreground">{t("manualOtherGroup")}</h4>
            <InstitutionGrid>
              <InstitutionTile
                label={t("manualOther")}
                color="#94a3b8"
                selected={chosen === OTHER}
                onClick={() => setChosen(OTHER)}
              />
            </InstitutionGrid>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
            <p className="min-w-0 flex-1 text-footnote text-muted-foreground" aria-live="polite">
              {chosenLabel ? t("manualSelected", { name: chosenLabel }) : t("manualAccountNote")}
            </p>
            <Button type="button" variant="outline" onClick={pickFile}>
              <FileUp className="size-4" aria-hidden />
              {t("manualImportCta")}
            </Button>
          </div>
        </div>
      </SettingCard>

      <div id="import" className="scroll-mt-20 space-y-7">
        <StatementImportCard defaultAccount={account} />
        <SheetImportCard defaultAccount={account} />
        <FolderImportCard />
      </div>
    </>
  );
}
