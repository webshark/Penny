import "server-only";

import { ApiError } from "@/server/lib/api-error";
import { getDb } from "../index";
import { getWorkspaceSetting } from "./settings";
import { israelToday } from "@/server/lib/date-utils";
import { shiftMonth } from "@/lib/recap";
import { monthDay } from "@/lib/balance-forecast";
import { validDay, type Commitment, type ControlPayload, type GoalRule, type GoalLink, type QualityFinding } from "@/lib/financial-control";

export function listCommitments(ws:number):Commitment[] {
 return getDb().prepare("SELECT id,name,amount,next_date AS nextDate,cadence,source,status,trial_end AS trialEnd,series_key AS seriesKey,previous_amount AS previousAmount FROM commitments WHERE workspace_id=? ORDER BY next_date").all(ws) as Commitment[];
}
export function cashReserve(ws:number) { const n=Number(getWorkspaceSetting(ws,"cash_reserve")??0); return Number.isFinite(n)?Math.max(0,n):0; }
export function goalLinks(ws:number):GoalLink[] { return getDb().prepare("SELECT l.transaction_id AS transactionId,l.goal_id AS goalId,l.contribution,t.description,t.date FROM goal_links l JOIN transactions t ON t.id=l.transaction_id WHERE t.workspace_id=? ORDER BY t.date DESC").all(ws) as GoalLink[]; }
export function goalRules(ws:number):GoalRule[] { return getDb().prepare("SELECT id,goal_id AS goalId,account,description,direction,from_date AS fromDate,enabled,automatic,transaction_sign AS transactionSign FROM goal_rules WHERE workspace_id=? ORDER BY id DESC").all(ws) as GoalRule[]; }
export function controlPayload(ws:number, month=israelToday().slice(0,7)):ControlPayload {
 const db=getDb(), today=israelToday();
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError("Invalid month", 400);
 const previousMonth=shiftMonth(month,-1); const day=month===today.slice(0,7)?Number(today.slice(8)):31;
 const end=(m:string)=>monthDay(Number(m.slice(0,4)),Number(m.slice(5))-1,day);
 const aggregate=(m:string)=>db.prepare("SELECT COALESCE(t.category_id,0) AS categoryId,COALESCE(c.name,'Uncategorized') AS name,SUM(-t.personal_amount) AS amount FROM category_transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.workspace_id=? AND t.kind='expense' AND t.status='completed' AND t.is_excluded=0 AND substr(t.date,1,10) BETWEEN ? AND ? GROUP BY t.category_id").all(ws,m+"-01",end(m)) as {categoryId:number;name:string;amount:number}[];
 const current=aggregate(month), previous=aggregate(previousMonth), ids=new Set([...current,...previous].map(c=>c.categoryId));
 const drivers=[...ids].map(id=>{const a=current.find(c=>c.categoryId===id),b=previous.find(c=>c.categoryId===id);return {categoryId:id,name:a?.name??b!.name,current:a?.amount??0,previous:b?.amount??0,delta:(a?.amount??0)-(b?.amount??0)};}).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
 const quality:QualityFinding[]=[];
 const count=(sql:string)=> (db.prepare(sql).get(ws) as {n:number}).n;
 const duplicate=count("SELECT COUNT(*) AS n FROM (SELECT date,description,charged_amount,account_number,provider FROM transactions WHERE workspace_id=? AND status='completed' AND is_excluded=0 GROUP BY substr(date,1,10),description,charged_amount,account_number,provider HAVING COUNT(*)>1)");
 if(duplicate) quality.push({key:"duplicates",severity:"review",title:"תנועות דומות",detail:"אותו בית עסק, חשבון, יום וסכום. ייתכן שמדובר ברכישות נפרדות — לא מחקנו דבר.",href:"/transactions",count:duplicate});
 const missing=count("SELECT COUNT(*) AS n FROM bank_credentials b WHERE b.workspace_id=? AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.credential_id=b.id)");
 if(missing) quality.push({key:"missing",severity:"missing",title:"חיבורים ללא תנועות",detail:"בדקו שהחשבון חובר וסונכרן, או ייבאו דוח.",href:"/settings/bank",count:missing});
 const stale=count("SELECT COUNT(*) AS n FROM account_balances WHERE workspace_id=? AND datetime(updated_at)<datetime('now','-2 days')");
 if(stale) quality.push({key:"stale",severity:"missing",title:"יתרות שלא עודכנו ביומיים האחרונים",detail:"סכום פנוי ותחזיות עשויים להשתנות אחרי סנכרון.",href:"/settings/bank",count:stale});
 const refunds=count("SELECT COUNT(*) AS n FROM transactions WHERE workspace_id=? AND charged_amount>0 AND kind='expense' AND is_excluded=0");
 if(refunds) quality.push({key:"refunds",severity:"review",title:"זיכויים והחזרים",detail:"בדקו את שיוך הקטגוריה ואת הקשר לרכישה. אין לשנות החזר להכנסה רק בגלל הסימן החיובי.",href:"/transactions",count:refunds});
 const settlement=count("SELECT COUNT(*) AS n FROM transactions WHERE workspace_id=? AND kind='expense' AND is_excluded=0 AND (description LIKE '%חיוב כרטיס%' OR description LIKE '%פרעון כרטיס%' OR description LIKE '%פירעון כרטיס%')");
 if(settlement) quality.push({key:"settlement",severity:"review",title:"חיובי כרטיס שעשויים להיספר פעמיים",detail:"אם רכישות הכרטיס כבר מופיעות, בדקו אם החיוב בבנק צריך להיות מסומן כהעברה.",href:"/transactions",count:settlement});
 const participants=db.prepare("SELECT id,name FROM app_users WHERE disabled=0 AND (is_admin=1 OR id IN (SELECT user_id FROM workspace_members WHERE workspace_id=?))").all(ws) as ControlPayload["participants"];
 const tasks=db.prepare("SELECT k.transaction_id AS transactionId,k.user_id AS userId,u.name,t.description,k.done FROM transaction_tasks k JOIN transactions t ON t.id=k.transaction_id JOIN app_users u ON u.id=k.user_id WHERE t.workspace_id=? ORDER BY k.done,k.updated_at DESC").all(ws) as ControlPayload["tasks"];
 return {participants,tasks,commitments:listCommitments(ws),links:goalLinks(ws),rules:goalRules(ws),reserve:cashReserve(ws),quality,drivers,month,previousMonth,audit:db.prepare("SELECT a.id,a.action,a.created_at AS createdAt,u.name AS actorName FROM control_audit a LEFT JOIN app_users u ON u.id=a.actor_id WHERE a.workspace_id=? ORDER BY a.id DESC LIMIT 30").all(ws) as ControlPayload["audit"]};
}

