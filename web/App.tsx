import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Disc3, Info, Share2, X } from "lucide-react";
import featuredData from "@/lib/featured.json";
import { modelRequestSnapshot, modelSettingsError, modelSettingsSummary, type ModelSettings } from "@/lib/model-settings";
import { coverAt, trackKey, type Track } from "@/lib/music";
import { lookupTrack, previewOnly, searchTracks, type Direction, type JobData } from "./lib/api";
import { format, useI18n } from "./lib/i18n";
import { download, mergeTracks, parseBackup, readShare, readStored, shareUrl, toBackup, toCsv, toText, withoutPreview, writeStored, type DismissReason, type DismissedTrack } from "./lib/storage";
import { getTurnstileToken } from "./lib/turnstile";
import { useCoverColor } from "./hooks/useCoverColor";
import { useLibrary } from "./hooks/useLibrary";
import { usePlayer } from "./hooks/usePlayer";
import { useRecommendJob } from "./hooks/useRecommendJob";
import { DiscoveryConsole } from "./components/DiscoveryConsole";
import { AboutDialog, Footer } from "./components/Footer";
import { Header, type View } from "./components/Header";
import { Hero } from "./components/Hero";
import { ModelSettingsDialog } from "./components/ModelSettingsDialog";
import { PlayerBar } from "./components/PlayerBar";
import { RailHead, RecordRail } from "./components/RecordRail";
import { SavedView } from "./components/SavedView";
import { ListenTiles } from "./components/SongLinks";

const featured = featuredData as Track[];
const SAVED_KEY = "aftertone-saved", DISMISSED_KEY = "aftertone-dismissed";
const pad = (n: number) => String(n).padStart(2, "0");

