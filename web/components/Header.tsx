import { Home, Search, SlidersHorizontal } from "lucide-react";
import { useI18n } from "../lib/i18n";

export type View = "discover" | "saved";

export function Logo() {
 // The original vinyl-ring mark, recoloured to the rose palette.
 return <svg className="logo-mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" /><g><circle cx="32" cy="32" r="22" /><circle cx="32" cy="32" r="16" /><circle cx="32" cy="32" r="10" /></g><circle className="logo-dot" cx="32" cy="32" r="3" /></svg>;
}

export function Header({ view, onView, savedCount, onSearch, onSettings, onAbout }: {
 view: View; onView: (view: View) => void; savedCount: number; onSearch: () => void; onSettings: () => void; onAbout: () => void;
}) {
 const { t } = useI18n();
 return <header className="topbar">
  <a className="brand" href={import.meta.env.BASE_URL || "/"} aria-label={t("nav.home")} onClick={e => { e.preventDefault(); onView("discover"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
   <Logo /><span>aftertone</span><small>余音</small>
  </a>
  <nav className="nav-pill glass" aria-label="aftertone">
   <button className={view === "discover" ? "on" : ""} aria-current={view === "discover" ? "page" : undefined} onClick={() => onView("discover")}><Home size={15} /><span>{t("nav.discover")}</span></button>
   <button className={view === "saved" ? "on" : ""} aria-current={view === "saved" ? "page" : undefined} onClick={() => onView("saved")}><span>{t("nav.saved")}</span>{savedCount > 0 && <span className="badge">{savedCount}</span>}</button>
   <button className="nav-text" onClick={onAbout}><span>{t("nav.about")}</span></button>
   <span className="nav-sep" aria-hidden="true" />
   <button className="nav-icon" onClick={onSearch} aria-label={t("nav.search")}><Search size={17} /></button>
   <button className="nav-icon" onClick={onSettings} aria-label={t("nav.settings")}><SlidersHorizontal size={17} /></button>
  </nav>
 </header>;
}
