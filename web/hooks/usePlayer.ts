import { useCallback, useRef, useState } from "react";
import { trackKey, type Track } from "@/lib/music";
import { lookupTrack, previewOnly } from "../lib/api";

export type PlayerErrors = { noPreview: string; playAgain: string; audio: string };

/** Preview playback. Preview URLs are signed and short-lived, so each play resolves a fresh one. */
export function usePlayer(onError: (message: string) => void, messages: PlayerErrors) {
 const audioRef = useRef<HTMLAudioElement | null>(null);
 const version = useRef(0);
 const [current, setCurrent] = useState<Track | null>(null);
 const [playing, setPlaying] = useState(false);
 const [ended, setEnded] = useState(false);
 const [loading, setLoading] = useState("");
 const [position, setPosition] = useState(0);
 const [duration, setDuration] = useState<number | null>(null);
 const [volume, setVolumeState] = useState(0.7);

 const play = useCallback(async (t: Track) => {
  if (previewOnly) { window.open(t.url, "_blank", "noopener,noreferrer"); return; }
  const audio = audioRef.current; if (!audio) return;
  if (current && trackKey(current) === trackKey(t) && audio.src) {
   if (!audio.paused) { audio.pause(); return; }
   if (audio.ended) { audio.currentTime = 0; setPosition(0); }
   setEnded(false);
   try { await audio.play(); } catch { onError(messages.playAgain); }
   return;
  }
  const mine = ++version.current;
  setEnded(false); audio.pause(); audio.removeAttribute("src"); audio.load();
  setCurrent(t); setPosition(0); setDuration(null); setLoading(trackKey(t));
  try {
   const fresh = await lookupTrack(t); if (mine !== version.current) return;
   if (!fresh.preview) throw new Error(messages.noPreview);
   setCurrent({ ...t, ...fresh }); audio.src = fresh.preview; audio.volume = volume; await audio.play();
  } catch (e) { if (mine === version.current) onError(e instanceof Error && e.message ? e.message : messages.audio); }
  finally { if (mine === version.current) setLoading(""); }
 }, [current, volume, onError, messages]);

 const seek = useCallback((value: number) => {
  const audio = audioRef.current;
  if (audio && audio.readyState > 0) { audio.currentTime = value; setPosition(value); setEnded(false); }
 }, []);
 const setVolume = useCallback((value: number) => { setVolumeState(value); if (audioRef.current) audioRef.current.volume = value; }, []);

 const audioProps = {
  ref: audioRef, preload: "none" as const,
  onPlay: () => { setPlaying(true); setEnded(false); },
  onPause: () => setPlaying(false),
  onEnded: () => { setPlaying(false); setEnded(true); },
  onTimeUpdate: (e: React.SyntheticEvent<HTMLAudioElement>) => setPosition(e.currentTarget.currentTime),
  onLoadedMetadata: (e: React.SyntheticEvent<HTMLAudioElement>) => { const d = e.currentTarget.duration; setDuration(Number.isFinite(d) && d > 0 ? d : null); },
  onError: () => { if (audioRef.current?.getAttribute("src")) { setPlaying(false); onError(messages.audio); } },
 };
 const isActive = (t: Track) => Boolean(current && trackKey(current) === trackKey(t));
 return { current, playing, ended, loading, position, duration, volume, play, seek, setVolume, audioProps, isActive };
}