export default function App() {
 const { t, lang } = useI18n();
 const { library } = useLibrary();
 const job = useRecommendJob();
 const [view, setView] = useState<View>("discover");
 const [query, setQuery] = useState(""), [results, setResults] = useState<Track[] | null>(null), [searching, setSearching] = useState(false);
 const [seed, setSeed] = useState<Track | null>(null), [direction, setDirection] = useState<Direction>("close"), [notes, setNotes] = useState("");
 const [recommendations, setRecommendations] = useState<Track[] | null>(null), [round, setRound] = useState(0), [meta, setMeta] = useState<JobData | null>(null);
 const [shared, setShared] = useState<Track[] | null>(null);
 const [saved, setSaved] = useState<Track[]>(() => readStored(SAVED_KEY, []));
 const [dismissed, setDismissed] = useState<DismissedTrack[]>(() => readStored(DISMISSED_KEY, []));
 const [focus, setFocus] = useState(0);
 const [error, setError] = useState(""), [toast, setToast] = useState("");
 const [modelSettings, setModelSettings] = useState<ModelSettings>({ mode: "site" }), [modelOpen, setModelOpen] = useState(false), [aboutOpen, setAboutOpen] = useState(false);
 const searchInput = useRef<HTMLInputElement | null>(null), searchAbort = useRef<AbortController | null>(null);

 const showError = useCallback((message: string) => setError(message), []);
 const playerMessages = useMemo(() => ({ noPreview: t("error.noPreview"), playAgain: t("error.playAgain"), audio: t("error.audio") }), [t]);
 const player = usePlayer(showError, playerMessages);

 const visible = recommendations ? recommendations.slice(round * 7, round * 7 + 7) : shared ?? featured;
 const focused = visible[Math.min(focus, Math.max(0, visible.length - 1))] as Track | undefined;
 const ambientCover = focused?.image ? coverAt(focused.image, 56) : undefined;
 const glow = useCoverColor(ambientCover);

 // Persist without short-lived preview URLs.
 useEffect(() => {
  const ok = writeStored(SAVED_KEY, saved.map(withoutPreview)) && writeStored(DISMISSED_KEY, dismissed.map(withoutPreview));
  if (!ok) queueMicrotask(() => setToast(t("toast.storage")));
 }, [saved, dismissed, t]);
 useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3000); return () => clearTimeout(timer); }, [toast]);

 // Open a shared set from the URL hash (IDs only), resolving fresh metadata from the API.
 useEffect(() => {
  const share = readShare(location.hash);
  if (!share || previewOnly) return;
  let cancelled = false;
  Promise.allSettled(share.tracks.map(lookupTrack)).then(settled => {
   if (cancelled) return;
   const tracks = settled.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
   if (tracks.length) { setShared(tracks); setFocus(0); setToast(format(lang, "toast.shareLoaded")); } else setError(format(lang, "error.share"));
  });
  return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- read the hash once on load
 }, []);

 // A server-driven round started on an earlier visit keeps running; show its result when it lands.
 useEffect(() => {
  if (previewOnly || readShare(location.hash)) return;
  job.resume().then(resumed => {
   if (!resumed || !Array.isArray(resumed.data.tracks)) return;
   setSeed(resumed.seed); setRecommendations(resumed.data.tracks); setShared(null); setRound(0); setFocus(0); setMeta(resumed.data);
  }).catch(e => setError(e instanceof Error && e.message ? e.message : format(lang, "error.round")));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- resume once on load
 }, []);

 const isSaved = useCallback((track: Track) => saved.some(s => trackKey(s) === trackKey(track)), [saved]);
 const save = (track: Track) => {
  const exists = isSaved(track);
  setSaved(prev => exists ? prev.filter(x => trackKey(x) !== trackKey(track)) : [withoutPreview(track), ...prev]);
  if (!exists) setDismissed(prev => prev.filter(x => trackKey(x) !== trackKey(track)));
  setToast(exists ? t("toast.unsaved") : t("toast.saved"));
 };
 const dismiss = (track: Track, reason: DismissReason) => {
  setDismissed(prev => [{ ...withoutPreview(track), dismissReason: reason }, ...prev.filter(x => trackKey(x) !== trackKey(track))].slice(0, 120));
  setSaved(prev => prev.filter(x => trackKey(x) !== trackKey(track)));
  const sameArtist = (x: Track) => reason === "artist" && x.artist.toLowerCase() === track.artist.toLowerCase();
  setRecommendations(prev => prev?.filter(x => trackKey(x) !== trackKey(track) && !sameArtist(x)) ?? null);
  setFocus(0);
  setToast(t("toast.dismissed"));
 };

 const scrollTo = (selector: string, block: ScrollLogicalPosition = "start") => requestAnimationFrame(() => document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block }));
 function choose(track: Track) {
  job.cancel(); searchAbort.current?.abort(); setSearching(false);
  setSeed(track); setResults(null); setRecommendations(null); setMeta(null); setRound(0); setError(""); setView("discover");
  scrollTo(".console", "center");
 }
 async function search(q = query) {
  if (previewOnly) { setError(t("error.preview")); return; }
  if (q.trim().length < 2) { setError(t("error.short")); return; }
  searchAbort.current?.abort();
  const c = new AbortController(); searchAbort.current = c;
  setSearching(true); setError(""); setQuery(q);
  try { const tracks = await searchTracks(q, c.signal); if (!c.signal.aborted) setResults(tracks); }
  catch (e) { if (!c.signal.aborted) setError(e instanceof Error && e.message ? e.message : t("error.search")); }
  finally { if (!c.signal.aborted) setSearching(false); }
 }
 async function recommend(excludePrevious = false) {
  if (!seed) return;
  const issue = modelSettingsError(modelSettings);
  if (issue) { setError(t(issue)); setModelOpen(true); return; }
  if (previewOnly) { setError(t("error.noService")); return; }
  if (modelSettings.mode !== "site" && library.byokAvailable === false) { setError(t("error.noByok")); setModelOpen(true); return; }
  setError("");
  const snapshot = modelRequestSnapshot(modelSettings);
  let turnstileToken: string | undefined;
  if (library.turnstileSiteKey) {
   try { turnstileToken = await getTurnstileToken(library.turnstileSiteKey, lang); } catch { setError(t("error.turnstile")); return; }
  }
  const excluded = [...new Set([...dismissed, ...saved, ...(excludePrevious ? recommendations || [] : [])].map(trackKey))].slice(0, 150);
  const avoidArtists = [...new Set(dismissed.filter(d => d.dismissReason === "artist").map(d => d.artist))].slice(0, 30);
  const reasonLabel = (d: DismissedTrack) => d.dismissReason ? `（${format("zh", `dismiss.${d.dismissReason}`)}）` : "";
  try {
   const data = await job.run({
    seed, direction, notes, excluded, avoidArtists, headers: snapshot.headers, turnstileToken,
    ...(snapshot.modelConfig ? { modelConfig: snapshot.modelConfig } : {}),
    feedback: { liked: saved.slice(0, 8).map(x => `${x.artist} — ${x.title}`), disliked: dismissed.slice(0, 8).map(x => `${x.artist} — ${x.title}${reasonLabel(x)}`) },
   });
   if (!data) return;
   if (!Array.isArray(data.tracks)) throw new Error(t("error.incomplete"));
   setRecommendations(data.tracks); setShared(null); setRound(0); setFocus(0); setMeta(data);
   scrollTo(".hero");
  } catch (e) { setError(e instanceof Error && e.message ? e.message : t("error.round")); }
 }
 function next() {
  if (recommendations && (round + 1) * 7 < recommendations.length) { setRound(round + 1); setFocus(0); scrollTo(".hero"); }
  else void recommend(true);
 }
 async function share(tracks: Track[]) {
  const url = shareUrl(tracks, seed);
  try {
   if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: "余音 Aftertone", url }); return; }
   await navigator.clipboard.writeText(url); setToast(t("toast.copied"));
  } catch { /* The user closed the share sheet. */ }
 }
 async function importBackup(file: File) {
  try {
   const data = parseBackup(await file.text());
   setSaved(prev => mergeTracks(prev, data.saved)); setDismissed(prev => mergeTracks(prev, data.dismissed).slice(0, 120));
   setToast(t("toast.imported", { n: data.saved.length }));
  } catch { setToast(t("toast.importFailed")); }
 }
 function openSearch() {
  setView("discover");
  requestAnimationFrame(() => { searchInput.current?.focus({ preventScroll: true }); document.querySelector(".console")?.scrollIntoView({ behavior: "smooth", block: "center" }); });
 }

 const roundMeta = meta?.meta;
 const eyebrow = recommendations ? t("hero.yours", { n: pad(Math.min(focus, visible.length - 1) + 1) }) : shared ? t("hero.shared") : t("hero.featured");
 const railTitle = recommendations ? t("rail.yours") : shared ? t("rail.shared") : t("rail.featured");
 const modelChip = modelSettingsSummary(modelSettings) ?? (modelSettings.mode === "jev" ? t("model.summary.jev") : t("model.chip"));

 return <div className={`app ${player.current ? "has-player" : ""}`} style={{ "--glow-rgb": glow } as React.CSSProperties}>
  <div className="ambient" aria-hidden="true">{ambientCover && <img key={ambientCover} src={ambientCover} alt="" />}</div>
  <Header view={view} onView={v => { setView(v); window.scrollTo({ top: 0 }); }} savedCount={saved.length} onSearch={openSearch} onSettings={() => setModelOpen(true)} onAbout={() => setAboutOpen(true)} />

  <main>
   {view === "discover" ? <>
    {focused ? <Hero track={focused} eyebrow={eyebrow} index={Math.min(focus, visible.length - 1)} total={visible.length} onDot={setFocus}
     playing={player.isActive(focused) && player.playing} loading={player.loading === trackKey(focused)} onPlay={() => player.play(focused)}
     onStart={() => choose(focused)} startLabel={recommendations ? t("hero.continue") : t("hero.start")}
     saved={isSaved(focused)} onSave={() => save(focused)} onDismiss={reason => dismiss(focused, reason)} canDismiss={recommendations !== null} />
     : <section className="hero hero-empty"><div className="hero-content"><p className="eyebrow"><i />{railTitle}</p><h1 className="hero-title">{t("rail.empty.title")}</h1></div></section>}

    <div className="page">
     <DiscoveryConsole ref={searchInput} query={query} onQuery={setQuery} onSearch={q => void search(q)} searching={searching}
      results={results} onCloseResults={() => setResults(null)} onPreview={player.play} onChoose={choose}
      seed={seed} onClearSeed={() => { job.cancel(); setSeed(null); setRecommendations(null); setMeta(null); }}
      direction={direction} onDirection={setDirection} notes={notes} onNotes={setNotes}
      busy={job.busy} progress={job.progress} serverDriven={job.serverDriven} onFind={() => void recommend()} onCancel={job.cancel} previewOnly={previewOnly} />
     <button className="model-chip" onClick={() => setModelOpen(true)}>{modelChip}<ArrowRight size={13} /></button>

     {error && <div className="alert" role="alert"><Info size={18} /><span>{error}</span><button className="icon-btn" onClick={() => setError("")} aria-label={t("error.close")}><X size={16} /></button></div>}

     <section className="rail" aria-label={railTitle}>
      <RailHead title={railTitle} note={recommendations ? `${t("rail.group", { n: pad(round + 1) })} · ${t("rail.from", { n: (roundMeta?.candidateCount ?? job.progress?.totalCount ?? 0).toLocaleString() })}` : undefined}>
       {visible.length > 0 && <button className="link-btn" onClick={() => void share(visible)}><Share2 size={14} />{t("rail.share")}</button>}
       {recommendations && <button className="link-btn" onClick={next} disabled={job.busy}>{(round + 1) * 7 < recommendations.length ? t("rail.more") : t("rail.newRound")}<ArrowRight size={14} /></button>}
      </RailHead>
      {visible.length ? <RecordRail tracks={visible} focus={focus} onFocus={setFocus} isPlaying={tr => player.isActive(tr) && player.playing} loadingKey={player.loading}
       onPlay={tr => player.play(tr)} isSaved={isSaved} onSave={save} showReason={recommendations !== null} busy={job.busy} />
       : <div className="empty"><Disc3 size={34} /><h3>{t("rail.empty.title")}</h3><p>{t("rail.empty.body")}</p><button className="btn btn-accent" onClick={() => { setRecommendations(null); setNotes(""); }}>{t("rail.empty.reset")}<ArrowRight size={16} /></button></div>}
      {recommendations && roundMeta && <details className="round-details"><summary>{t("rail.details")}</summary>
       <p>{t("rail.meta", { scored: (roundMeta.candidateCount ?? 0).toLocaleString(), pool: (roundMeta.recall?.prerankPool ?? roundMeta.candidateCount ?? 0).toLocaleString(), sec: ((roundMeta.wallMs || roundMeta.elapsedMs || 0) / 1000).toFixed(1), model: roundMeta.model || "Jev" })}</p>
      </details>}
     </section>

     {focused && <section className="rail">
      <RailHead title={t("rail.listen")} note={focused.title} />
      <ListenTiles track={focused} />
      <p className="rail-foot">{t("rail.listenNote")}</p>
     </section>}

     {saved.length > 0 && <section className="rail">
      <RailHead title={t("rail.savedTitle")} note={t("rail.savedCount", { n: saved.length })}>
       <button className="link-btn" onClick={() => { setView("saved"); window.scrollTo({ top: 0 }); }}>{t("rail.viewAll")}<ArrowRight size={14} /></button>
      </RailHead>
      <RecordRail tracks={saved.slice(0, 7)} isPlaying={tr => player.isActive(tr) && player.playing} loadingKey={player.loading} onPlay={tr => player.play(tr)} onSelect={choose} isSaved={isSaved} onSave={save} numbered={false} />
     </section>}
    </div>
   </> : <div className="page page-saved">
    <SavedView saved={saved} dismissedCount={dismissed.length} onPlay={player.play} onChoose={choose} onUnsave={save}
     onCsv={() => { download("aftertone-saved.csv", toCsv(saved), "text/csv;charset=utf-8"); setToast(t("toast.exported")); }}
     onText={() => { void navigator.clipboard.writeText(toText(saved)).then(() => setToast(t("toast.textCopied", { n: saved.length }))); }}
     onBackup={() => { download(`aftertone-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(toBackup(saved, dismissed), null, 1), "application/json"); setToast(t("toast.exported")); }}
     onImport={file => void importBackup(file)} onShare={() => void share(saved.slice(0, 7))}
     onResetDismissed={() => { setDismissed([]); setToast(t("toast.resetDismissed")); }} onDiscover={() => setView("discover")} />
   </div>}
  </main>

  <Footer onAbout={() => setAboutOpen(true)} />
  <ModelSettingsDialog settings={modelSettings} open={modelOpen} onOpenChange={setModelOpen} busy={job.busy} previewOnly={previewOnly} byokAvailable={library.byokAvailable ?? null}
   onApply={settings => { setModelSettings(settings); setError(""); setToast(t("toast.applied", { model: modelSettingsSummary(settings) ?? (settings.mode === "jev" ? t("model.summary.jev") : t("model.summary.site")) })); }} />
  <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} library={library} />

  <audio {...player.audioProps} />
  {player.current && <PlayerBar track={player.current} playing={player.playing} ended={player.ended} loading={!!player.loading} position={player.position} duration={player.duration}
   volume={player.volume} onToggle={() => player.play(player.current!)} onSeek={player.seek} onVolume={player.setVolume} saved={isSaved(player.current)} onSave={() => save(player.current!)} />}
  {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
 </div>;
}
