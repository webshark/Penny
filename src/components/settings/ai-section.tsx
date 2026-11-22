"use client";

import { useState } from "react";
import { Check, CircleCheck, Sparkles } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconButton } from "@/components/ui/icon-button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AiProviderMark } from "./ai-provider-mark";
import { RECOMMENDED_OLLAMA_MODELS, type AppSettings } from "@/lib/types";
import {
  getAIKeyStatus,
  getInstalledAgents,
  getSettings,
  listOllamaModels,
  saveAIConfig,
} from "@/lib/api";
import { OllamaModelStatus } from "./ollama-model-status";
import { SectionShell, SettingCard } from "./section-shell";
import { toast } from "sonner";

/** "none" has no row: no connected provider means manual categorization. */
type ProviderId = Exclude<AppSettings["aiProvider"], "none">;
type AgentId = "codex" | "gemini" | "opencode" | "kilo";
const isAgent = (id: ProviderId): id is AgentId => id !== "claude" && id !== "ollama";

const ROWS: { id: ProviderId; title: string; desc: string }[] = [
  { id: "claude", title: "providerClaudeTitle", desc: "providerClaudeDesc" },
  { id: "ollama", title: "providerOllamaTitle", desc: "providerOllamaDesc" },
  { id: "codex", title: "providerCodexTitle", desc: "providerCodexDesc" },
  { id: "gemini", title: "providerGeminiTitle", desc: "providerGeminiDesc" },
  { id: "opencode", title: "providerOpenCodeTitle", desc: "providerOpenCodeDesc" },
  { id: "kilo", title: "providerKiloTitle", desc: "providerKiloDesc" },
];

function ollamaModelDescription(
  name: string,
  fallback: string,
  tModels: ReturnType<typeof useTranslations<"ollamaModels">>,
): string {
  const key = name.replace(/[^a-zA-Z0-9]/g, "_");
  return tModels.has(key) ? tModels(key) : fallback;
}

