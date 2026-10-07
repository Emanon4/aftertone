import { ArrowUpRight, Headphones } from "lucide-react";
import { getListeningLinks, type ListeningLink } from "@/lib/listening-links";
import type { Track } from "@/lib/music";
import { useI18n } from "../lib/i18n";
import { Sheet, SheetClose } from "./primitives";

const BRAND: Record<ListeningLink["id"], { color: string; mark: string }> = {
 deezer: { color: "#a238ff", mark: "D" }, spotify: { color: "#1db954", mark: "S" }, "apple-music": { color: "#fa2d48", mark: "♪" },
 netease: { color: "#e60026", mark: "网" }, "qq-music": { color: "#31c27c", mark: "Q" }, "youtube-music": { color: "#ff0000", mark: "▶" },
};

// Extra props come from Radix Slot (SheetClose asChild) and must reach the anchor.
function Tile({ link, ...rest }: { link: ListeningLink } & React.ComponentProps<"a">) {
 const { t } = useI18n();
 const brand = BRAND[link.id];
 return <a {...rest} className="listen-tile glass" href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`${link.label}：${link.kind === "track" ? t("links.direct") : t("links.search")}`}>
  <i style={{ background: brand.color }} aria-hidden="true">{brand.mark}</i>
  <span><strong>{link.label}</strong><small className={link.kind === "track" ? "is-direct" : ""}>{link.kind === "track" ? t("links.direct") : t("links.search")}</small></span>
  <ArrowUpRight size={16} aria-hidden="true" />
 </a>;
}

/** Platform tiles shown inline on the page (the "browse by provider" row). */
export function ListenTiles({ track }: { track: Track }) {
 return <div className="listen-grid">{getListeningLinks(track).map(link => <Tile key={link.id} link={link} />)}</div>;
}

/** Compact trigger opening the same platform list in a sheet. */
export function SongLinks({ track, iconOnly = false, compact = false }: { track: Track; iconOnly?: boolean; compact?: boolean }) {
 const { t } = useI18n();
 return <Sheet closeLabel={t("links.close")} className="links-sheet" title={track.title} description={`${track.artist} · ${t("links.choose")}`} trigger={
  <button className={iconOnly ? "" : `btn ${compact ? "btn-soft" : "btn-ghost"}`} aria-label={`${t("links.open")}：${track.title}`}>
   <Headphones size={iconOnly ? 19 : 16} />{!iconOnly && <span>{t("links.open")}</span>}
  </button>
 }>
  <div className="links-list">{getListeningLinks(track).map(link => <SheetClose asChild key={link.id}><Tile link={link} /></SheetClose>)}</div>
  <p className="sheet-note">{t("links.note")}</p>
 </Sheet>;
}
