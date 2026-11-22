"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cancelFlowMatch, getFlowMatches } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import { shekels } from "@/lib/money";
import type { MatchKind } from "@/lib/flow-matches";

const KIND_KEY: Record<MatchKind, string> = {
  transfer: "kindTransfer",
  refund: "kindRefund",
  loan_drawdown: "kindLoanDrawdown",
  loan_repayment: "kindLoanRepayment",
};

/**
 * Every link the engine made on its own. A wrong link hides a real expense, so it has to be
 * visible and reversible, not a silent decision buried in the data.
 */
export function FlowMatchesCard() {
  const t = useTranslations("flowMatches");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const matches = useQuery({ queryKey: ["flow-matches"], queryFn: getFlowMatches });

  const undo = useMutation({
    mutationFn: cancelFlowMatch,
    onSuccess: () => {
      toast.success(t("cancelled"));
      void queryClient.invalidateQueries({ queryKey: ["flow-matches"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["cash-flow"] });
    },
    onError: () => toast.error(t("failed")),
  });

  if (matches.isPending || matches.isError || !matches.data?.length) return null;
  const money = (n: number) => shekels(Math.round(n), locale);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm leading-relaxed text-muted-foreground">{t("lede")}</p>
        <ul className="grid gap-2">
          {matches.data.map((m) => (
            <li key={m.id} className="rounded-xl bg-muted/50 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{m.description}</p>
                <bdi className="text-sm font-semibold tabular-nums">{money(m.amount)}</bdi>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(KIND_KEY[m.kind])} · {formatDate(m.date)}
                {m.otherDescription && ` · ${t("otherSide", { description: m.otherDescription })}`}
              </p>
              <Button
                variant="outline"
                className="mt-2 h-9"
                disabled={undo.isPending}
                onClick={() => {
                  if (window.confirm(t("cancelConfirm"))) undo.mutate(m.id);
                }}
              >
                {t("cancel")}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
