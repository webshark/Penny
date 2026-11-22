import {NextResponse} from "next/server";
import {getDb} from "@/server/db";
import { ApiError, errorResponse } from "@/server/lib/api-error";
import {accessEnabled,currentUser,createUser,loginUser,newSession,endUserSession,USER_COOKIE} from "@/server/lib/user-access";
function session(response:NextResponse,request:Request,token:string|null){response.cookies.set(USER_COOKIE,token??"",{httpOnly:true,sameSite:"strict",secure:new URL(request.url).protocol==="https:",path:"/",maxAge:token?7*86400:0});return response;}
export async function GET(request:Request){const enabled=accessEnabled(),user=currentUser(request),db=getDb();return NextResponse.json({enabled,user,users:user?.isAdmin?db.prepare("SELECT id,name,username,is_admin AS isAdmin,disabled FROM app_users ORDER BY id").all():[],members:user?.isAdmin?db.prepare("SELECT user_id AS userId,workspace_id AS workspaceId,role FROM workspace_members").all():[],audit:user?.isAdmin?db.prepare("SELECT a.id,u.name,a.action,a.workspace_id AS workspaceId,a.created_at AS createdAt FROM access_audit a LEFT JOIN app_users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 30").all():[]});}
export async function POST(request:Request){const body=await request.json().catch(()=>null);if(!body)return NextResponse.json({error:"Invalid request"},{status:400});const db=getDb(),user=currentUser(request);
 try{
  if(body.action==="bootstrap")return db.transaction(()=>{if(accessEnabled())throw new ApiError("Already configured",409);const id=createUser(body.name,body.username,body.password,true);return session(NextResponse.json({success:true}),request,newSession(id));})();
  if(body.action==="login")return session(NextResponse.json({success:true}),request,loginUser(body.username,body.password));
  if(body.action==="logout"){endUserSession(request);return session(NextResponse.json({success:true}),request,null);}
  if(!user?.isAdmin)return NextResponse.json({error:"Owner access required"},{status:403});
  if(body.action==="create-user"){const id=createUser(body.name,body.username,body.password);db.prepare("INSERT INTO access_audit(user_id,action) VALUES (?,'create-user')").run(user.id);return NextResponse.json({id});}
  if(body.action==="membership"){
   if(!Number.isInteger(body.userId)||!Number.isInteger(body.workspaceId)||!["viewer","editor","none"].includes(body.role)||!db.prepare("SELECT 1 FROM app_users WHERE id=? AND is_admin=0").get(body.userId)||!db.prepare("SELECT 1 FROM workspaces WHERE id=?").get(body.workspaceId))throw new ApiError("Invalid membership");
   db.transaction(()=>{if(body.role==="none")db.prepare("DELETE FROM workspace_members WHERE user_id=? AND workspace_id=?").run(body.userId,body.workspaceId);else db.prepare("INSERT INTO workspace_members VALUES (?,?,?) ON CONFLICT(user_id,workspace_id) DO UPDATE SET role=excluded.role").run(body.userId,body.workspaceId,body.role);db.prepare("INSERT INTO access_audit(user_id,action,workspace_id) VALUES (?,?,?)").run(user.id,`membership:${body.userId}:${body.role}`,body.workspaceId);})();return NextResponse.json({success:true});
  }
  if(body.action==="revoke-sessions"){if(!Number.isInteger(body.userId))throw new ApiError("Invalid user");db.prepare("DELETE FROM user_sessions WHERE user_id=?").run(body.userId);return NextResponse.json({success:true});}
  return NextResponse.json({error:"Unknown action"},{status:400});
 }catch(error){return errorResponse("access",error);}
}
