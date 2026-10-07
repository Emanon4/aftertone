import { useRef } from "react";
import { ArrowRight, Copy, Download, FileJson, Heart, Play, RotateCcw, Share2, Upload } from "lucide-react";
import { coverAt, trackKey, type Track } from "@/lib/music";
import { useI18n } from "../lib/i18n";

export function SavedView({ saved, dismissedCount, onPlay, onChoose, onUnsave, onCsv, onText, onBackup, onImport, onShare, onResetDismissed, onDiscover }: {
 saved: Track[]; dismissedCount: number; onPlay: (t: Track) => void; onChoose: (t: Track) => void; onUnsave: (t: Track) => void;
 onCsv: () => void; onText: () => void; onBackup: () => void; onImport: (file: File) => void; onShare: () => void; onResetDismissed: () => void; onDiscover: () => void;
}) {
 const { t } = useI18n();
 const file = useRef<HTMLInputElement | null>(null);
 return <section className="saved">
  <div className="saved-head">
   <h1>{t("saved.title")}<span>{String(saved.length).padStart(2, "0")}</span></h1>
   <div className="saved-tools">
    {saved.length > 0 && <>
     <button className="btn btn-soft" onClick={onShare}><Share2 size={15} />{t("saved.share")}</button>
     <button className="btn btn-soft" onClick={onText}><Copy size={15} />{t("saved.text")}</button>
     <button className="btn btn-soft" onClick={onCsv}><Download size={15} />{t("saved.csv")}</button>
     <button className="btn btn-soft" onClick={onBackup}><FileJson size={15} />{t("saved.backup")}</button>
    </>}
    <button className="btn btn-soft" onClick={() => file.current?.click()}><Upload size={15} />{t("saved.import")}</button>
    <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
   </div>
   <p className="saved-note">{t("saved.note")}{dismissedCount > 0 && <button className="link-btn" onClick={onResetDismissed}><RotateCcw size={13} />{t("saved.resetDismissed", { n: dismissedCount })}</button>}</p>
  </div>
  {saved.length ? <ol className="saved-grid">
   {saved.map((track, i) => <li key={trackKey(track)} className="saved-card glass">
    <button className="saved-cover" onClick={() => onPlay(track)} aria-label={t("card.preview", { title: track.title })}>{track.image && <img src={coverAt(track.image, 250)} alt="" loading="lazy" />}<span><Play size={16} fill="currentColor" /></span></button>
    <div className="saved-info"><span className="saved-num">{String(i + 1).padStart(2, "0")}</span><strong>{track.title}</strong><small>{track.artist}{track.album ? ` · ${track.album}` : ""}</small></div>
    <div className="saved-actions">
     <button className="btn btn-soft" onClick={() => onChoose(track)}>{t("saved.follow")}<ArrowRight size={14} /></button>
     <button className="icon-btn is-on" onClick={() => onUnsave(track)} aria-label={`${t("hero.unsave")} ${track.title}`}><Heart size={17} fill="currentColor" /></button>
    </div>
   </li>)}
  </ol> : <div className="empty"><Heart size={34} /><h3>{t("saved.empty.title")}</h3><p>{t("saved.empty.body")}</p><button className="btn btn-accent" onClick={onDiscover}>{t("saved.empty.cta")}<ArrowRight size={16} /></button></div>}
 </section>;
}
