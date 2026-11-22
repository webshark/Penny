"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useLocale,useTranslations} from "next-intl";
import {toast} from "sonner";
import {getControl,controlAction,getPlan,getInsights,getTransactions} from "@/lib/api";
import {type Commitment,type GoalLink,type GoalRule,commitmentDates} from "@/lib/financial-control";
import {translateCategoryName} from "@/lib/i18n-data";
import {loadPreference,storePreference} from "@/lib/preference-sync";
import {useActiveWorkspaceId} from "@/lib/workspace-store";
import {shekels} from "@/lib/money";
import {chargesBetween,addDays} from "@/lib/balance-forecast";
import {debtPayoff} from "@/lib/plan";
import {amortizationSchedule} from "@/lib/loans";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {GoalFocus} from "@/components/home/goal-focus";

const tabs=["health","commitments","goals","rules","reports","debt","start"] as const;
type Tab=typeof tabs[number];
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jerusalem",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const selectClass="min-h-11 w-full rounded-xl border bg-background px-3";
export function FinancialControl(){
 const tCat=useTranslations("categoriesSeeded"),workspaceId=useActiveWorkspaceId();
 const he=useLocale()==="he",locale=he?"he":"en",qc=useQueryClient();const tr=useTranslations("control");
 const [tab,setTab]=useState<Tab>("health"),[month,setMonth]=useState(today().slice(0,7)),[busy,setBusy]=useState(false);
 const q=useQuery({queryKey:["control",month],queryFn:()=>getControl(month)}),plan=useQuery({queryKey:["plan"],queryFn:getPlan}),insights=useQuery({queryKey:["insights"],queryFn:getInsights});
 const transfers=useQuery({queryKey:["control-transfers"],queryFn:()=>getTransactions({limit:200}),enabled:tab==="health"||tab==="goals"||tab==="rules"});
 const [draft,setDraft]=useState<Commitment|null>(null),[reserve,setReserve]=useState("");
 const [taskTransaction,setTaskTransaction]=useState(""),[assignee,setAssignee]=useState("");
 const [goal,setGoal]=useState(""),[transaction,setTransaction]=useState(""),[contribution,setContribution]=useState("");
 const [rule,setRule]=useState<Omit<GoalRule,"id"|"enabled">>({goalId:0,account:"",description:"",direction:1,transactionSign:-1,fromDate:today()});
 const [automatic,setAutomatic]=useState(false);
 const [preview,setPreview]=useState<GoalLink[]|null>(null),[undo,setUndo]=useState<number|null>(null);
 const [debt,setDebt]=useState({balance:100000,rate:6,payment:2000,extra:500});
 const [skipped,setSkipped]=useState<string[]>([]);
 useEffect(()=>{let active=true;void loadPreference("activation").then(value=>{if(active)setSkipped(Array.isArray(value)?value.filter(v=>typeof v==="string"):[]);}).catch(()=>{});return()=>{active=false;};},[workspaceId]);
 const skipStep=(id:string)=>{const next=skipped.includes(id)?skipped.filter(x=>x!==id):[...skipped,id];setSkipped(next);void storePreference("activation",next).catch(()=>toast.error(tr("couldNotSaveProgress")));};
 const money=(n:number)=>shekels(n,locale);
 async function command(body:Record<string,unknown>){setBusy(true);try{const result=await controlAction(body);if(body.action!=="rule-preview"){await qc.invalidateQueries();toast.success(tr("saved"));}return result;}catch(e){toast.error(he?tr("cannotComplete"):e instanceof Error?e.message:"Unable to save");return null;}finally{setBusy(false);}}
 if(q.isPending)return <p role="status">{tr("loadingYourFinancialPicture")}</p>;
 if(q.isError)return <div><p>{tr("couldNotLoadYour")}</p><Button onClick={()=>void q.refetch()}>{tr("retry")}</Button></div>;
 const data=q.data,goals=plan.data?.goals??[],txns=transfers.data?.transactions.filter(t=>t.kind==="transfer"&&t.status==="completed"&&!t.isExcluded)??[];
 const names=tabs.map((id)=>tr(`tab_${id}`));
 const label=(text:string,child:React.ReactNode)=><label key={text} className="grid gap-2 text-sm">{text}{child}</label>;
 const newCommitment=():Commitment=>({id:0,name:"",amount:0,nextDate:today(),cadence:"monthly",source:"bank",status:"active",trialEnd:null,seriesKey:null,previousAmount:null});
 const schedule=amortizationSchedule(debt.balance,debt.rate,debt.payment+debt.extra),base=debtPayoff(debt.balance,debt.rate,debt.payment),improved=debtPayoff(debt.balance,debt.rate,debt.payment+debt.extra);
 return <div className="space-y-6">
  <p className="max-w-2xl text-muted-foreground">{tr("onePlaceToUnderstand")}</p>
  <div className="flex flex-wrap gap-2" role="tablist" aria-label={tr("financialTools")}>{tabs.map((id,i)=><Button key={id} role="tab" aria-selected={tab===id} variant={tab===id?"default":"outline"} onClick={()=>setTab(id)}>{names[i]}</Button>)}</div>
  <section role="tabpanel" aria-label={names[tabs.indexOf(tab)]} className="space-y-5 rounded-3xl border bg-card p-5 md:p-7">
  {tab==="health"&&<>
   <h2 className="text-xl font-semibold">{tr("howMuchOfYour")}</h2>
   <p className="text-sm text-muted-foreground">{tr("availableCashDeductsForecast")}</p>
   <form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();void command({action:"reserve",amount:Number(reserve||data.reserve)});}}>{label(tr("reservedWithinYourBalance"),<Input type="number" min="0" step="0.01" value={reserve||String(data.reserve)} onChange={e=>setReserve(e.target.value)} required/>)}<Button disabled={busy}>{tr("updateAvailableCash")}</Button></form>
   <h3 className="text-lg font-semibold">{tr("dataChecks")}</h3>
   {!data.quality.length&&<p>{tr("noIssuesFoundBy")}</p>}
   <ul className="space-y-3">{data.quality.map(f=><li key={f.key} className="rounded-2xl bg-muted p-4"><strong>{f.count} · {f.title}</strong><p className="mt-1 text-sm text-muted-foreground">{f.detail}</p><Link className="mt-3 inline-flex min-h-11 items-center text-primary underline" href={f.href}>{tr("reviewAndCorrect")}</Link></li>)}</ul>
   {data.participants.length>0&&<div className="space-y-3 border-t pt-4"><h3 className="font-semibold">{tr("whoIsReviewingThis")}</h3><form className="grid gap-3 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();void command({action:"assign",transactionId:Number(taskTransaction),userId:Number(assignee)});}}>{label(tr("transaction"),<select required className={selectClass} value={taskTransaction} onChange={e=>setTaskTransaction(e.target.value)}><option value="">—</option>{transfers.data?.transactions.map(t=><option key={t.id} value={t.id}>{t.date.slice(0,10)} · {t.description}</option>)}</select>)}{label(tr("assignedTo"),<select required className={selectClass} value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">—</option>{data.participants.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>)}<Button disabled={busy}>{tr("assignReview")}</Button></form><ul className="divide-y">{data.tasks.map(task=><li key={task.transactionId} className="flex flex-wrap items-center justify-between gap-2 py-3"><span>{task.description} · {task.name} · {task.done?tr("done"):tr("toReview")}</span><Button variant="outline" disabled={busy} onClick={()=>void command({action:"assign",transactionId:task.transactionId,userId:task.userId,done:!task.done})}>{task.done?tr("reopen"):tr("markDone")}</Button></li>)}</ul></div>}
   <Link href="/settings/bank" className="inline-block min-h-11 text-primary underline">{tr("reviewAccountsAndSync")}</Link>
  </>}
  {tab==="commitments"&&<>
   <div className="flex justify-between gap-3"><h2 className="text-xl font-semibold">{tr("billsRenewalsAndTrials")}</h2><Button onClick={()=>setDraft(newCommitment())}>{tr("addCommitment")}</Button></div>
   <p className="text-sm text-muted-foreground">{tr("bankObligationsAffectAvailable")}</p>
   {draft&&<form className="grid gap-4 rounded-2xl bg-muted p-4 sm:grid-cols-2" onSubmit={async e=>{e.preventDefault();if(await command({action:"commitment",item:draft}))setDraft(null);}}>
    {label(tr("name"),<Input required maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/>)}
    {label(tr("amount"),<Input required type="number" min="0" step="0.01" value={draft.amount} onChange={e=>setDraft({...draft,amount:Number(e.target.value)})}/>)}
    {label(tr("nextDate"),<Input required type="date" value={draft.nextDate} onChange={e=>setDraft({...draft,nextDate:e.target.value})}/>)}
    {label(tr("frequency"),<select className={selectClass} value={draft.cadence} onChange={e=>setDraft({...draft,cadence:e.target.value as Commitment["cadence"]})}><option value="once">{tr("once")}</option><option value="monthly">{tr("monthly")}</option><option value="yearly">{tr("yearly")}</option></select>)}
    {label(tr("paymentSource"),<select className={selectClass} value={draft.source} onChange={e=>setDraft({...draft,source:e.target.value as "bank"|"card"})}><option value="bank">{tr("bankDebit")}</option><option value="card">{tr("creditCard")}</option></select>)}
    {label(tr("trialEndRenewalReminder"),<Input type="date" value={draft.trialEnd??""} onChange={e=>setDraft({...draft,trialEnd:e.target.value||null})}/>)}
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.status==="active"} onChange={e=>setDraft({...draft,status:e.target.checked?"active":"cancelled"})}/>{tr("active")}</label>
    <div className="flex gap-2"><Button disabled={busy}>{tr("save")}</Button><Button type="button" variant="ghost" onClick={()=>setDraft(null)}>{tr("cancel")}</Button></div>
   </form>}
   <ul className="divide-y">{data.commitments.map(c=><li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><strong>{c.name} · {money(c.amount)}</strong><p className="text-sm text-muted-foreground">{c.status==="cancelled"?tr("markedCancelled"):commitmentDates(c,today(),addDays(today(),400))[0]??c.nextDate} · {c.source==="bank"?tr("bank"):tr("card")}</p>{c.previousAmount!==null&&c.previousAmount!==c.amount&&<p className="text-sm">{tr("previousPrice")}{money(c.previousAmount)}</p>}{c.trialEnd&&c.status==="active"&&<p className="text-sm font-medium">{tr("reminder")}{c.trialEnd}{c.trialEnd<=addDays(today(),7)?tr("timeToReview"):""}</p>}</div><Button variant="outline" onClick={()=>setDraft(c)}>{tr("edit")}</Button></li>)}</ul>
   <details><summary className="min-h-11 cursor-pointer py-3">{tr("detectedRecurringSuggestions")}</summary><ul className="divide-y">{insights.data?.series.filter(s=>s.cadence!=="weekly"&&!data.commitments.some(c=>c.seriesKey===`${s.account}|${s.merchant}|${s.currency}`)).map(s=><li key={`${s.account}-${s.merchant}-${s.currency}`} className="flex flex-wrap justify-between gap-3 py-3"><span>{s.merchant} · {money(s.expectedAmount)} · {s.occurrences} {tr("occurrences")}</span><Button variant="secondary" onClick={()=>setDraft({...newCommitment(),name:s.merchant,amount:s.expectedAmount,nextDate:chargesBetween(s.cadence,s.lastDate,today(),addDays(today(),400))[0]??s.lastDate,source:insights.data?.forecast.some(f=>f.account===s.account)?"card":"bank",cadence:s.cadence==="yearly"?"yearly":"monthly",seriesKey:`${s.account}|${s.merchant}|${s.currency}`})}>{tr("reviewDetails")}</Button></li>)}</ul></details>
  </>}
  {tab==="goals"&&<><GoalFocus/><h2 className="text-xl font-semibold">{tr("linkATransferTo")}</h2><p className="text-sm text-muted-foreground">{tr("chooseOnlyOneSide")}</p><form className="grid gap-3 sm:grid-cols-3" onSubmit={async e=>{e.preventDefault();if(await command({action:"link",transactionId:Number(transaction),goalId:Number(goal),contribution:Number(contribution)})){setTransaction("");setContribution("");}}}>
   {label(tr("goal"),<select required className={selectClass} value={goal} onChange={e=>setGoal(e.target.value)}><option value="">—</option>{goals.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>)}
   {label(tr("transferLatest200Transactions"),<select required className={selectClass} value={transaction} onChange={e=>{setTransaction(e.target.value);const txn=txns.find(t=>t.id===Number(e.target.value));setContribution(txn?String(Math.abs(txn.chargedAmount)):"");}}><option value="">—</option>{txns.map(t=><option key={t.id} value={t.id}>{t.date.slice(0,10)} · {t.description} · {money(t.chargedAmount)}</option>)}</select>)}
   {label(tr("contributionNegativeForWithdrawal"),<Input required type="number" step="0.01" value={contribution} onChange={e=>setContribution(e.target.value)}/>)}<Button disabled={busy}>{tr("linkTransfer")}</Button>
   </form><ul className="divide-y">{data.links.map(l=><li key={l.transactionId} className="flex flex-wrap justify-between gap-2 py-3"><span>{l.date.slice(0,10)} · {l.description} → {goals.find(g=>g.id===l.goalId)?.name} · {money(l.contribution)}</span><Button variant="ghost" disabled={busy} onClick={()=>void command({action:"unlink",transactionId:l.transactionId})}>{tr("unlink")}</Button></li>)}</ul></>}
  {tab==="rules"&&<>
   <h2 className="text-xl font-semibold">{tr("rulesYouCanInspect")}</h2><Link href="/settings/rules" className="inline-block min-h-11 text-primary underline">{tr("categorizationRulesPreviewAnd")}</Link>
   <p className="text-sm">{tr("goalRulesMatchTransfers")}</p>
   <form className="grid gap-3 sm:grid-cols-2" onSubmit={async e=>{e.preventDefault();const result=await command({action:"rule-preview",rule});setPreview(result?.matches??null);}} onChange={()=>setPreview(null)}>
    {label(tr("goal"),<select required className={selectClass} value={rule.goalId||""} onChange={e=>setRule({...rule,goalId:Number(e.target.value)})}><option value="">—</option>{goals.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>)}
    {label(tr("accountNumberAsShown"),<Input required value={rule.account} onChange={e=>setRule({...rule,account:e.target.value})}/>)}
    {label(tr("descriptionContains"),<Input required maxLength={100} value={rule.description} onChange={e=>setRule({...rule,description:e.target.value})}/>)}
    {label(tr("fromDate"),<Input required type="date" value={rule.fromDate} onChange={e=>setRule({...rule,fromDate:e.target.value})}/>)}
    {label(tr("transferDirectionInThe"),<select className={selectClass} value={rule.transactionSign??-1} onChange={e=>setRule({...rule,transactionSign:Number(e.target.value)})}><option value={-1}>{tr("moneyLeavesTheAccount")}</option><option value={1}>{tr("moneyEntersTheAccount")}</option></select>)}
    {label(tr("effect"),<select className={selectClass} value={rule.direction} onChange={e=>setRule({...rule,direction:Number(e.target.value)})}><option value={1}>{tr("deposit")}</option><option value={-1}>{tr("withdrawal")}</option></select>)}
    <Button disabled={busy}>{tr("preview")}</Button>
   </form>
   <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)}/>{tr("afterSavingAutomaticallyLink")}</label>
   {preview&&<div className="rounded-xl bg-muted p-4"><p>{preview.length} {tr("matchingTransfersTotaling")}{money(preview.reduce((sum,m)=>sum+m.contribution,0))}</p><ul className="my-3 max-h-60 overflow-y-auto text-sm">{preview.map(m=><li key={m.transactionId} className="py-2">{m.date.slice(0,10)} · {m.description} · {money(m.contribution)}</li>)}</ul><div className="flex flex-wrap gap-2"><Button disabled={busy||!preview.length||preview.length>200} onClick={async()=>{const result=await command({action:"rule-apply",rule,expectedIds:preview.map(m=>m.transactionId)});if(result){setUndo(result.undoId??null);setPreview(null);}}}>{tr("approveAndLink")}</Button><Button disabled={busy} variant="outline" onClick={()=>void command({action:"rule-save",rule,automatic})}>{tr("saveRuleForNext")}</Button></div></div>}
   {undo&&<Button variant="outline" disabled={busy} onClick={async()=>{if(await command({action:"undo-rule",id:undo}))setUndo(null);}}>{tr("undoLastApplication")}</Button>}
   <ul className="divide-y">{data.rules.map(r=><li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span>{r.description} → {goals.find(g=>g.id===r.goalId)?.name}</span><div className="flex gap-2"><Button variant="outline" disabled={!r.enabled} onClick={async()=>{setRule(r);const result=await command({action:"rule-preview",rule:r});setPreview(result?.matches??null);}}>{tr("checkNewMatches")}</Button><Button variant="ghost" disabled={busy} onClick={()=>void command({action:"rule-toggle",id:r.id,enabled:!r.enabled})}>{r.enabled?tr("pause"):tr("enable")}</Button></div></li>)}</ul>
  </>}
  {tab==="reports"&&<><h2 className="text-xl font-semibold">{tr("whyDidSpendingChange")}</h2>{label(tr("month"),<Input type="month" value={month} max={today().slice(0,7)} onChange={e=>setMonth(e.target.value)}/>)}<p className="text-sm text-muted-foreground">{month} {tr("vs")} {data.previousMonth}. {tr("theCurrentMonthCompares")}</p><p className="text-2xl font-semibold">{tr("totalChange")}{money(data.drivers.reduce((s,d)=>s+d.delta,0))}</p><div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead><tr>{[tr("category"),tr("previous"),tr("current"),tr("change")].map(h=><th className="p-3 text-start" key={h}>{h}</th>)}</tr></thead><tbody>{data.drivers.map(d=><tr key={d.categoryId} className="border-t"><td className="p-3"><Link className="underline" href={`/transactions?category=${d.categoryId}&month=${month}`}>{d.name==="Uncategorized"?tr("uncategorized"):translateCategoryName(d.name,tCat)}</Link></td><td className="p-3"><bdi>{money(d.previous)}</bdi></td><td className="p-3"><bdi>{money(d.current)}</bdi></td><td className="p-3 font-medium"><bdi>{money(d.delta)}</bdi></td></tr>)}</tbody></table></div><Link href="/recap" className="inline-block min-h-11 text-primary underline">{tr("monthlyStoryAndAnnual")}</Link></>}
  {tab==="debt"&&<><h2 className="text-xl font-semibold">{tr("howWouldAnExtra")}</h2><p className="text-sm text-muted-foreground">{tr("fixedAnnualRateExcluding")}</p><div className="grid gap-3 sm:grid-cols-2">{([['balance',tr('debtBalance')],['rate',tr('annualRate')],['payment',tr('monthlyPayment')],['extra',tr('extraMonthlyPayment')]] as const).map(([key,name])=>label(name,<Input key={key} type="number" min="0" step="0.01" max={key==='rate'?100:1e9} value={debt[key]} onChange={e=>setDebt({...debt,[key]:Math.max(0,Number(e.target.value))})}/>))}</div>{base&&improved?<div className="rounded-xl bg-muted p-4"><p>{tr("payoffDuration")}{base.months} → {improved.months} {tr("months")}</p><p>{tr("interestSaved")}{money(base.interest-improved.interest)}</p></div>:<p role="status">{tr("thePaymentDoesNot")}</p>}<details><summary className="min-h-11 cursor-pointer py-3">{tr("scenarioAmortizationSchedule")}</summary><ul className="divide-y">{schedule.map(r=><li key={r.year} className="py-3">{tr("year")} {r.year} · {tr("principal")} {money(r.principal)} · {tr("interest")} {money(r.interest)} · {tr("balance")} {money(r.balance)}</li>)}</ul></details><Link href="/investments" className="inline-block min-h-11 text-primary underline">{tr("savedDebtsAndRefinance")}</Link></>}
  {tab==="start"&&<><h2 className="text-xl font-semibold">{tr("fourStepsToA")}</h2><p className="text-sm text-muted-foreground">{tr("skipAndComeBack")}</p><ol className="space-y-3">{[{id:"connect",title:tr("connectAnAccountOr"),href:"/settings/bank"},{id:"check",title:tr("checkDataQuality"),href:"/control"},{id:"goal",title:tr("chooseAMeaningfulGoal"),href:"/journey"},{id:"action",title:tr("firstReviewAndOne"),href:"/transactions"}].map((s,i)=><li className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted p-4" key={s.id}><Link className="min-h-11 py-3 font-medium" href={s.href}>{i+1}. {s.title}</Link><Button variant="ghost" onClick={()=>skipStep(s.id)}>{skipped.includes(s.id)?tr("returnToStep"):tr("later")}</Button></li>)}</ol><Link href="/welcome" className="inline-block min-h-11 text-primary underline">{tr("personalizeForMyHousehold")}</Link></>}
  </section>
  <div className="flex flex-wrap gap-4 text-sm"><Link className="min-h-11 py-3 underline" href="/access">{tr("peoplePermissionsAndDevices")}</Link><Link className="min-h-11 py-3 underline" href="/settings/appearance">{tr("myAppearance")}</Link></div>
  <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3">{tr("financialControlActivity")}</summary><ul className="divide-y">{data.audit.map(a=><li key={a.id} className="py-2"><bdi>{a.createdAt}</bdi> · {a.actorName?`${a.actorName} · `:""}{a.action}{a.action==="rule-apply"&&<Button variant="ghost" disabled={busy} onClick={()=>void command({action:"undo-rule",id:a.id})}>{tr("undoLinks")}</Button>}</li>)}</ul></details>
 </div>;
}