export function previewGoalRule(ws:number, rule:Pick<GoalRule,"account"|"description"|"direction"|"fromDate"|"goalId"|"transactionSign">) {
 const db=getDb();
 if(!db.prepare("SELECT 1 FROM goals WHERE workspace_id=? AND id=?").get(ws,rule.goalId)) throw new ApiError("Goal not found", 404);
 if(!validDay(rule.fromDate)||!rule.account||!rule.description.trim()||![1,-1].includes(rule.direction)) throw new ApiError("Invalid rule", 400);
 return db.prepare("SELECT t.id AS transactionId,t.description,t.date,ABS(t.charged_amount)*? AS contribution,? AS goalId FROM transactions t WHERE t.workspace_id=? AND t.account_number=? AND instr(lower(t.description),lower(?))>0 AND substr(t.date,1,10)>=? AND t.charged_amount * ? > 0 AND t.kind='transfer' AND t.status='completed' AND t.is_excluded=0 AND NOT EXISTS (SELECT 1 FROM goal_links l WHERE l.transaction_id=t.id) ORDER BY t.date DESC LIMIT 201").all(rule.direction,rule.goalId,ws,rule.account,rule.description,rule.fromDate,rule.transactionSign===1?1:-1) as GoalLink[];
}

export function controlCommand(ws:number, body:Record<string,unknown>, actorId:number|null=null) {
 const db=getDb(); const action=body.action;
 const audit=(before:unknown,after:unknown)=>Number(db.prepare("INSERT INTO control_audit (workspace_id,action,before_json,after_json,actor_id) VALUES (?,?,?,?,?)").run(ws,String(action),JSON.stringify(before),JSON.stringify(after),actorId).lastInsertRowid);
 const number=(x:unknown)=>{if(typeof x!=="number"||!Number.isFinite(x)||x<0||x>=1e10)throw new ApiError("Invalid amount", 400);return x;};
 return db.transaction(()=>{
  if(action==="assign") {
   if(!Number.isSafeInteger(body.transactionId)||!Number.isSafeInteger(body.userId)||!db.prepare("SELECT 1 FROM transactions WHERE workspace_id=? AND id=?").get(ws,body.transactionId)||!db.prepare("SELECT 1 FROM app_users WHERE id=? AND disabled=0 AND (is_admin=1 OR id IN (SELECT user_id FROM workspace_members WHERE workspace_id=?))").get(body.userId,ws))throw new ApiError("Invalid assignment", 400);
   const before=db.prepare("SELECT * FROM transaction_tasks WHERE transaction_id=?").get(body.transactionId)??null;
   db.prepare("INSERT INTO transaction_tasks(transaction_id,user_id,done) VALUES (?,?,?) ON CONFLICT(transaction_id) DO UPDATE SET user_id=excluded.user_id,done=excluded.done,updated_at=datetime('now')").run(body.transactionId,body.userId,body.done===true?1:0);audit(before,{transactionId:body.transactionId,userId:body.userId,done:body.done===true});return {success:true};
  }
  if(action==="reserve") {const amount=number(body.amount);const before=cashReserve(ws);db.prepare("INSERT INTO workspace_settings(workspace_id,key,value) VALUES (?,'cash_reserve',?) ON CONFLICT(workspace_id,key) DO UPDATE SET value=excluded.value").run(ws,String(amount));audit(before,amount);return {success:true};}
  if(action==="commitment") {
   const item=body.item as Commitment; if(!item||typeof item.name!=="string"||!item.name.trim()||item.name.length>80||!validDay(item.nextDate)||!["once","monthly","yearly"].includes(item.cadence)||!["bank","card"].includes(item.source)||!["active","cancelled"].includes(item.status)||item.trialEnd!=null&&!validDay(item.trialEnd))throw new ApiError("Invalid commitment", 400);
   number(item.amount);const before=item.id?listCommitments(ws).find(c=>c.id===item.id):null;if(item.id&&!before)throw new ApiError("Not found", 404);
   if(before) db.prepare("UPDATE commitments SET name=?,amount=?,next_date=?,cadence=?,source=?,status=?,trial_end=?,previous_amount=?,updated_at=datetime('now') WHERE workspace_id=? AND id=?").run(item.name.trim(),item.amount,item.nextDate,item.cadence,item.source,item.status,item.trialEnd,before.amount!==item.amount?before.amount:before.previousAmount,ws,item.id);
   else db.prepare("INSERT INTO commitments(workspace_id,name,amount,next_date,cadence,source,status,trial_end,series_key) VALUES (?,?,?,?,?,?,?,?,?)").run(ws,item.name.trim(),item.amount,item.nextDate,item.cadence,item.source,item.status,item.trialEnd,typeof item.seriesKey==="string"?item.seriesKey.slice(0,300):null);
   audit(before,item);return {success:true};
  }
  if(action==="link") {
   const id=Number(body.transactionId), goal=Number(body.goalId), contribution=Number(body.contribution);
   const txn=db.prepare("SELECT charged_amount,kind,status FROM transactions WHERE workspace_id=? AND id=?").get(ws,id) as {charged_amount:number;kind:string;status:string}|undefined;
   if(!txn||txn.kind!=="transfer"||txn.status!=="completed"||!Number.isFinite(contribution)||Math.abs(contribution)>Math.abs(txn.charged_amount)||contribution===0||!db.prepare("SELECT 1 FROM goals WHERE workspace_id=? AND id=?").get(ws,goal))throw new ApiError("Link a completed transfer and an amount no larger than the transfer", 400);
   const before=goalLinks(ws).find(l=>l.transactionId===id)??null;
   db.prepare("INSERT INTO goal_links(transaction_id,goal_id,contribution) VALUES (?,?,?) ON CONFLICT(transaction_id) DO UPDATE SET goal_id=excluded.goal_id,contribution=excluded.contribution").run(id,goal,contribution);audit(before,{transactionId:id,goalId:goal,contribution});return {success:true};
  }
  if(action==="unlink") {const before=goalLinks(ws).find(l=>l.transactionId===body.transactionId);if(!before)throw new ApiError("Not found", 404);db.prepare("DELETE FROM goal_links WHERE transaction_id=?").run(before.transactionId);audit(before,null);return {success:true};}
  if(action==="rule-preview"||action==="rule-save"||action==="rule-apply") {
   const rule=body.rule as GoalRule;const matches=previewGoalRule(ws,rule);
   if(action==="rule-preview")return {matches};
   if(matches.length>200)throw new ApiError("Narrow the date range to 200 transfers or fewer", 400);
   if(action==="rule-save") {db.prepare("INSERT INTO goal_rules(workspace_id,goal_id,account,description,direction,from_date,automatic,transaction_sign) VALUES (?,?,?,?,?,?,?,?)").run(ws,rule.goalId,rule.account,rule.description,rule.direction,body.automatic===true&&rule.fromDate<israelToday()?israelToday():rule.fromDate,body.automatic===true?1:0,rule.transactionSign===1?1:-1);audit(null,rule);return {success:true};}
   if(!Array.isArray(body.expectedIds)||JSON.stringify(matches.map(m=>m.transactionId))!==JSON.stringify(body.expectedIds))throw new ApiError("Preview changed. Preview again before applying.", 409);
   for(const m of matches)db.prepare("INSERT INTO goal_links(transaction_id,goal_id,contribution) VALUES (?,?,?)").run(m.transactionId,m.goalId,m.contribution);
   const undoId=audit([],matches);return {success:true,undoId};
  }
  if(action==="rule-toggle") {const before=goalRules(ws).find(r=>r.id===body.id);if(!before)throw new ApiError("Not found", 404);db.prepare("UPDATE goal_rules SET enabled=? WHERE workspace_id=? AND id=?").run(body.enabled===true?1:0,ws,before.id);audit(before,{...before,enabled:body.enabled===true?1:0});return {success:true};}
  if(action==="undo-rule") {
   const entry=db.prepare("SELECT after_json FROM control_audit WHERE workspace_id=? AND id=? AND action='rule-apply'").get(ws,Number(body.id)) as {after_json:string}|undefined;if(!entry)throw new ApiError("Undo unavailable", 400);
   const after=JSON.parse(entry.after_json) as GoalLink[];const current=goalLinks(ws);
   if(after.some(a=>!current.some(c=>c.transactionId===a.transactionId&&c.goalId===a.goalId&&c.contribution===a.contribution)))throw new ApiError("Links changed since this action", 409);
   for(const a of after)db.prepare("DELETE FROM goal_links WHERE transaction_id=?").run(a.transactionId);
   db.prepare("UPDATE control_audit SET action='rule-undone' WHERE id=? AND workspace_id=?").run(body.id,ws);audit(after,[]);return {success:true};
  }
  throw new ApiError("Unknown action", 400);
 })();
}

/** Opt-in rules run after sync; ordinary saved rules only offer previews. */
export function applyAutomaticGoalRules(ws:number){
 for(const rule of goalRules(ws).filter(r=>r.enabled&&r.automatic)){
  const matches=previewGoalRule(ws,rule);
  if(matches.length&&matches.length<=200) controlCommand(ws,{action:"rule-apply",rule,expectedIds:matches.map(m=>m.transactionId)});
 }
}
