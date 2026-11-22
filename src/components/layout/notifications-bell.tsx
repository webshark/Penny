"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Bell, CheckCircle2, Flag } from "lucide-react";
import { getNotifications } from "@/lib/api";
import { markAllRead, unread, type AppNotification } from "@/lib/notifications";
import { shekels } from "@/lib/money";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Read state is per browser: which events this person has already seen.
const KEY = "penny.readNotifications";
const listeners = new Set<() => void>();
const readRaw = () => { try { return localStorage.getItem(KEY) ?? "[]"; } catch { return "[]"; } };
const parse = (raw: string): string[] => { try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };
function saveRead(keys: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(keys)); } catch {}
  listeners.forEach((l) => l());
}

const ICON = { syncDone: CheckCircle2, syncFailed: AlertTriangle, goalReached: Flag } as const;
const TONE = { syncDone: "text-status-on-track bg-status-on-track/10", syncFailed: "text-expense bg-expense/10", goalReached: "text-primary bg-primary/10" } as const;

/** The bell: what happened (a sync finished or failed, a goal reached), with unread ones marked. */
export function NotificationsBell() {
  const t = useTranslations("notifications");
  const tBanks = useTranslations("banks");
  const locale = useLocale();
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: getNotifications, refetchInterval: 5 * 60_000 });
  const read = parse(useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, readRaw, () => "[]"));
  const items = data?.items ?? [];
  const fresh = unread(items, read);
  const bank = (id: string) => (tBanks.has(`${id}.name`) ? tBanks(`${id}.name`) : id);
  const when = (at: string | null) => at ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(at.replace(" ", "T") + "Z")) : null;
  const text = (n: AppNotification) =>
    n.kind === "syncDone" ? t("syncDone", { bank: bank(n.provider), count: n.count })
    : n.kind === "syncFailed" ? t("syncFailed", { bank: bank(n.provider) })
    : t("goalReached", { name: n.name, amount: shekels(n.amount, locale) });

  return (
    <Popover>
      <PopoverTrigger aria-label={fresh.length ? t("labelCount", { count: fresh.length }) : t("label")} title={t("label")} className={cn(buttonVariants({ variant: "outline", size: "icon" }), "relative rounded-xl")}>
        <Bell className="size-4" aria-hidden />
        {fresh.length > 0 && <span aria-hidden className="absolute -end-1 -top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums">{fresh.length > 9 ? "9+" : fresh.length}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-96 bg-popover p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{t("label")}</p>
          {fresh.length > 0 && <button type="button" onClick={() => saveRead(markAllRead(items))} className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{t("markAll")}</button>}
        </div>
        {items.length === 0 ? <p className="px-4 py-8 text-center text-footnote text-muted-foreground">{t("empty")}</p> : (
          <ul className="max-h-96 overflow-y-auto py-1">
            {items.map((n) => {
              const Icon = ICON[n.kind];
              const isNew = fresh.includes(n);
              return (
                <li key={n.key}>
                  <Link href={n.href} onClick={() => saveRead([...read.filter((k) => items.some((i) => i.key === k)), n.key])} className={cn("flex gap-3 px-4 py-3 hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring", isNew && "bg-primary/5")}>
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", TONE[n.kind])}><Icon className="size-4" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", isNew && "font-semibold")}>{text(n)}</span>
                      {when(n.at) && <span className="block text-xs text-muted-foreground">{when(n.at)}</span>}
                    </span>
                    {isNew && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label={t("new")} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
