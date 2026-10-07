import { useEffect, useState } from "react";
import libraryManifest from "@/data/library-manifest.json";
import { getJson, previewOnly, type LibraryInfo } from "../lib/api";

const fallback: LibraryInfo = { tracks: libraryManifest.tracks, artists: libraryManifest.artists, previewable: libraryManifest.previewable, candidateLimit: 600, recallPool: 5000 };

/** Catalog size, limits and service capabilities as reported by the API (bundled numbers until it answers). */
export function useLibrary() {
 const [library, setLibrary] = useState<LibraryInfo>(fallback);
 const [loaded, setLoaded] = useState(false);
 useEffect(() => {
  if (previewOnly) return;
  const controller = new AbortController();
  getJson<LibraryInfo>("/api/library", controller.signal)
   .then(info => { if (typeof info?.tracks === "number") { setLibrary({ ...fallback, ...info }); setLoaded(true); } })
   .catch(() => undefined);
  return () => controller.abort();
 }, []);
 return { library, loaded };
}
