import type { Track } from "../music";
export function applyExplicitFilters(tracks:Track[],notes:string):Track[]{
 const noLive=/(不要|不听|不想|排除|非).{0,4}(现场|live)/i.test(notes);
 const noRemix=/(不要|不听|不想|排除|非).{0,4}(混音|remix)/i.test(notes);
 const decade=notes.match(/(?<!\d)(?:(19|20))?(\d0)\s*年代/);let firstYear:number|undefined;
 if(decade){const n=Number(decade[2]);firstYear=(decade[1]?Number(decade[1])*100:n>=30?1900:2000)+n;}
 return tracks.filter(t=>{if(noLive && /\blive\b|现场|現場|演唱會|演唱会/i.test(t.title+" "+t.album))return false;if(noRemix&&/remix|混音/i.test(t.title+" "+t.album))return false;if(firstYear!==undefined&&(!t.year||Number(t.year)<firstYear||Number(t.year)>firstYear+9))return false;return true;});
}
