import { getTrack, searchSongs } from "@/lib/server/catalog";
export async function GET(req:Request){
 const url=new URL(req.url);try{
  if(url.searchParams.get("id")){const provider=url.searchParams.get("provider")||"deezer";if(!["deezer","itunes"].includes(provider))return Response.json({error:"音乐来源无效。"},{status:400});return Response.json({track:await getTrack(url.searchParams.get("id")!,provider)},{headers:{"Cache-Control":"no-store"}});}
  const q=url.searchParams.get("q")?.trim();if(!q||q.length<2||q.length>120)return Response.json({error:"请输入 2–120 字的歌名或歌手。"},{status:400});
  return Response.json({tracks:await searchSongs(q)},{headers:{"Cache-Control":"private, max-age=60"}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"音乐资料暂时无法加载。"},{status:502});}
}
