import { Heart, LoaderCircle, Pause, Play, Volume2 } from "lucide-react";
import { seconds, type Track } from "@/lib/music";
import { useI18n } from "../lib/i18n";
import { Range } from "./primitives";
import { SongLinks } from "./SongLinks";

export function PlayerBar({ track, playing, ended, loading, position, duration, volume, onToggle, onSeek, onVolume, saved, onSave }: {
 track: Track; playing: boolean; ended: boolean; loading: boolean; position: number; duration: number | null; volume: number;
 onToggle: () => void; onSeek: (v: number) => void; onVolume: (v: number) => void; saved: boolean; onSave: () => void;
}) {
 const { t } = useI18n();
 const total = duration || 30;
 return <div className="player glass" role="region" aria-label={t("player.label", { sec: Math.round(total) })}>
  <div className="player-track">
   {track.image ? <img className={playing ? "is-spinning" : ""} src={track.image} alt="" /> : <span className="player-disc" />}
   <div><strong>{track.title}</strong><span>{track.artist} · {ended ? t("player.ended") : t("player.label", { sec: Math.round(total) })}</span></div>
  </div>
  <div className="player-transport">
   <button className="player-toggle" onClick={onToggle} disabled={loading} aria-label={playing ? t("player.pause") : ended ? t("player.replay") : t("player.play")}>
    {loading ? <LoaderCircle className="spin" size={18} /> : playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
   </button>
   <span className="time">{seconds(position)}</span>
   <Range className="player-progress" label={t("player.progress")} value={Math.min(position, total)} max={total} step={0.1} onChange={onSeek} />
   <span className="time">{seconds(total)}</span>
  </div>
  <div className="player-extras">
   <div className="player-volume"><Volume2 size={16} aria-hidden="true" /><Range label={t("player.volume")} value={volume} max={1} step={0.05} onChange={onVolume} /></div>
   <button className={`btn btn-soft ${saved ? "is-on" : ""}`} onClick={onSave} aria-pressed={saved}><Heart size={15} fill={saved ? "currentColor" : "none"} /><span>{saved ? t("hero.unsave") : t("hero.save")}</span></button>
   <SongLinks track={track} compact />
   {track.provider === "itunes" && <small className="attribution">Preview courtesy of iTunes</small>}
  </div>
 </div>;
}
