export type Track = {
  id: string; provider: "deezer" | "itunes"; country?: string;
  title: string; artist: string; artistId?: string; album: string; albumId?: string;
  image: string; url: string; duration: number; preview?: string;
  genre?: string; artistGenres?: string[]; year?: string; bpm?: number; source?: string;
  isrc?: string; previewAvailable?: boolean;
  collectionGroups?: string[];
  reason?: string; lane?: string; score?: number;
};
export const trackKey = (t: Pick<Track,"provider"|"id">) => `${t.provider}:${t.id}`;
export const providerName = (t: Track) => t.provider === "itunes" ? "Apple Music" : "Deezer";
export const seconds = (n: number) => `${Math.floor((n || 0)/60)}:${String(Math.floor((n || 0)%60)).padStart(2,"0")}`;
/** Same cover at another size: Deezer CDN and iTunes artwork URLs encode the size in the path. */
export function coverAt(url: string, size: number): string {
  if (/^https:\/\/cdn-images\.dzcdn\.net\/images\/cover\/[0-9a-f]{32}\/\d+x\d+-/.test(url)) return url.replace(/\/\d+x\d+-/, `/${size}x${size}-`);
  if (/^https:\/\/is\d-ssl\.mzstatic\.com\//.test(url)) return url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);
  return url;
}
