import { trackKey, type Track } from "@/lib/music";

export type DismissReason = "artist" | "style" | "energy-high" | "energy-low" | "era" | "song";
export type DismissedTrack = Track & { dismissReason?: DismissReason };
export const DISMISS_REASONS: DismissReason[] = ["artist", "style", "energy-high", "energy-low", "era", "song"];

export function readStored<T>(key: string, fallback: T): T {
 try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}
/** Preview URLs are short-lived signed links: never persist them. */
export const withoutPreview = <T extends Track>(t: T): T => { const copy = { ...t }; delete copy.preview; return copy; };
export function writeStored(key: string, value: unknown): boolean {
 try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

const csvCell = (value: unknown) => { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
export function toCsv(tracks: Track[]): string {
 const rows = [["title", "artist", "album", "year", "provider", "id", "url"], ...tracks.map(t => [t.title, t.artist, t.album, t.year || "", t.provider, t.id, t.url])];
 return "﻿" + rows.map(row => row.map(csvCell).join(",")).join("\n");
}
export const toText = (tracks: Track[]) => tracks.map((t, i) => `${String(i + 1).padStart(2, "0")}. ${t.artist} — ${t.title}`).join("\n");

export type Backup = { app: "aftertone"; version: 1; exportedAt: string; saved: Track[]; dismissed: DismissedTrack[] };
export const toBackup = (saved: Track[], dismissed: DismissedTrack[]): Backup => ({ app: "aftertone", version: 1, exportedAt: new Date().toISOString(), saved: saved.map(withoutPreview), dismissed: dismissed.map(withoutPreview) });

const isTrack = (value: unknown): value is Track => {
 const t = value as Track;
 return Boolean(t) && typeof t === "object" && typeof t.id === "string" && /^\d{1,18}$/.test(t.id) && (t.provider === "deezer" || t.provider === "itunes")
  && typeof t.title === "string" && typeof t.artist === "string";
};
/** Only well-formed tracks survive an import; anything else in the file is ignored. */
export function parseBackup(text: string): { saved: Track[]; dismissed: DismissedTrack[] } {
 const data = JSON.parse(text) as Partial<Backup>;
 if (data?.app !== "aftertone" || !Array.isArray(data.saved)) throw new Error("not an aftertone backup");
 const clean = (t: Track): Track => ({ id: t.id, provider: t.provider, title: t.title.slice(0, 300), artist: t.artist.slice(0, 300), album: String(t.album || "").slice(0, 300),
  image: /^https:\/\//.test(t.image || "") ? t.image : "", url: /^https:\/\//.test(t.url || "") ? t.url : "", duration: Number(t.duration) || 0, year: typeof t.year === "string" ? t.year.slice(0, 4) : undefined });
 const reasons = new Set<string>(DISMISS_REASONS);
 return {
  saved: data.saved.filter(isTrack).slice(0, 2000).map(clean),
  dismissed: (Array.isArray(data.dismissed) ? data.dismissed : []).filter(isTrack).slice(0, 120)
   .map((t: DismissedTrack) => ({ ...clean(t), ...(reasons.has(String(t.dismissReason)) ? { dismissReason: t.dismissReason } : {}) })),
 };
}
export function mergeTracks<T extends Track>(current: T[], incoming: T[]): T[] {
 const seen = new Set(current.map(trackKey));
 return [...current, ...incoming.filter(t => !seen.has(trackKey(t)) && seen.add(trackKey(t)))];
}
export function download(name: string, content: string, type: string) {
 const url = URL.createObjectURL(new Blob([content], { type }));
 const a = document.createElement("a"); a.href = url; a.download = name; a.click();
 setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Share links carry only provider IDs — no titles, notes or listening history. */
export function shareUrl(tracks: Track[], seed?: Track | null): string {
 const url = new URL(location.href); url.hash = "";
 const params = new URLSearchParams({ share: tracks.slice(0, 7).map(trackKey).join(",") });
 if (seed) params.set("from", trackKey(seed));
 return `${url.toString()}#${params.toString()}`;
}
export function readShare(hash: string): { tracks: Pick<Track, "id" | "provider">[]; from?: Pick<Track, "id" | "provider"> } | null {
 const params = new URLSearchParams(hash.replace(/^#/, ""));
 const parse = (value: string) => { const m = value.match(/^(deezer|itunes):(\d{1,18})$/); return m ? { provider: m[1] as Track["provider"], id: m[2] } : null; };
 const tracks = (params.get("share") || "").split(",").map(parse).filter((x): x is NonNullable<typeof x> => Boolean(x)).slice(0, 7);
 if (!tracks.length) return null;
 const from = parse(params.get("from") || "");
 return { tracks, ...(from ? { from } : {}) };
}
