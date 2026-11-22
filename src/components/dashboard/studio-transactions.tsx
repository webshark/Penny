"use client";

import Link from "next/link";
import { ArrowUpLeft, ArrowDownLeft, ArrowLeftRight, ReceiptText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { translateCategoryName } from "@/lib/i18n-data";
import { shekels } from "@/lib/money";
import type { TransactionWithCategory } from "@/lib/types";
import { useStudioCopy } from "./studio-copy";

export function StudioTransactions({ transactions, from }: {
  transactions: TransactionWithCategory[];
  from: string;
  to: string;
}) {
  const locale = useLocale();
  const tCategory = useTranslations("categoriesSeeded");
  const c = useStudioCopy();
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });

  return <section className="studio-panel studio-recent" aria-labelledby="studio-recent-title">
    <div className="studio-panel-heading">
      <div className="studio-recent-heading">
        <span className="studio-recent-icon" aria-hidden="true"><ReceiptText size={17} /></span>
        <div><h2 id="studio-recent-title">{c.recentTransactions}</h2><p>{c.recentTransactionsHint}</p></div>
      </div>
      <Link className="studio-recent-link" href={`/transactions?month=${from.slice(0, 7)}`}>
        {c.allTransactions}<ArrowUpLeft size={15} aria-hidden="true" className="ltr:-scale-x-100" />
      </Link>
    </div>
    {transactions.length === 0 ? <p className="studio-recent-empty">{c.noTransactions}</p> :
      <ul className="studio-recent-list">
        {transactions.map((transaction) => {
          const transfer = transaction.kind === "transfer";
          const income = transaction.kind === "income";
          const Icon = transfer ? ArrowLeftRight : income ? ArrowDownLeft : ArrowUpLeft;
          const day = date.format(new Date(`${transaction.date.slice(0, 10)}T12:00:00`));
          const category = transaction.categoryName ? translateCategoryName(transaction.categoryName, tCategory) : (transfer ? c.transfer : income ? c.income : c.uncategorized);
          return <li key={transaction.id}>
            <span className={`studio-recent-kind ${transfer ? "is-transfer" : income ? "is-income" : "is-expense"}`} aria-hidden="true"><Icon size={16} /></span>
            <span className="studio-recent-main">
              <bdi className="studio-recent-name">{transaction.description}</bdi>
              <span className="studio-recent-meta"><span>{category}</span><span aria-hidden="true">·</span><span>{day}</span></span>
            </span>
            <bdi className={`studio-recent-amount ${income ? "is-income" : ""}`}>{shekels(transaction.chargedAmount, locale)}</bdi>
          </li>;
        })}
      </ul>}
  </section>;
}