export function AISection() {
  const t = useTranslations("settings.ai");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState<ProviderId | null>(null);
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: keyStatus } = useQuery({ queryKey: ["ai-key-status"], queryFn: getAIKeyStatus });
  const { data: agents } = useQuery({ queryKey: ["ai-agents"], queryFn: getInstalledAgents });
  const { data: ollama } = useQuery({
    queryKey: ["ollama-models", settings?.ollamaUrl],
    // Not installed or not running answers 503; show that instead of "checking…" forever.
    queryFn: () => listOllamaModels(settings?.ollamaUrl).catch((e: unknown) => ({ models: [] as string[], error: e instanceof Error ? e.message : "unavailable" })),
    enabled: !!settings,
    retry: false,
  });

  if (!settings) {
    return (
      <SectionShell title={t("title")}>
        <SettingCard>
          <div className="text-sm text-muted-foreground">{tCommon("loading")}</div>
        </SettingCard>
      </SectionShell>
    );
  }

  const status = (id: ProviderId): { text: string; ok: boolean } => {
    const checking = { text: t("statusChecking"), ok: false };
    switch (id) {
      case "claude":
        if (!keyStatus) return checking;
        return keyStatus.hasClaudeKey ? { text: t("statusConnected"), ok: true } : { text: t("statusNeedsKey"), ok: false };
      case "ollama":
        if (!ollama) return checking;
        if (ollama.error) return { text: t("statusNotInstalled"), ok: false };
        return ollama.models.includes(settings.ollamaModel)
          ? { text: t("statusConnected"), ok: true }
          : { text: t("statusNeedsModel"), ok: false };
      default:
        if (!agents) return checking;
        return agents[id] ? { text: t("statusInstalled"), ok: true } : { text: t("statusNotInstalled"), ok: false };
    }
  };

  return (
    <SectionShell title={t("title")} description={t("description")} icon={<Sparkles aria-hidden />}>
      <section aria-labelledby="ai-providers">
      <h3 id="ai-providers" className="mb-2 px-4 text-sm font-semibold text-muted-foreground">{t("providersListLabel")}</h3>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card">
        {ROWS.map((row) => {
          const active = settings.aiProvider === row.id;
          const s = status(row.id);
          const title = t(row.title as "providerClaudeTitle");
          return (
            <li key={row.id} className="flex items-center gap-3 px-4 py-3">
              <AiProviderMark id={row.id} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span>{title}</span>
                  {active && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                      <CircleCheck className="size-3" aria-hidden /> {t("statusActive")}
                    </span>
                  )}
                </div>
                <div className={`mt-0.5 truncate text-xs ${s.ok ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>
                  {s.text}
                </div>
              </div>
              <Button
                variant={active ? "ghost" : "outline"}
                size="sm"
                aria-label={`${active ? t("manage") : t("connect")}: ${title}`}
                onClick={() => setOpen(row.id)}
              >
                {active ? t("manage") : t("connect")}
              </Button>
            </li>
          );
        })}
      </ul>
      {settings.aiProvider === "none" && (
        <p role="status" className="mt-2 px-4 text-footnote text-muted-foreground">{t("noProviderNote")}</p>
      )}
      </section>

      <Sheet open={open !== null} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md! md:max-w-lg!">
          {open && (
            <ProviderSheet
              key={open}
              provider={open}
              settings={settings}
              hasClaudeKey={!!keyStatus?.hasClaudeKey}
              agentInstalled={isAgent(open) ? agents?.[open] : undefined}
              onDone={() => setOpen(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </SectionShell>
  );
}

function ProviderSheet({
  provider,
  settings,
  hasClaudeKey,
  agentInstalled,
  onDone,
}: {
  provider: ProviderId;
  settings: AppSettings;
  hasClaudeKey: boolean;
  agentInstalled: boolean | undefined;
  onDone: () => void;
}) {
  const t = useTranslations("settings.ai");
  const tCommon = useTranslations("common");
  const tModels = useTranslations("ollamaModels");
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollamaUrl);
  const [ollamaModel, setOllamaModel] = useState(settings.ollamaModel);
  const row = ROWS.find((r) => r.id === provider)!;
  const active = settings.aiProvider === provider;

  const mutation = useMutation({
    mutationFn: (target: AppSettings["aiProvider"]) =>
      saveAIConfig({
        provider: target,
        apiKey: provider === "claude" && apiKey ? apiKey : undefined,
        ollamaUrl: provider === "ollama" ? ollamaUrl : undefined,
        ollamaModel: provider === "ollama" ? ollamaModel : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["ai-key-status"] });
      queryClient.invalidateQueries({ queryKey: ["ollama-models"] });
      toast.success(t("aiSettingsSaved"));
      onDone();
    },
  });

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="gap-3 border-b border-border/40 p-6">
        <div className="flex items-center gap-3">
          <AiProviderMark id={provider} size={44} />
          <div className="min-w-0">
            <SheetTitle>{t(row.title as "providerClaudeTitle")}</SheetTitle>
            <SheetDescription className="mt-0.5">{t(row.desc as "providerClaudeDesc")}</SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        {isAgent(provider) && agentInstalled !== undefined && (
          <p role="status" className="text-sm text-muted-foreground">
            {t(agentInstalled ? "agentInstalled" : "agentNotInstalled", { cmd: provider })}
          </p>
        )}

        {provider === "claude" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("claudeKeyCardDescription")}</p>
            <Label htmlFor="claude-key">{t("apiKeyLabel")}</Label>
            <Input
              id="claude-key"
              type="password"
              dir="ltr"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-…"
            />
            {hasClaudeKey && <p className="text-xs text-muted-foreground">{t("keyStored")}</p>}
          </div>
        )}

        {provider === "ollama" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("ollamaCardDescription")}</p>
            <div className="space-y-2">
              <Label htmlFor="ollama-url">{t("ollamaUrlLabel")}</Label>
              <Input
                id="ollama-url"
                dir="ltr"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("modelLabel")}</Label>
              <Select value={ollamaModel} onValueChange={(v) => v && setOllamaModel(v)}>
                <SelectTrigger aria-label={t("modelLabel")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECOMMENDED_OLLAMA_MODELS.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      <div className="flex items-center gap-2">
                        <span>{m.name}</span>
                        <span className="text-xs text-muted-foreground">{m.sizeGb} GB</span>
                        {m.recommended && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                            {t("recommendedTag")}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const m = RECOMMENDED_OLLAMA_MODELS.find((m) => m.name === ollamaModel);
                  return m ? ollamaModelDescription(m.name, m.description, tModels) : "";
                })()}
              </p>
            </div>
            <OllamaModelStatus ollamaUrl={ollamaUrl} model={ollamaModel} />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border/40 p-4">
        {active && (
          <Button variant="ghost" onClick={() => mutation.mutate("none")} disabled={mutation.isPending}>
            {t("disconnect")}
          </Button>
        )}
        <IconButton
          showLabel
          label={mutation.isPending ? tCommon("saving") : active ? t("saveChanges") : t("useProvider")}
          variant="default"
          onClick={() => mutation.mutate(provider)}
          disabled={mutation.isPending}
        >
          <Check className="size-4" aria-hidden />
        </IconButton>
      </div>
    </div>
  );
}
