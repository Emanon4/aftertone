import { useState } from "react";
import { ThumbsDown } from "lucide-react";
import type { Track } from "@/lib/music";
import { useI18n } from "../lib/i18n";
import { DISMISS_REASONS, type DismissReason } from "../lib/storage";
import { Pop } from "./primitives";

/** "Not for me" with a reason, so the next round can steer instead of only excluding one song. */
export function DismissMenu({ track, onPick, withLabel = false }: { track: Track; onPick: (reason: DismissReason) => void; withLabel?: boolean }) {
 const { t } = useI18n();
 const [open, setOpen] = useState(false);
 return <Pop open={open} onOpenChange={setOpen} label={t("dismiss.title")} trigger={
  <button className={withLabel ? "btn btn-ghost" : ""} aria-label={`${t("hero.dismiss")}：${track.title}`}><ThumbsDown size={18} />{withLabel && t("hero.dismiss")}</button>
 }>
  <p className="pop-title">{t("dismiss.title")}</p>
  <p className="pop-hint">{t("dismiss.hint")}</p>
  <div className="pop-options">
   {DISMISS_REASONS.map(reason => <button key={reason} onClick={() => { setOpen(false); onPick(reason); }}>
    {t(`dismiss.${reason}`)}{reason === "artist" && <small>{track.artist}</small>}
   </button>)}
  </div>
 </Pop>;
}
