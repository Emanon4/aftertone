import { applyExplicitFilters } from "@/lib/server/filters";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getTrack, recall, libraryStats } from "@/lib/server/catalog";
import { rankWithJev, type Direction } from "@/lib/server/recommend";
export async function POST(req:Request){
 const origin=req.headers.get("origin");if(origin&&origin!==new URL(req.url).origin)return Response.json({error:"请求来源无效。"},{status:403});
 const user=await getChatGPTUser();if(!user)return Response.json({error:"请先登录，再开始智能找歌。",login:true},{status:401});
 const runtime=env as unknown as {TYPESAFE_API_KEY?:string;DB?:D1Database};
 const key=runtime.TYPESAFE_API_KEY||process.env.TYPESAFE_API_KEY;
 if(!key)return Response.json({error:"Jev 尚未连接，仍可搜索、试听和收藏。"},{status:503});
 let body;try{const text=await req.text();if(text.length>20000)throw Error();body=JSON.parse(text);}catch{return Response.json({error:"请求格式无效。"},{status:400});}
 if(!body.seed||!/^\d{1,18}$/.test(body.seed.id)||!["deezer","itunes"].includes(body.seed.provider)||!["close","sideways","bold"].includes(body.direction)||typeof body.notes!=="string"||body.notes.length>200||!Array.isArray(body.excluded)||body.excluded.length>150||body.excluded.some((x:unknown)=>typeof x!=="string"||!/^(deezer|itunes):\d{1,18}$/.test(x))){return Response.json({error:"找歌条件无效，请重新选一首歌。"},{status:400});}
 const feedback={liked:[],disliked:[]} as {liked:string[];disliked:string[]};
 for(const k of ["liked","disliked"] as const){const values=body.feedback?.[k];if(Array.isArray(values))feedback[k]=values.filter((x:unknown)=>typeof x==="string").slice(0,8).map((x:string)=>x.slice(0,140));}
 try{
  const seed=await getTrack(body.seed.id,body.seed.provider);const recalled=await recall(seed,body.excluded,body.direction,req.url);
  recalled.candidates=applyExplicitFilters(recalled.candidates,body.notes);
  if(!recalled.candidates.length)return Response.json({tracks:[],candidateCount:0,libraryCount:libraryStats.tracks,elapsedMs:0,engine:"constraints",model:"",requestCount:0});
  if(!runtime.DB)throw new Error("筛选额度服务暂不可用，请稍后再试。");
  const day=new Date().toISOString().slice(0,10);
  const budget=await runtime.DB.prepare("INSERT INTO daily_budget(day,count) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET count=count+1 WHERE count<30 RETURNING count").bind(day).first<{count:number}>();
  if(!budget)return Response.json({error:"今天的 30 轮智能找歌已用完。你仍然可以试听和收藏，明天再继续。"},{status:429});
  const started=Date.now();const result=await rankWithJev(recalled.seed,recalled.candidates,body.direction as Direction,body.notes.trim(),key,feedback);
  return Response.json({...result,libraryCount:libraryStats.tracks,elapsedMs:Date.now()-started,remaining:30-budget.count},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"这一轮暂时没有完成，请稍后重试。"},{status:502});}
}
