import type { ReactNode } from "react";
import { AudioLines, Heart, LoaderCircle, Pause, Play } from "lucide-react";
import { coverAt, trackKey, type Track } from "@/lib/music";
import { useI18n } from "../lib/i18n";

export function RailHead({ title, note, children }: { title: ReactNode; note?: ReactNode; children?: ReactNode }) {
 return <div className="rail-head"><h2>{title}{note && <em>{note}</em>}</h2>{children && <div className="rail-actions">{children}</div>}</div>;
}

/** Horizontal cover rail: scroll-snaps on phones, a seven-up grid on wide screens. */
export function RecordRail({ tracks, focus, onFocus, onSelect, isPlaying, loadingKey, onPlay, isSaved, onSave, numbered = true, showReason = false, busy = false }: {
 tracks: Track[]; focus?: number; onFocus?: (i: number) => void; onSelect?: (track: Track) => void; isPlaying: (t: Track) => boolean; loadingKey: string;
 onPlay: (t: Track, i: number) => void; isSaved: (t: Track) => boolean; onSave: (t: Track) => void; numbered?: boolean; showReason?: boolean; busy?: boolean;
}) {
 const { t } = useI18n();
 return <div className={`rail-track ${busy ? "is-busy" : ""}`}>
  {tracks.map((track, i) => {
   const key = trackKey(track), playing = isPlaying(track), saved = isSaved(track);
   return <article key={key} className={`record ${focus === i ? "is-focus" : ""} ${playing ? "is-playing" : ""}`} style={{ "--i": i } as React.CSSProperties}>
    <div className="cover">
     <button className="cover-hit" onClick={() => { onFocus?.(i); onPlay(track, i); }} aria-label={playing ? t("card.pause", { title: track.title }) : t("card.preview", { title: track.title })} disabled={loadingKey === key}>
      {track.image ? <img src={coverAt(track.image, 500)} srcSet={`${coverAt(track.image, 250)} 250w, ${coverAt(track.image, 500)} 500w`} sizes="(max-width: 760px) 44vw, (max-width: 1180px) 22vw, 14vw" alt="" loading={i < 4 ? "eager" : "lazy"} decoding="async" /> : <span className="cover-empty" />}
      <span className="cover-play">{loadingKey === key ? <LoaderCircle className="spin" size={18} /> : playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</span>
     </button>
     {numbered && <span className="cover-num">{String(i + 1).padStart(2, "0")}</span>}
     <button className={`cover-heart ${saved ? "is-on" : ""}`} onClick={() => onSave(track)} aria-pressed={saved} aria-label={`${saved ? t("hero.unsave") : t("hero.save")} ${track.title}`}><Heart size={15} fill={saved ? "currentColor" : "none"} /></button>
     {playing && <span className="cover-live"><AudioLines size={14} /></span>}
    </div>
    <button className="record-text" onClick={() => onSelect ? onSelect(track) : onFocus?.(i)}>
     <strong>{track.title}</strong><small>{track.artist}</small>
    </button>
    {showReason && track.reason && <span className="record-reason" title={track.reason}>{track.reason.split(" · ")[0]}</span>}
   </article>;
  })}
 </div>;
}
