"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";
import { getShares, setShareSettled, settleSharePerson } from "@/lib/api";
import { shareBalances } from "@/lib/expense-shares";
import { shekels } from "@/lib/money";

/** Who owes you, from expenses you split: one row per person, settled in one tap when they pay back. */
export function SharesCard() {
  const t = useTranslations("shares");
  const locale = useLocale();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["shares"], queryFn: () => getShares() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["shares"] });
  const settle = useMutation({
    // `ids` are the shares open when the button was pressed, so undo reopens exactly those.
    mutationFn: (v: { person: string; ids: number[] }) => settleSharePerson(v.person),
    onSuccess: (_, { person, ids }) => {
      void refresh();
      toast.success(t("settledAll", { person }), {
        action: { label: t("undo"), onClick: () => void Promise.all(ids.map((id) => setShareSettled(id, false))).then(refresh, () => toast.error(t("failed"))) },
      });
    },
    onError: () => toast.error(t("failed")),
  });
  const balances = shareBalances(q.data?.shares ?? []);
  const total = balances.reduce((s, b) => s + b.owed, 0);

  return (
    <section aria-labelledby="shares-title" className="rounded-2xl border border-border bg-card p-4">
      <h2 id="shares-title" className="mb-1 flex items-center gap-2 text-base font-semibold"><HandCoins className="size-4 text-primary" aria-hidden />{t("cardTitle")}</h2>
      {balances.length === 0 ? (
        <p className={`text-sm ${q.isError ? "text-expense" : "text-muted-foreground"}`}>{q.isError ? t("loadFailed") : q.isPending ? t("loading") : t("empty")}</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">{t("total")} <bdi className="font-semibold text-foreground tabular-nums" data-money>{shekels(total, locale)}</bdi></p>
          <ul className="divide-y divide-border">
            {balances.map((b) => (
              <li key={b.person} className="flex min-h-12 items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.person}<span className="ms-2 text-xs font-normal text-muted-foreground">{t("count", { n: b.count })}</span></span>
                <bdi className="tabular-nums text-sm font-semibold" data-money>{shekels(b.owed, locale)}</bdi>
                <button type="button" aria-label={t("paidBackOf", { person: b.person })} disabled={settle.isPending} onClick={() => settle.mutate({ person: b.person, ids: (q.data?.shares ?? []).filter((x) => !x.settledAt && x.person.trim().toLowerCase() === b.person.trim().toLowerCase()).map((x) => x.id) })}
                  className="h-11 rounded-lg border border-border px-3 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{t("paidBack")}</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
