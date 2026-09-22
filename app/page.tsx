"use client";
import {useEffect,useRef,useState,type CSSProperties} from "react";
import {ArrowUpRight,ArrowRight,AudioLines,Heart,Play,Pause,Search,X,LoaderCircle,RotateCcw,Info,Check,Volume2,Disc3} from "lucide-react";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import {Dialog,DialogTrigger,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Slider} from "@/components/ui/slider";
import {SongLinks} from "@/components/song-links";
import {ModelSettingsDialog} from "@/components/model-settings";
import {ThemeToggle} from "@/components/theme-toggle";
import {modelRequestSnapshot,modelSettingsError,modelSettingsSummary,type ModelSettings} from "@/lib/model-settings";
import featuredData from "@/lib/featured.json";
import libraryManifest from "@/data/library-manifest.json";
import {type Track,trackKey,seconds,providerName} from "@/lib/music";

type Direction="close"|"sideways"|"bold";
type Progress={scoredCount:number;totalCount:number;completedBatches:number;totalBatches:number;elapsedMs:number};
type ApiData={error?:string;jobId?:string;status?:string;nextStep?:number;progress?:Progress;tracks:Track[];track:Track;candidateCount:number;elapsedMs:number;wallMs?:number;model:string;retryAfterMs?:number;meta?:Record<string,unknown>};
const featured=featuredData as Track[];
const apiBase=(import.meta.env.VITE_API_BASE||"").replace(/\/$/,"");
const api=(path:string)=>apiBase+path;
const previewOnly=import.meta.env.PROD&&!apiBase;
const base=import.meta.env.BASE_URL||"/";
const directions:[Direction,string,string][]=[["close","沿着喜欢","寻找关联更近的作品"],["sideways","换个角度","换一位歌手，保留探索起点"],["bold","大胆一点","从更广的曲库中寻找新方向"]];
function readStored<T,>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||"null")??fallback;}catch{return fallback;}}
class ApiResponseError extends Error{constructor(message:string,public status:number){super(message);}}
async function parseResponse(response:Response):Promise<ApiData>{const type=response.headers.get("content-type")||"";if(!type.includes("json"))throw new ApiResponseError("筛选服务暂未连接，稍后再试。你仍可以打开音乐平台收听。",response.status);const data=await response.json() as ApiData;if(!response.ok)throw new ApiResponseError(data.error||"音乐服务暂时不可用。",response.status);return data;}
export default function Home(){
 const [view,setView]=useState("discover"),[query,setQuery]=useState(""),[searchResults,setSearchResults]=useState<Track[]|null>(null),[searching,setSearching]=useState(false);
 const [seed,setSeed]=useState<Track|null>(null),[direction,setDirection]=useState<Direction>("close"),[notes,setNotes]=useState(""),[recommendations,setRecommendations]=useState<Track[]|null>(null),[round,setRound]=useState(0),[busy,setBusy]=useState(false),[progress,setProgress]=useState<Progress|null>(null);
 const [saved,setSaved]=useState<Track[]>(()=>readStored("aftertone-saved",[])),[dismissed,setDismissed]=useState<Track[]>(()=>readStored("aftertone-dismissed",[])),[error,setError]=useState(""),[toast,setToast]=useState(""),[meta,setMeta]=useState<ApiData|null>(null);
 const [library,setLibrary]=useState({tracks:libraryManifest.tracks,artists:libraryManifest.artists,previewable:libraryManifest.previewable});
 const [modelSettings,setModelSettings]=useState<ModelSettings>({mode:"site"}),[modelSettingsOpen,setModelSettingsOpen]=useState(false),[byokAvailable,setByokAvailable]=useState<boolean|null>(null);
 const [current,setCurrent]=useState<Track|null>(null),[playing,setPlaying]=useState(false),[previewEnded,setPreviewEnded]=useState(false),[loadingTrack,setLoadingTrack]=useState(""),[position,setPosition]=useState(0),[duration,setDuration]=useState<number|null>(null),[volume,setVolume]=useState(.7),[focus,setFocus]=useState(()=>typeof window!=="undefined"&&window.innerWidth<760?0:3);
 const audioRef=useRef<HTMLAudioElement|null>(null),playbackId=useRef(0),requestRef=useRef<AbortController|null>(null),searchRef=useRef<AbortController|null>(null),jobRef=useRef<string|null>(null),searchInput=useRef<HTMLInputElement|null>(null),shelfRef=useRef<HTMLDivElement|null>(null);
 const visible=recommendations===null?featured:recommendations.slice(round*7,round*7+7);
 const focused=visible[Math.min(focus,visible.length-1)];
 const percent=progress?.totalCount?Math.min(100,Math.floor(progress.scoredCount/progress.totalCount*100)):0;
 useEffect(()=>{return()=>{requestRef.current?.abort();searchRef.current?.abort();const job=jobRef.current;if(job)fetch(api(`/api/jobs/${encodeURIComponent(job)}/cancel`),{method:"POST",keepalive:true}).catch(()=>{});};},[]);
 useEffect(()=>{try{localStorage.setItem("aftertone-saved",JSON.stringify(saved.map(t=>{const copy={...t};delete copy.preview;return copy;})));localStorage.setItem("aftertone-dismissed",JSON.stringify(dismissed.map(t=>{const copy={...t};delete copy.preview;return copy;})));}catch{queueMicrotask(()=>setToast("浏览器存储不可用，收藏只保留到本次关闭。"));}},[saved,dismissed]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(""),3000);return()=>clearTimeout(timer);},[toast]);
 useEffect(()=>{if(previewOnly)return;const controller=new AbortController();fetch(api("/api/library"),{signal:controller.signal}).then(r=>r.ok?r.json():null).then(value=>{const d=value as (typeof library&{byokAvailable?:boolean})|null;if(d?.tracks)setLibrary({tracks:d.tracks,artists:d.artists,previewable:d.previewable});if(typeof d?.byokAvailable==="boolean")setByokAvailable(d.byokAvailable);}).catch(()=>{});return()=>controller.abort();},[]);
 const isSaved=(t:Track)=>saved.some(s=>trackKey(s)===trackKey(t));
 function save(t:Track){const exists=isSaved(t);setSaved(prev=>exists?prev.filter(x=>trackKey(x)!==trackKey(t)):[t,...prev]);if(!exists)setDismissed(prev=>prev.filter(x=>trackKey(x)!==trackKey(t)));setToast(exists?"已移出收藏":"这首留下了 · 保存在当前浏览器");}
 function dismiss(t:Track){setDismissed(prev=>[t,...prev.filter(x=>trackKey(x)!==trackKey(t))].slice(0,120));setRecommendations(prev=>prev?.filter(x=>trackKey(x)!==trackKey(t))??null);setToast("记下了，接下来换一个方向");}
 function cancel(){requestRef.current?.abort();const job=jobRef.current;jobRef.current=null;setBusy(false);if(job)fetch(api(`/api/jobs/${encodeURIComponent(job)}/cancel`),{method:"POST"}).catch(()=>{});}
 function choose(t:Track){cancel();searchRef.current?.abort();setSearching(false);setSeed(t);setSearchResults(null);setRecommendations(null);setMeta(null);setRound(0);setError("");setView("discover");document.querySelector(".discovery-console")?.scrollIntoView({behavior:"smooth",block:"center"});}
 async function search(q=query){if(previewOnly){setError("智能找歌与站内试听即将开放，先从这七首歌开始探索。");return;}if(q.trim().length<2){setError("输入至少两个字，或试试歌手的名字。");return;}searchRef.current?.abort();const c=new AbortController();searchRef.current=c;setSearching(true);setError("");setQuery(q);try{const d=await parseResponse(await fetch(api(`/api/music?q=${encodeURIComponent(q.trim())}`),{signal:c.signal}));if(!c.signal.aborted&&searchRef.current===c)setSearchResults(d.tracks);}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:"搜索暂时不可用。");}finally{if(!c.signal.aborted)setSearching(false);}}
 async function recommend(excludePrevious=false){
  if(!seed)return;
  const settingsIssue=modelSettingsError(modelSettings);
  if(settingsIssue){setError(settingsIssue);setModelSettingsOpen(true);return;}
  if(previewOnly){setError("需连接筛选服务才能推荐；个人模型设置可先保留在本页，请先在音乐平台收听。");return;}
  if(modelSettings.mode!=="site"&&byokAvailable===false){setError("此筛选服务暂未开启个人模型，请先使用站点 Jev。");setModelSettingsOpen(true);return;}
  const modelRequest=modelRequestSnapshot(modelSettings);
  cancel();const c=new AbortController();requestRef.current=c;
  const active=()=>!c.signal.aborted&&requestRef.current===c;
  const cancelRemote=(id:string)=>fetch(api(`/api/jobs/${encodeURIComponent(id)}/cancel`),{method:"POST"}).catch(()=>{});
  setBusy(true);setProgress(null);setError("");
  const excluded=[...dismissed,...saved,...(excludePrevious?recommendations||[]:[])].map(trackKey);
  let ownJob:string|null=null,recoveryReads=0;
  try{
   let data=await parseResponse(await fetch(api("/api/recommend"),{method:"POST",headers:modelRequest.headers,signal:c.signal,body:JSON.stringify({seed:{id:seed.id,provider:seed.provider},direction,notes,...(modelRequest.modelConfig?{modelConfig:modelRequest.modelConfig}:{}),excluded:[...new Set(excluded)].slice(0,150),feedback:{liked:saved.slice(0,8).map(x=>`${x.artist} — ${x.title}`),disliked:dismissed.slice(0,8).map(x=>`${x.artist} — ${x.title}`)}})}));
   ownJob=data.jobId||null;
   if(!active()){if(ownJob)void cancelRemote(ownJob);return;}
   jobRef.current=ownJob;if(data.progress)setProgress(data.progress);
   while(ownJob&&data.status!=="done"&&data.status!=="complete"){
    if(!active())return;
    if(["failed","cancelled","expired"].includes(data.status||""))throw new Error(data.error||"这轮筛选没有完成，请重新开始。");
    const jobUrl=api(`/api/jobs/${encodeURIComponent(ownJob)}`);
    const previousStep=data.nextStep??0;
    try{
     if(data.status==="running"){
      await new Promise(resolve=>setTimeout(resolve,Math.min(data.retryAfterMs||750,2000)));
      if(!active())return;
      data=await parseResponse(await fetch(jobUrl,{signal:c.signal}));
     }else{
      data=await parseResponse(await fetch(jobUrl+"/step",{method:"POST",headers:modelRequest.headers,body:JSON.stringify({step:data.nextStep}),signal:c.signal}));
     }
    }catch(stepError){
     if(!active())return;
     const recoverable=stepError instanceof ApiResponseError?stepError.status>=500:stepError instanceof TypeError;
     if(!recoverable||recoveryReads>=3)throw stepError;
     recoveryReads++;
     // Read committed work after transport/server failures; never replay an unchanged pending step.
     try{
      data=await parseResponse(await fetch(jobUrl,{signal:c.signal}));
      if(data.status==="pending"&&(data.nextStep??0)<=previousStep)throw stepError;
     }
     catch{throw stepError;}
    }
    if(!active())return;if(data.progress)setProgress(data.progress);
   }
   if(!active())return;
   if(!Array.isArray(data.tracks))throw new Error(data.error||"没有取得完整筛选结果。");
   setRecommendations(data.tracks);setRound(0);setFocus(0);setMeta({...data,...data.meta} as ApiData);jobRef.current=null;
   requestAnimationFrame(()=>document.querySelector(".listening-room")?.scrollIntoView({behavior:"smooth",block:"start"}));
  }catch(e){
   if(active()){
    setError(e instanceof Error?e.message:"这一轮未完成，请再试一次。");
    jobRef.current=null;if(ownJob)void cancelRemote(ownJob);
   }
  }finally{if(active())setBusy(false);}
 }
 async function play(t:Track){
  if(previewOnly){window.open(t.url,"_blank","noopener,noreferrer");return;}
  const audio=audioRef.current;if(!audio)return;
  if(current&&trackKey(current)===trackKey(t)&&audio.src){
   if(!audio.paused){audio.pause();return;}
   if(audio.ended){audio.currentTime=0;setPosition(0);}
   setPreviewEnded(false);
   try{await audio.play();}catch{setError("请再次点击试听片段。");}return;
  }
  const version=++playbackId.current;setPreviewEnded(false);audio.pause();audio.removeAttribute("src");audio.load();setCurrent(t);setPosition(0);setDuration(null);setLoadingTrack(trackKey(t));setError("");
  try{
   const data=await parseResponse(await fetch(api(`/api/music?id=${t.id}&provider=${t.provider}`)));if(version!==playbackId.current)return;
   if(!data.track.preview)throw new Error("这首暂时没有试听片段，可打开音乐平台听完整版。");
   setCurrent({...t,...data.track});audio.src=data.track.preview;audio.volume=volume;await audio.play();
  }catch(e){if(version===playbackId.current)setError(e instanceof Error?e.message:"试听片段暂不可用。");}
  finally{if(version===playbackId.current)setLoadingTrack("");}
 }
 function next(){if(recommendations&&(round+1)*7<recommendations.length){setRound(round+1);setFocus(0);shelfRef.current?.scrollTo({left:0,behavior:"smooth"});}else recommend(true);}
 function focusTrack(i:number){setFocus(i);shelfRef.current?.children[i]?.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"});}
 return <main className={`site-shell ${current?"has-player-track":""}`}><Tabs value={view} onValueChange={setView}>
  <header className="masthead"><a className="wordmark" href={base} aria-label="余音首页"><AudioLines size={27}/><span>aftertone<span className="brand-cn">余音</span></span></a><TabsList className="site-nav"><TabsTrigger value="discover">发现音乐</TabsTrigger><TabsTrigger value="saved">我的收藏 <span>{saved.length.toString().padStart(2,"0")}</span></TabsTrigger></TabsList></header>
  <TabsContent value="discover">
   <section className={`hero ${seed?"has-seed":""}`}><h1>下一首，<br/><span>你的单曲循环。</span><i aria-hidden="true">✳</i></h1><p className="hero-description">从喜欢的一首，发现下一组七首。</p><button className="current-model" onClick={()=>setModelSettingsOpen(true)} aria-label={`模型设置，当前：${modelSettingsSummary(modelSettings)}`}><span>{modelSettings.mode==="site"?"Jev 辅助筛选":modelSettingsSummary(modelSettings)}</span><span><ArrowUpRight size={12}/></span></button></section>
   <section className="discovery-console">
    <form className="search-form glass" onSubmit={e=>{e.preventDefault();search();}}><Search size={21}/><input ref={searchInput} aria-label="搜索喜欢的歌" placeholder="输入喜欢的歌或歌手" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Escape")setSearchResults(null);}} maxLength={120}/><button className="primary-button" type="submit" disabled={searching}>{searching?<LoaderCircle className="spin" size={17}/>:<>找歌<ArrowUpRight size={17}/></>}</button></form>
    {previewOnly&&<p className="service-note">听音室预览 · 智能找歌与站内试听即将开放，当前可前往音乐平台收听。</p>}
    {!seed&&<div className="search-hints">{["Men I Trust","Radiohead","周杰伦"].map(q=><button key={q} onClick={()=>search(q)}>{q}<ArrowUpRight size={12}/></button>)}</div>}
    {searchResults!==null&&<div className="search-results"><div className="results-heading"><span>{searchResults.length?"选择你喜欢的那一个录音版本":"没有找到，试试加上歌手名字"}</span><button className="icon-button" aria-label="收起搜索结果" onClick={()=>setSearchResults(null)}><X size={18}/></button></div>{searchResults.map(t=><div className="search-row" key={trackKey(t)}><button className="search-art" onClick={()=>play(t)} aria-label={`试听片段：${t.title}`}><img src={t.image} alt=""/><Play size={15}/></button><button className="search-track-name" onClick={()=>choose(t)}><strong>{t.title}</strong><span>{t.artist} · {t.album}</span></button><span className="search-duration">{seconds(t.duration)}</span><button className="choose-track" onClick={()=>choose(t)} aria-label={`选择 ${t.title} 作为起点`}>从这首出发<ArrowUpRight size={15}/></button></div>)}</div>}
    {seed&&<div className="seed-panel"><div className="seed-heading"><img src={seed.image} alt=""/><div><span>从这首出发</span><strong>{seed.title}</strong><p>{seed.artist}</p></div><button className="icon-button" aria-label="移除起点歌曲" onClick={()=>{cancel();setSeed(null);setRecommendations(null);setMeta(null);}}><X size={18}/></button></div><div className="seed-controls"><div className="direction-group" aria-label="探索方向">{directions.map(([key,label,title])=><button key={key} title={title} aria-pressed={direction===key} className={direction===key?"selected":""} onClick={()=>setDirection(key)} disabled={busy}>{label}</button>)}</div><button className="primary-button" onClick={()=>recommend()} disabled={busy}>{busy?<><LoaderCircle className="spin" size={16}/>正在筛选</>:<>寻找我的七首<ArrowRight size={17}/></>}</button></div><input className="preference-input" aria-label="补充找歌偏好" placeholder="偏好（选填）：不要现场版、90 年代…" value={notes} maxLength={200} onChange={e=>setNotes(e.target.value)} disabled={busy}/></div>}
   </section>
   {error&&<div className="error-message" role="alert"><Info size={18}/><span>{error}</span><button className="icon-button" aria-label="关闭提示" onClick={()=>setError("")}><X size={17}/></button></div>}
   <section className="listening-room"><div className="section-heading"><div><h2>{recommendations===null?"先听这七首":"你的七首"}</h2></div><span className="section-note">{recommendations===null?(previewOnly?"前往音乐平台":"试听约 30 秒"):`第 ${String(round+1).padStart(2,"0")} 组 · ${visible.length} 首`}</span></div>
    {busy&&<div className="finding glass" role="status"><div className="finding-label"><AudioLines size={20}/><strong>{progress?`已筛选 ${progress.scoredCount.toLocaleString()} / ${progress.totalCount.toLocaleString()} 首`:"正在为你整理 5,000 首候选"}</strong><span>{progress?`${percent}%`:"准备中"}</span><button onClick={cancel}>取消</button></div><div className={`finding-track ${!progress?"indeterminate":""}`}><span style={{width:`${percent}%`}}/></div></div>}
    {visible.length>0?<><div className={`record-shelf ${busy?"is-loading":""}`} ref={shelfRef}>{visible.map((t,i)=>{const active=current&&trackKey(current)===trackKey(t);return <article className={`record ${focus===i?"is-focus":""} ${active&&playing?"is-current":""}`} style={{"--offset":Math.abs(i-3),"--tilt":`${(i-3)*1.25}deg`,"--index":i} as CSSProperties} key={trackKey(t)}><div className="cover-wrap"><button className="cover-art" onClick={()=>{setFocus(i);play(t);}} aria-label={`${previewOnly?`去 ${providerName(t)} 听完整首`:active&&playing?"暂停试听片段":"试听片段"}：${t.title}`} disabled={loadingTrack===trackKey(t)}><img src={t.image} alt={`${t.album} 专辑封面`} loading={i<4?"eager":"lazy"}/><span className="cover-play">{loadingTrack===trackKey(t)?<LoaderCircle className="spin" size={19}/>:active&&playing?<Pause size={19} fill="currentColor"/>:<Play size={19} fill="currentColor"/>}</span></button><button className={`cover-save ${isSaved(t)?"is-saved":""}`} onClick={()=>save(t)} aria-label={`${isSaved(t)?"取消收藏":"收藏"} ${t.title}`} aria-pressed={isSaved(t)}><Heart size={16} fill={isSaved(t)?"currentColor":"none"}/></button>{active&&playing&&<span className="now-playing"><AudioLines size={15}/>试听片段</span>}</div><button className="record-name" onClick={()=>setFocus(i)}><span className="record-number">{String(i+1).padStart(2,"0")}</span><span><strong>{t.title}</strong><small>{t.artist}</small></span></button></article>;})}</div><div className="shelf-navigation" aria-label="选择曲目">{visible.map((t,i)=><button key={trackKey(t)} aria-label={`查看第 ${i+1} 首 ${t.title}`} aria-pressed={focus===i} onClick={()=>focusTrack(i)}>{String(i+1).padStart(2,"0")}</button>)}</div>{focused&&<div className="focus-detail"><div className="detail-identity"><span className="detail-index">{String(Math.min(focus,visible.length-1)+1).padStart(2,"0")}<i>/ {String(visible.length).padStart(2,"0")}</i></span><div><h3>{focused.title}</h3><p>{focused.reason||`${focused.artist} · ${focused.album}`}</p></div></div><div className="detail-actions"><SongLinks track={focused}/><button className="text-button" onClick={()=>choose(focused)}>{recommendations===null?"从这首出发":"沿着这首继续"}<ArrowRight size={16}/></button>{recommendations!==null&&<button onClick={()=>dismiss(focused)}>不太合适</button>}</div>{focused.provider==="itunes"&&<p className="attribution">试听 provided courtesy of iTunes</p>}</div>}</>:<div className="empty-state"><Disc3 size={34}/><h3>这一轮，没有勉强凑数。</h3><p>换一个起点，或者放宽刚才的条件。</p><button className="text-button" onClick={()=>{setRecommendations(null);setNotes("");}}>重新找个起点<ArrowRight size={16}/></button></div>}
    {recommendations!==null&&<div className="collection-line">{meta?<details className="round-details"><summary>筛选详情</summary><p className="round-meta">本轮实际筛选 {meta.candidateCount||progress?.totalCount||0} 首 · {((meta.wallMs||meta.elapsedMs||progress?.elapsedMs||0)/1000).toFixed(1)} 秒 · {meta.model||"Jev"}</p></details>:<span/>}<button className="text-button" onClick={next} disabled={busy}>{(round+1)*7<recommendations.length?"再听七首":"寻找新一轮"}<ArrowRight size={16}/></button></div>}
   </section>
  </TabsContent>
  <TabsContent value="saved"><section className="saved-heading"><h1>我的收藏<span>{saved.length.toString().padStart(2,"0")}</span></h1></section>{saved.length?<div className="saved-list">{saved.map((t,i)=><div className="saved-row" key={trackKey(t)}><span className="saved-number">{String(i+1).padStart(2,"0")}</span><button className="saved-cover" onClick={()=>play(t)} aria-label={`${previewOnly?`去 ${providerName(t)} 听完整首`:"试听片段"}：${t.title}`}><img src={t.image} alt=""/><Play size={17}/></button><div className="saved-info"><h3>{t.title}</h3><p>{t.artist}</p></div><span className="saved-album">{t.album}</span><button className="text-button" onClick={()=>choose(t)}>沿着这首找<ArrowRight size={15}/></button><button className="heart-button is-saved" onClick={()=>save(t)} aria-label={`取消收藏 ${t.title}`}><Heart fill="currentColor" size={18}/></button></div>)}</div>:<div className="empty-state"><Heart size={34}/><h3>还没有留下的歌</h3><p>听到心动的那一首，点一下爱心。</p><button className="text-button" onClick={()=>setView("discover")}>去听点新的<ArrowRight size={16}/></button></div>}</TabsContent>
 </Tabs>
 <footer className="page-footer"><div className="footer-links"><ThemeToggle/><ModelSettingsDialog settings={modelSettings} open={modelSettingsOpen} onOpenChange={setModelSettingsOpen} busy={busy} previewOnly={previewOnly} byokAvailable={byokAvailable} onApply={settings=>{setModelSettings(settings);setError("");setToast(`已应用 ${modelSettingsSummary(settings)}${previewOnly?" · 需连接筛选服务":""}`);}}/><Dialog><DialogTrigger className="about-link">关于余音<Info size={13}/></DialogTrigger><DialogContent className="about-dialog"><DialogTitle>关于余音</DialogTitle><DialogDescription>余音 · Aftertone</DialogDescription><p>从你喜欢的一首歌出发，召回最多 5,000 首真实候选，由 Jev 根据歌曲资料与明确偏好筛选，七首一组呈现。</p><p>Jev 不能直接听音频。资料关联是试听线索，不是对“好听”的保证；曲库中的策展集合也不等于官方音乐风格。</p><p>当前索引包含 {library.tracks.toLocaleString()} 首，仍偏向艺人热门作品，不覆盖全球音乐。曲目资料和试听片段来自 Deezer，部分华语搜索由 iTunes 补充。站内提供短试听；点击“听完整首”可选择 Deezer、Apple Music、Spotify、网易云、QQ 音乐或 YouTube Music；已有来源链接直达歌曲，其他平台按歌名和歌手搜索，完整版能否播放由平台账号、订阅与所在地区决定。</p><p>收藏和不合适记录保存在当前浏览器。筛选会将歌曲资料、偏好和最近最多 8 条正负反馈发给当前所选模型服务。站点 Jev 全站每天最多 30 轮；个人 Key 独立每日 30 轮。取消后已在途的模型调用可能仍会完成。</p><a href="https://docs.typesafe.ai/concepts/state" target="_blank" rel="noreferrer">了解 Jev 的能力<ArrowUpRight size={14}/></a>{dismissed.length>0&&<button className="text-button" onClick={()=>{setDismissed([]);setToast("已清空不合适记录");}}>重置不合适记录<RotateCcw size={14}/></button>}</DialogContent></Dialog><a className="about-link" href="https://github.com/Emanon4/aftertone" target="_blank" rel="noopener noreferrer">GitHub<ArrowUpRight size={13}/></a></div></footer>
 <audio ref={audioRef} onPlay={()=>{setPlaying(true);setPreviewEnded(false);}} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);setPreviewEnded(true);}} onTimeUpdate={e=>setPosition(e.currentTarget.currentTime)} onLoadedMetadata={e=>setDuration(Number.isFinite(e.currentTarget.duration)&&e.currentTarget.duration>0?e.currentTarget.duration:null)} onError={()=>{if(audioRef.current?.getAttribute("src")){setPlaying(false);setError("试听片段暂时无法播放，可以打开音乐平台收听。");}}} preload="none"/>
 {current&&<div className="player-bar glass has-track">
   <div className="player-track"><img src={current.image} alt=""/><div><strong>{current.title}</strong><span>{current.artist}</span><span className="preview-label">试听片段 · {duration===null?"约 30 秒":`${Math.round(duration)} 秒`}</span></div><button className={`heart-button ${isSaved(current)?"is-saved":""}`} aria-label={`${isSaved(current)?"取消收藏":"收藏"}正在试听的歌曲`} onClick={()=>save(current)}><Heart size={17} fill={isSaved(current)?"currentColor":"none"}/></button></div>
   <div className="transport"><button className="transport-play" onClick={()=>play(current)} aria-label={playing?"暂停试听片段":previewEnded?"重播试听片段":"播放试听片段"} disabled={!!loadingTrack}>{loadingTrack?<LoaderCircle className="spin" size={19}/>:playing?<Pause size={19} fill="currentColor"/>:<Play size={19} fill="currentColor"/>}</button><span className="time">{seconds(position)}</span><Slider aria-label="试听片段进度" value={[position]} max={duration||30} step={.1} onValueChange={([v])=>{if(audioRef.current&&audioRef.current.readyState>0){audioRef.current.currentTime=v;setPosition(v);setPreviewEnded(false);}}}/><span className="time">{seconds(duration||30)}</span></div>
   <div className="player-extras"><div className="volume-control"><Volume2 size={17}/><Slider aria-label="音量" value={[volume]} min={0} max={1} step={.05} onValueChange={([v])=>{setVolume(v);if(audioRef.current)audioRef.current.volume=v;}}/></div><div className="player-listen">{previewEnded&&<span className="preview-ended" role="status">试听片段结束</span>}<SongLinks track={current} compact/></div></div>
 </div>}
 {toast&&<div className="toast" role="status"><Check size={16}/>{toast}</div>}
 </main>;
}
