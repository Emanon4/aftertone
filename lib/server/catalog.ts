import type { Track } from "../music";
import featured from "../featured.json";
type Raw = Record<string, any>;
const cache = new Map<string,{expires:number;data:any}>();
export async function providerFetch(url:string, ttl=300_000):Promise<any> {
 const prior=cache.get(url);if(prior && prior.expires>Date.now())return prior.data;
 const res=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{Accept:"application/json"}});
 if(!res.ok)throw new Error("音乐资料服务暂时无法连接，请稍后重试。");
 const data=await res.json() as Raw;
 if(data.error)throw new Error("暂时无法取得这首歌的资料，请换一首试试。");
 if(ttl){if(cache.size>350)cache.clear();cache.set(url,{expires:Date.now()+ttl,data});}
 return data;
}
export const deezer=(path:string,ttl?:number)=>providerFetch(`https://api.deezer.com/${path}`,ttl);
export function normalizeDeezer(t:Raw, source?:string):Track {
 return {id:String(t.id),provider:"deezer",title:t.title,artist:t.artist.name,artistId:String(t.artist.id),album:t.album?.title||"",albumId:t.album?.id?String(t.album.id):undefined,image:t.album?.cover_big||t.album?.cover_medium||"",url:t.link||`https://www.deezer.com/track/${t.id}`,duration:t.duration,preview:t.preview||undefined,year:t.release_date?.slice(0,4),bpm:t.bpm>0?t.bpm:undefined,source};
}
function normalizeApple(t:Raw):Track {
 return {id:String(t.trackId),provider:"itunes",country:"SG",title:t.trackName,artist:t.artistName,artistId:String(t.artistId),album:t.collectionName||"",image:t.artworkUrl100?.replace("100x100bb","600x600bb")||"",url:t.trackViewUrl,duration:Math.round(t.trackTimeMillis/1000),preview:t.previewUrl,genre:t.primaryGenreName,year:t.releaseDate?.slice(0,4)};
}
export async function searchSongs(query:string):Promise<Track[]> {
 const calls=[deezer(`search?q=${encodeURIComponent(query)}&limit=16`).then(x=>(x.data||[]).filter((t:Raw)=>t.readable!==false).map((t:Raw)=>normalizeDeezer(t)))];
 if(/[\u3400-\u9fff]/.test(query))calls.push(providerFetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=12&country=SG`,60_000).then(x=>x.results.filter((t:Raw)=>t.kind==="song").map(normalizeApple)));
 const results=await Promise.allSettled(calls);const tracks=results.flatMap(r=>r.status==="fulfilled"?r.value:[]);
 if(!tracks.length && results.every(r=>r.status==="rejected"))throw new Error("搜歌服务暂时不可用，请稍后重试。");
 const seen=new Set<string>();return tracks.filter(t=>{const key=clean(t.title)+"|"+clean(t.artist);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,20);
}
export function clean(s:string){return s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]/gu,"");}
export async function getTrack(id:string,provider="deezer"):Promise<Track> {
 if(!/^\d{1,18}$/.test(id))throw new Error("歌曲编号无效。");
 if(provider==="itunes") {const x=await providerFetch(`https://itunes.apple.com/lookup?id=${id}&country=SG`,0);if(!x.results?.[0]?.trackId)throw new Error("这首歌目前无法取得，请重新搜索。");return normalizeApple(x.results[0]);}
 return normalizeDeezer(await deezer(`track/${id}`,0));
}
async function enrich(tracks:Track[]) {
 const albums=[...new Set(tracks.map(t=>t.albumId).filter(Boolean))];const map=new Map<string,Raw>();let i=0;
 await Promise.all(Array.from({length:4},async()=>{while(i<albums.length){const id=albums[i++]!;try{map.set(id,await deezer(`album/${id}`,3600_000));}catch{ /* Missing evidence stays unknown. */ }}}));
 return tracks.map(t=>{const a=map.get(t.albumId||"");return {...t,genre:a?.genres?.data?.map((x:Raw)=>x.name).join(", ")||t.genre,year:a?.release_date?.slice(0,4)||t.year};});
}
export async function recall(seed:Track,excluded:string[],direction="close"):Promise<{seed:Track;candidates:Track[]}> {
 let artistId=seed.provider==="deezer"?seed.artistId:undefined;
 if(!artistId){const x=await deezer(`search/artist?q=${encodeURIComponent(seed.artist)}&limit=5`);artistId=x.data?.find((a:Raw)=>clean(a.name)===clean(seed.artist))?.id;}
 if(!artistId)throw new Error("暂时没有找到这位歌手的关联曲库。可以先试听、收藏，或选择另一首歌作为起点。");
 const [radio,related]=await Promise.allSettled([deezer(`artist/${artistId}/radio?limit=24`),deezer(`artist/${artistId}/related?limit=6`)]);
 const pool:Track[]=radio.status==="fulfilled"?(radio.value.data||[]).map((t:Raw)=>normalizeDeezer(t,"艺术家电台")):[];
 if(related.status==="fulfilled"){
  const tops=await Promise.allSettled((related.value.data||[]).slice(0,6).map((a:Raw)=>deezer(`artist/${a.id}/top?limit=5`).then(x=>(x.data||[]).map((t:Raw)=>normalizeDeezer(t,"关联艺术家")))));
  for(const r of tops)if(r.status==="fulfilled")pool.push(...r.value as Track[]);
 }
 if(pool.length<6 || direction==="bold"){const extra=await Promise.allSettled(featured.slice(0,3).map(t=>deezer(`artist/${t.artistId}/top?limit=5`).then(x=>(x.data||[]).map((t:Raw)=>normalizeDeezer(t,"编辑探索")))));for(const r of extra)if(r.status==="fulfilled")pool.unshift(...r.value as Track[]);}
 const seen=new Set<string>([clean(seed.title)+"|"+clean(seed.artist)]);const blocked=new Set(excluded);const candidates=pool.filter(t=>{const key=clean(t.title)+"|"+clean(t.artist);if(!t.preview||blocked.has(`${t.provider}:${t.id}`)||seen.has(key))return false;seen.add(key);return true;}).slice(0,48);
 if(!candidates.length)throw new Error("这一方向暂时没有新的可试听歌曲，试试另一个起点。");
 const enriched=await enrich([seed,...candidates]);return {seed:enriched[0],candidates:enriched.slice(1)};
}
