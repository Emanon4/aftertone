import { ArrowRight, Heart, LoaderCircle, Pause, Play } from "lucide-react";
import { coverAt, trackKey, type Track } from "@/lib/music";
import { useI18n } from "../lib/i18n";
import { DismissMenu } from "./DismissMenu";
import { SongLinks } from "./SongLinks";
import type { DismissReason } from "../lib/storage";


export function Hero({ track, eyebrow, index, total, onDot, playing, loading, onPlay, onStart, startLabel, saved, onSave, onDismiss, canDismiss }: {
 track: Track; eyebrow: string; index: number; total: number; onDot: (i: number) => void;
 playing: boolean; loading: boolean; onPlay: () => void; onStart: () => void; startLabel: string;
 saved: boolean; onSave: () => void; onDismiss: (reason: DismissReason) => void; canDismiss: boolean;
}) {
 const { t } = useI18n();
 const meta = [track.artist, track.album && track.album !== track.title ? track.album : "", track.year || "", t("hero.previewLength")].filter(Boolean);
 return <section className="hero" aria-live="polite">
  <div className="hero-frame"><div className="hero-art" key={trackKey(track)} style={{ backgroundImage: track.image ? `url(${coverAt(track.image, 1000)})` : undefined }} role="img" aria-label={`${track.album || track.title}`} /></div>
  <div className="hero-shade" />
  <div className="hero-content">
   <p className="eyebrow"><i />{eyebrow}</p>
   <h1 className="hero-title">{track.title}</h1>
   <p className="hero-meta">{meta.map((m, i) => <span key={i}>{m}</span>)}</p>
   <p className="hero-tagline">{track.reason || t("hero.tagline")}</p>
   <div className="hero-actions">
    <button className="btn btn-white" onClick={onPlay} disabled={loading}>
     {loading ? <LoaderCircle className="spin" size={18} /> : playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
     {playing ? t("hero.pause") : t("hero.play")}
    </button>
    <button className="btn btn-accent" onClick={onStart}>{startLabel}<ArrowRight size={18} /></button>
    <div className="glass-group glass">
     <button className={saved ? "is-on" : ""} onClick={onSave} aria-pressed={saved} aria-label={`${saved ? t("hero.unsave") : t("hero.save")} ${track.title}`}><Heart size={19} fill={saved ? "currentColor" : "none"} /></button>
     <SongLinks track={track} iconOnly />
     {canDismiss && <DismissMenu track={track} onPick={onDismiss} />}
    </div>
   </div>
  </div>
  {total > 1 && <div className="hero-dots" role="group">
   {Array.from({ length: total }, (_, i) => <button key={i} className={i === index ? "on" : ""} aria-label={t("hero.dot", { n: i + 1 })} aria-pressed={i === index} onClick={() => onDot(i)} />)}
  </div>}
 </section>;
}
