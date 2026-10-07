import { forwardRef } from "react";
import { ArrowRight, ArrowUpRight, AudioLines, LoaderCircle, Play, Search, X } from "lucide-react";
import { coverAt, seconds, trackKey, type Track } from "@/lib/music";
import type { Direction, Progress } from "../lib/api";
import { useI18n } from "../lib/i18n";

const DIRECTIONS: Direction[] = ["close", "sideways", "bold"];

type Props = {
 query: string; onQuery: (q: string) => void; onSearch: (q?: string) => void; searching: boolean;
 results: Track[] | null; onCloseResults: () => void; onPreview: (t: Track) => void; onChoose: (t: Track) => void;
 seed: Track | null; onClearSeed: () => void; direction: Direction; onDirection: (d: Direction) => void;
 notes: string; onNotes: (n: string) => void; busy: boolean; progress: Progress | null; serverDriven: boolean;
 onFind: () => void; onCancel: () => void; previewOnly: boolean;
};

export const DiscoveryConsole = forwardRef<HTMLInputElement, Props>(function DiscoveryConsole(p, inputRef) {
 const { t } = useI18n();
 const percent = p.progress?.totalCount ? Math.min(100, Math.floor(p.progress.scoredCount / p.progress.totalCount * 100)) : 0;
 return <section className="console glass" aria-label={t("console.find")}>
  <form className="console-search" role="search" onSubmit={e => { e.preventDefault(); p.onSearch(); }}>
   <Search size={20} aria-hidden="true" />
   <input ref={inputRef} value={p.query} onChange={e => p.onQuery(e.target.value)} onKeyDown={e => { if (e.key === "Escape") p.onCloseResults(); }}
    placeholder={t("console.placeholder")} aria-label={t("console.placeholder")} maxLength={120} enterKeyHint="search" />
   <button className="btn btn-accent" type="submit" disabled={p.searching}>{p.searching ? <LoaderCircle className="spin" size={17} /> : <>{t("console.search")}<ArrowUpRight size={16} /></>}</button>
  </form>

  {p.previewOnly && <p className="console-note">{t("preview.note")}</p>}
  {!p.seed && !p.results && <div className="console-hints"><span>{t("console.hints")}</span>{["Men I Trust", "Radiohead", "周杰伦", "Lamp"].map(q => <button key={q} onClick={() => p.onSearch(q)}>{q}</button>)}</div>}

  {p.results && <div className="results">
   <div className="results-head"><span>{p.results.length ? t("results.pick") : t("results.none")}</span><button className="icon-btn" onClick={p.onCloseResults} aria-label={t("results.close")}><X size={17} /></button></div>
   <ul>{p.results.map(r => <li key={trackKey(r)}>
    <button className="result-art" onClick={() => p.onPreview(r)} aria-label={t("results.preview", { title: r.title })}>{r.image && <img src={coverAt(r.image, 120)} alt="" loading="lazy" />}<Play size={14} fill="currentColor" /></button>
    <button className="result-name" onClick={() => p.onChoose(r)}><strong>{r.title}</strong><small>{r.artist} · {r.album}</small></button>
    <span className="result-time">{seconds(r.duration)}</span>
    <button className="btn btn-soft" onClick={() => p.onChoose(r)}>{t("results.choose")}<ArrowRight size={15} /></button>
   </li>)}</ul>
  </div>}

  {p.seed && <div className="seed-row">
   <div className="seed-chip">
    {p.seed.image && <img src={coverAt(p.seed.image, 120)} alt="" />}
    <span><small>{t("console.seed")}</small><strong>{p.seed.title}</strong><em>{p.seed.artist}</em></span>
    <button className="icon-btn" onClick={p.onClearSeed} aria-label={t("console.removeSeed")}><X size={16} /></button>
   </div>
   <div className="segmented" role="radiogroup" aria-label={t("console.directions")}>
    {DIRECTIONS.map(d => <button key={d} role="radio" aria-checked={p.direction === d} className={p.direction === d ? "on" : ""} title={t(`dir.${d}.hint`)} onClick={() => p.onDirection(d)} disabled={p.busy}>{t(`dir.${d}`)}</button>)}
   </div>
   <input className="notes" value={p.notes} onChange={e => p.onNotes(e.target.value)} placeholder={t("console.notes")} aria-label={t("console.notes")} maxLength={200} disabled={p.busy} />
   <button className="btn btn-accent btn-wide" onClick={p.onFind} disabled={p.busy}>{p.busy ? <><LoaderCircle className="spin" size={17} />{t("console.finding")}</> : <>{t("console.find")}<ArrowRight size={17} /></>}</button>
  </div>}

  {p.busy && <div className="progress" role="status">
   <div className="progress-label"><AudioLines size={18} /><strong>{p.progress ? t("progress.scored", { a: p.progress.scoredCount.toLocaleString(), b: p.progress.totalCount.toLocaleString() }) : t("progress.preparing")}</strong>
    <span>{p.progress ? `${percent}%` : ""}</span><button className="btn btn-soft" onClick={p.onCancel}>{t("progress.cancel")}</button></div>
   <div className={`progress-bar ${p.progress ? "" : "is-indeterminate"}`}><span style={{ width: `${percent}%` }} /></div>
   {p.serverDriven && <p className="progress-note">{t("console.serverRuns")}</p>}
  </div>}
 </section>;
});
