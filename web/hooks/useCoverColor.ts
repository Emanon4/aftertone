import { useEffect, useState } from "react";

const cache = new Map<string, string>();
const FALLBACK = "255, 92, 157";

/**
 * Samples a cover's dominant, reasonably saturated colour so the page glow follows the music,
 * like a streaming app's ambient backdrop. Falls back to the brand rose if the image can't be read.
 */
export function useCoverColor(url: string | undefined): string {
 const [sampled, setSampled] = useState<{ url: string; color: string } | null>(null);
 useEffect(() => {
  if (!url || cache.has(url)) return;
  let cancelled = false;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.onload = () => {
   try {
    const size = 24, canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let r = 0, g = 0, b = 0, weight = 0;
    for (let i = 0; i < data.length; i += 4) {
     const max = Math.max(data[i], data[i + 1], data[i + 2]), min = Math.min(data[i], data[i + 1], data[i + 2]);
     // Weight saturated mid-tones; ignore near-black and near-white borders.
     const w = (max - min) / 255 * (max > 30 && min < 235 ? 1 : 0.05) + 0.02;
     r += data[i] * w; g += data[i + 1] * w; b += data[i + 2] * w; weight += w;
    }
    const color = `${Math.round(r / weight)}, ${Math.round(g / weight)}, ${Math.round(b / weight)}`;
    cache.set(url, color);
    if (!cancelled) setSampled({ url, color });
   } catch { /* Tainted canvas: keep the fallback colour. */ }
  };
  img.src = url;
  return () => { cancelled = true; };
 }, [url]);
 if (!url) return FALLBACK;
 return cache.get(url) ?? (sampled?.url === url ? sampled.color : FALLBACK);
}
