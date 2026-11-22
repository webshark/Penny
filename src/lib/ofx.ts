/**
 * OFX 2.1 export: one statement per account, bank accounts as checking and cards as credit card statements, so
 * other money apps (GnuCash, Quicken, Banktivity, Firefly III and the like) can import Penny's transactions. Pure.
 */
export interface OfxTxn { id: number; date: string; amount: number; name: string; memo?: string | null }
export interface OfxAccount { number: string; kind: "bank" | "card"; currency: string; bank?: string; txns: OfxTxn[] }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const day = (d: string) => d.slice(0, 10).replace(/-/g, "");
const amount = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

function txnXml(t: OfxTxn): string {
  return [
    "<STMTTRN>",
    `<TRNTYPE>${t.amount < 0 ? "DEBIT" : "CREDIT"}</TRNTYPE>`,
    `<DTPOSTED>${day(t.date)}</DTPOSTED>`,
    `<TRNAMT>${amount(t.amount)}</TRNAMT>`,
    `<FITID>penny-${t.id}</FITID>`,
    // OFX caps NAME at 32 characters; the full text goes to MEMO when it's longer.
    `<NAME>${esc(t.name.slice(0, 32))}</NAME>`,
    t.memo || t.name.length > 32 ? `<MEMO>${esc([t.name.length > 32 ? t.name : "", t.memo ?? ""].filter(Boolean).join(" · ").slice(0, 255))}</MEMO>` : "",
    "</STMTTRN>",
  ].filter(Boolean).join("");
}

function statement(a: OfxAccount, now: string): string {
  const dates = a.txns.map((t) => t.date.slice(0, 10)).sort();
  const list = `<BANKTRANLIST><DTSTART>${day(dates[0] ?? now)}</DTSTART><DTEND>${day(dates.at(-1) ?? now)}</DTEND>${a.txns.map(txnXml).join("")}</BANKTRANLIST>`;
  const status = "<STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>";
  if (a.kind === "card") {
    return `<CREDITCARDMSGSRSV1><CCSTMTTRNRS><TRNUID>${esc(a.number)}</TRNUID>${status}<CCSTMTRS><CURDEF>${a.currency}</CURDEF><CCACCTFROM><ACCTID>${esc(a.number)}</ACCTID></CCACCTFROM>${list}</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>`;
  }
  return `<BANKMSGSRSV1><STMTTRNRS><TRNUID>${esc(a.number)}</TRNUID>${status}<STMTRS><CURDEF>${a.currency}</CURDEF><BANKACCTFROM><BANKID>${esc(a.bank ?? "penny")}</BANKID><ACCTID>${esc(a.number)}</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>${list}</STMTRS></STMTTRNRS></BANKMSGSRSV1>`;
}

export function toOfx(accounts: OfxAccount[], now: string): string {
  const header = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>\n';
  const signon = `<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><DTSERVER>${day(now)}</DTSERVER><LANGUAGE>HEB</LANGUAGE></SONRS></SIGNONMSGSRSV1>`;
  // Banks and cards each sit in their own message set; OFX allows one of each.
  const banks = accounts.filter((a) => a.kind === "bank").map((a) => statement(a, now));
  const cards = accounts.filter((a) => a.kind === "card").map((a) => statement(a, now));
  const merge = (parts: string[], open: string, close: string) => parts.length ? open + parts.map((p) => p.slice(open.length, -close.length)).join("") + close : "";
  return header + "<OFX>" + signon + merge(banks, "<BANKMSGSRSV1>", "</BANKMSGSRSV1>") + merge(cards, "<CREDITCARDMSGSRSV1>", "</CREDITCARDMSGSRSV1>") + "</OFX>\n";
}
