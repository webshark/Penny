"use client";

import { Forward, Back } from "@/components/ui/dir-chevron";
import { useState } from "react";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui/icon-button";
import { Input, InputGroup } from "@/components/ui/input";
import { updateSettings } from "@/lib/api";

interface MonthlyTargetStepProps {
  onComplete: () => void;
  onBack: () => void;
}

export function MonthlyTargetStep({ onComplete, onBack }: MonthlyTargetStepProps) {
  const t = useTranslations("setup");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = value.trim() === "" ? null : Number(value);
  const valid = parsed == null || (Number.isFinite(parsed) && parsed >= 0);

  async function save(target: number | null) {
    setSaving(true);
    try {
      await updateSettings({ monthlyTarget: target });
      onComplete();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-6">
      <header className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {t("targetStep")}
        </div>
        <h1 className="font-semibold text-4xl leading-[1.08] tracking-tight">
          {t("targetTitle")}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("targetDescription")}
        </p>
      </header>

      <div className="flex items-start gap-3 rounded-xl bg-card/60 p-3">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground">
          <Info className="h-3 w-3" />
        </div>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {t("targetInfoBefore")}{" "}
          <strong className="text-foreground">{t("targetInfoPaceMeter")}</strong>
          {t("targetInfoAfter")}
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="monthly-target"
          className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
        >
          {t("targetLabel")}
        </label>
        <InputGroup prefix="₪">
          <Input
            id="monthly-target"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            placeholder={t("targetPlaceholder")}
            className="text-end tabular-nums"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </InputGroup>
        <p className="text-xs text-muted-foreground">
          {t("targetChangeHint")}
        </p>
      </div>

      <footer className="flex items-center justify-between pt-2">
        <IconButton showLabel label={t("aiBackButton")} variant="outline" onClick={onBack} disabled={saving}>
          <Back />
        </IconButton>
        <IconButton showLabel
          label={saving ? t("aiSavingButton") : t("aiContinueButton")}
          variant="default"
          onClick={() => save(valid ? parsed : null)}
          disabled={saving || !valid}
        >
          <Forward />
        </IconButton>
      </footer>

      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={() => save(null)}
          disabled={saving}
          className="text-xs text-muted-foreground underline decoration-muted-foreground/30 underline-offset-4 transition-colors hover:text-foreground"
        >
          {t("targetSkip")}
        </button>
      </div>
    </div>
  );
}
