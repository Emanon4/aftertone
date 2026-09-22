import type { Track } from "./music";

export type ListeningLink = {
  id: "deezer" | "spotify" | "apple-music" | "netease" | "qq-music" | "youtube-music";
  label: string;
  url: string;
  kind: "track" | "search";
};

type ListeningTrack = Pick<Track, "id" | "provider" | "title" | "artist" | "url" | "country">;

function exactSourceUrl(track: ListeningTrack): string | undefined {
  if (!track.url || /[\u0000-\u0020\u007f]/.test(track.url)) return;

  let url: URL;
  try {
    url = new URL(track.url);
  } catch {
    return;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return;

  if (track.provider === "deezer") {
    if (url.hostname !== "www.deezer.com" && url.hostname !== "deezer.com") return;
    const recording = url.pathname.match(/^\/(?:[a-z]{2}\/)?track\/(\d+)\/?$/i);
    return recording?.[1] === track.id ? track.url : undefined;
  }

  if (url.hostname !== "music.apple.com" && url.hostname !== "itunes.apple.com") return;
  const song = url.pathname.match(/^\/[a-z]{2}\/song\/(?:[^/]+\/)?(?:id)?(\d+)\/?$/i);
  const selectedTracks = url.searchParams.getAll("i");
  if (song) {
    return song[1] === track.id && selectedTracks.every((id) => id === track.id)
      ? track.url
      : undefined;
  }

  const isAlbum = /^\/[a-z]{2}\/album\/(?:[^/]+\/)?(?:id)?\d+\/?$/i.test(url.pathname);
  const isLegacyAlbum = url.hostname === "itunes.apple.com"
    && url.pathname === "/WebObjects/MZStore.woa/wa/viewAlbum";
  // An album URL identifies a recording only when it selects that track explicitly.
  return (isAlbum || isLegacyAlbum) && selectedTracks.length === 1 && selectedTracks[0] === track.id
    ? track.url
    : undefined;
}

export function getListeningLinks(track: ListeningTrack): ListeningLink[] {
  const query = encodeURIComponent([track.title.trim(), track.artist.trim()].filter(Boolean).join(" "));
  const country = /^[a-z]{2}$/i.test(track.country ?? "") ? track.country!.toLowerCase() : "us";
  const links: ListeningLink[] = [
    { id: "deezer", label: "Deezer", url: `https://www.deezer.com/search/${query}`, kind: "search" },
    { id: "spotify", label: "Spotify", url: `https://open.spotify.com/search/${query}`, kind: "search" },
    { id: "apple-music", label: "Apple Music", url: `https://music.apple.com/${country}/search?term=${query}`, kind: "search" },
    { id: "netease", label: "网易云音乐", url: `https://music.163.com/#/search/m/?s=${query}&type=1`, kind: "search" },
    { id: "qq-music", label: "QQ音乐", url: `https://y.qq.com/n/ryqq/search?w=${query}&t=song`, kind: "search" },
    { id: "youtube-music", label: "YouTube Music", url: `https://music.youtube.com/search?q=${query}`, kind: "search" },
  ];
  const sourceId = track.provider === "deezer" ? "deezer" : "apple-music";
  const source = links.find((link) => link.id === sourceId)!;
  const exactUrl = exactSourceUrl(track);
  const preferred: ListeningLink = exactUrl ? { ...source, url: exactUrl, kind: "track" } : source;
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  return [preferred, ...links].filter((link) => {
    if (seenIds.has(link.id) || seenUrls.has(link.url)) return false;
    seenIds.add(link.id);
    seenUrls.add(link.url);
    return true;
  });
}
