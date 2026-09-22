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
