import "server-only";

import { ApiError } from "@/server/lib/api-error";
import {randomBytes,scryptSync,timingSafeEqual,createHash} from "node:crypto";
import {getDb} from "@/server/db";
export const USER_COOKIE="penny-user";
export type AppUser={id:number;name:string;username:string;isAdmin:boolean};
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export const accessEnabled=()=>!!getDb().prepare("SELECT 1 FROM app_users LIMIT 1").get();
export function cookieToken(request:Request){return request.headers.get("cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith(USER_COOKIE+"="))?.slice(USER_COOKIE.length+1)??null;}
export function currentUser(request:Request):AppUser|null {
 const token=cookieToken(request);if(!token)return null;
 const row=getDb().prepare("SELECT u.id,u.name,u.username,u.is_admin AS isAdmin FROM user_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND u.disabled=0").get(digest(token)) as AppUser|undefined;
 return row?{...row,isAdmin:!!row.isAdmin}:null;
}
export function membership(user:AppUser,ws:number):"viewer"|"editor"|null {if(user.isAdmin)return "editor";return (getDb().prepare("SELECT role FROM workspace_members WHERE user_id=? AND workspace_id=?").get(user.id,ws) as {role:"viewer"|"editor"}|undefined)?.role??null;}
export function defaultWorkspace(user:AppUser){return (getDb().prepare(user.isAdmin?"SELECT id FROM workspaces ORDER BY id LIMIT 1":"SELECT workspace_id AS id FROM workspace_members WHERE user_id=? ORDER BY workspace_id LIMIT 1").get(...(user.isAdmin?[]:[user.id])) as {id:number}|undefined)?.id??null;}
export function createUser(name:unknown,username:unknown,password:unknown,admin=false){
 if(typeof name!=="string"||!name.trim()||name.length>60||typeof username!=="string"||!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)||typeof password!=="string"||password.length<12||password.length>200)throw new ApiError("Use a name, a 3–50 character username and a password of at least 12 characters", 400);
 const salt=randomBytes(16).toString("hex"),hash=scryptSync(password,salt,64).toString("hex");
 return Number(getDb().prepare("INSERT INTO app_users(name,username,password_hash,is_admin) VALUES (?,?,?,?)").run(name.trim(),username.toLowerCase(),`${salt}:${hash}`,admin?1:0).lastInsertRowid);
}
export function newSession(userId:number){const token=randomBytes(32).toString("hex");getDb().prepare("INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES (?,?,datetime('now','+7 days'))").run(digest(token),userId);return token;}
export function loginUser(username:unknown,password:unknown){
 if(typeof username!=="string"||username.length>50||typeof password!=="string"||password.length>200)throw new ApiError("Invalid credentials", 401);
 const db=getDb(),key=username.toLowerCase(),now=Date.now(),attempt=db.prepare("SELECT failures,blocked_until FROM access_attempts WHERE username=?").get(key) as {failures:number;blocked_until:number}|undefined;
 if(attempt&&attempt.blocked_until>now)throw new ApiError("Wait before trying again", 429);
 const user=db.prepare("SELECT id,password_hash FROM app_users WHERE username=? AND disabled=0").get(key) as {id:number;password_hash:string}|undefined;
 const [salt,hash]=(user?.password_hash??"00000000000000000000000000000000:"+"00".repeat(64)).split(":");
 const valid=timingSafeEqual(scryptSync(password,salt,64),Buffer.from(hash,"hex"));
 if(!user||!valid){const failures=(attempt?.failures??0)+1;db.prepare("INSERT INTO access_attempts(username,failures,blocked_until) VALUES (?,?,?) ON CONFLICT(username) DO UPDATE SET failures=excluded.failures,blocked_until=excluded.blocked_until").run(key,failures,failures>=5?now+15*60*1000:0);throw new ApiError("Invalid credentials", 401);}
 db.prepare("DELETE FROM access_attempts WHERE username=?").run(key);return newSession(user.id);
}
export function endUserSession(request:Request){const token=cookieToken(request);if(token)getDb().prepare("DELETE FROM user_sessions WHERE token_hash=?").run(digest(token));}
/** Fail closed for every API not explicitly supported for household members. */
export function allowedMemberRoute(path:string,method:string,role:"viewer"|"editor"){
 if(path==="/api/access"||path==="/api/workspaces"&&method==="GET"||path==="/api/preferences")return true;
 const reads=/^\/api\/(home|summary|cash-ahead|balance-forecast|control|plan|assets|fi|overview|recap|resilience|wellbeing|suggestions|insights|periodic|budgets|categories|transactions|insurance|planned)(\/|$)/;
 if(method==="GET")return reads.test(path);
 if(role!=="editor")return false;
 return /^\/api\/(control|plan|periodic|budgets|categories|transactions|insurance|planned)(\/|$)/.test(path);
}
