import type { Track } from "../music";
// A negation must sit right before the thing it negates. A bare 非 only counts when directly attached
// (非现场), so 非常喜欢现场版 is not read as a refusal.
const NEGATION = "(?:(?:不要|不听|不想听|不想要|不想|排除|去掉|别要|别|避开|\\b(?:no|without|exclude)\\b)[^，,。.;；!！?？]{0,4}|非)";
const negated = (target: string) => new RegExp(`${NEGATION}(?:${target})`, "i");
const endsNegated = new RegExp(`${NEGATION}$`, "i");
const DECADE = /(?<!\d)(?:(19|20))?(\d0)\s*(?:年代|s\b)/gi;
export function applyExplicitFilters(tracks:Track[],notes:string):Track[]{
 const noLive=negated("现场|現場|live").test(notes);
 const noRemix=negated("混音|remix").test(notes);
 // 想听 90 年代 keeps only that decade; 不要 80 年代 removes it and keeps tracks with unknown years.
 const wanted:number[]=[],avoided:number[]=[];
 for(const m of notes.matchAll(DECADE)){
  const n=Number(m[2]),first=(m[1]?Number(m[1])*100:n>=30?1900:2000)+n;
  (endsNegated.test(notes.slice(Math.max(0,m.index-8),m.index))?avoided:wanted).push(first);
 }
 const inDecade=(year:number,first:number)=>year>=first&&year<=first+9;
 return tracks.filter(t=>{
  if(noLive&&/\blive\b|现场|現場|演唱會|演唱会/i.test(t.title+" "+t.album))return false;
  if(noRemix&&/remix|混音/i.test(t.title+" "+t.album))return false;
  const year=Number(t.year);
  if(wanted.length&&(!year||!wanted.some(first=>inDecade(year,first))))return false;
  if(year&&avoided.some(first=>inDecade(year,first)))return false;
  return true;
 });
}
