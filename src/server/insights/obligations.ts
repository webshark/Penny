import "server-only";
import {getDb} from "@/server/db";
import {listCommitments} from "@/server/db/queries/financial-control";
import {isBankProvider} from "@/server/lib/transfers";
import {commitmentDates} from "@/lib/financial-control";
import {chargesBetween} from "@/lib/balance-forecast";
import type {Series} from "./recurring";

/** A direct debit from a bank account. `account` is null for hand-entered items with no account set. */
export interface BankObligation {
  date: string;
  total: number;
  name: string;
  account: string | null;
}

/** One source for direct bank obligations used by both available cash and the forecast. */
export function bankObligations(ws:number,series:Series[],from:string,to:string):BankObligation[] {
 const accounts=new Set((getDb().prepare("SELECT DISTINCT account_number AS account,provider FROM transactions WHERE workspace_id=?").all(ws) as {account:string;provider:string}[]).filter(a=>isBankProvider(a.provider)).map(a=>a.account));
 const commitments=listCommitments(ws), overrides=new Set(commitments.map(c=>c.seriesKey).filter(Boolean));
 const detected=series.filter(s=>s.status==="suggested"&&accounts.has(s.account)&&!overrides.has(`${s.account}|${s.merchant}|${s.currency}`)).flatMap(s=>chargesBetween(s.cadence,s.lastDate,from,to).map(date=>({date,total:s.expectedAmount,name:s.merchant,account:s.account as string|null})));
 const manual=commitments.filter(c=>c.source==="bank").flatMap(c=>commitmentDates(c,from,to).map(date=>({date,total:c.amount,name:c.name,account:null})));
 return [...detected,...manual].sort((a,b)=>a.date.localeCompare(b.date));
}
