import type { Track } from "../music";

export const clean = (s:string) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
const key = (t:Track) => `${t.provider}:${t.id}`;
const recording = (t:Track) => `${clean(t.artist)}|${clean(t.title)}`;
// Namespace editorial groupings so they never become provider genre facts.
const tags = (t:Track) => [...[t.genre || "", ...(t.artistGenres || [])].flatMap(g=>g.split(",")).map(clean).filter(Boolean).map(g=>`genre:${g}`),...(t.collectionGroups||[]).map(g=>`collection:${clean(g)}`)];
function shuffle<T>(items:T[],random:()=>number){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

/** Select from a bounded, mixed sample of the index; no claim that the entire catalog is scored. */
export function selectCandidatePool(seed:Track,library:Track[],live:Track[],excluded:string[],direction="close",limit=200,random:()=>number=Math.random):Track[]{
 const seedArtist=clean(seed.artist);const seedEntries=library.filter(t=>clean(t.artist)===seedArtist);
 const directTags=new Set([...tags(seed),...seedEntries.flatMap(tags)]);
 const relatedArtists=new Set(live.map(t=>clean(t.artist)));
 const adjacentTags=new Set(library.filter(t=>relatedArtists.has(clean(t.artist))).flatMap(tags));
 const all=[seed,...library,...live];const blocked=new Set(excluded);
 const blockedTracks=all.filter(t=>blocked.has(key(t)));
 const seenKeys=new Set([key(seed),...excluded]);const seenRecordings=new Set([recording(seed),...blockedTracks.map(recording)]);
 const seenISRCs=new Set([seed,...blockedTracks].map(t=>t.isrc).filter(Boolean));
 const availableArtists=new Set([...library,...live].filter(t=>direction==="close"||clean(t.artist)!==seedArtist).map(t=>clean(t.artist))).size;
 let artistCap=limit<=200?3:Math.min(20,Math.max(3,Math.ceil(limit/Math.max(1,availableArtists))));
 const artists=new Map<string,number>();const result:Track[]=[];
 const take=(pool:Track[],count:number,source?:string)=>{
  let taken=0;for(const t of pool){if(taken>=count||result.length>=limit)break;const a=clean(t.artist);
   if((!t.preview&&!t.previewAvailable)||seenKeys.has(key(t))||seenRecordings.has(recording(t))||(t.isrc&&seenISRCs.has(t.isrc))||(artists.get(a)||0)>=artistCap||(direction!=="close"&&a===seedArtist))continue;
   result.push(source?{...t,source}:t);seenKeys.add(key(t));seenRecordings.add(recording(t));if(t.isrc)seenISRCs.add(t.isrc);artists.set(a,(artists.get(a)||0)+1);taken++;
  }
 };
 const related=library.filter(t=>relatedArtists.has(clean(t.artist))||tags(t).some(g=>directTags.has(g)));
 const adjacent=library.filter(t=>tags(t).some(g=>adjacentTags.has(g)));
 const baseQuotas=direction==="bold"?[40,70,40]:direction==="sideways"?[60,80,40]:[80,80,20];
 const quotas=limit<=200?baseQuotas:[Math.min(160,Math.round(limit*.04)),Math.round(limit*(direction==="bold"?.25:.45)),Math.round(limit*.2)];
 take(shuffle(live,random),quotas[0]);
 take(shuffle(related,random),quotas[1],"曲库关联探索");
 take(shuffle(adjacent,random),quotas[2],"曲库邻近探索");
 take(shuffle(library,random),limit-result.length,"曲库开放探索");
 take(shuffle([...live,...related],random),limit-result.length);
 // Large runs may need more recordings per artist; never exceed 20 or change final diversity.
 while(limit>200&&result.length<limit&&artistCap<20){artistCap=Math.min(20,artistCap+2);take(shuffle(library,random),limit-result.length,"曲库开放探索");take(shuffle(live,random),limit-result.length);}
 return result;
}
