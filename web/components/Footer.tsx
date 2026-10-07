import { useEffect, useState } from "react";
import { ArrowUpRight, Languages, Moon, Sun } from "lucide-react";
import type { LibraryInfo } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Sheet } from "./primitives";
import { Logo } from "./Header";

type Theme = "dark" | "light";
const THEME_KEY = "aftertone-theme";
const THEME_COLOR: Record<Theme, string> = { dark: "#0b0709", light: "#fff4f7" };

export function useTheme() {
 const [theme, setTheme] = useState<Theme>(() => { try { return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch { return "dark"; } });
 useEffect(() => {
  document.documentElement.dataset.theme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* The page still switches without storage. */ }
 }, [theme]);
 return { theme, toggle: () => setTheme(current => current === "dark" ? "light" : "dark") };
}

export function AboutDialog({ open, onOpenChange, library }: { open: boolean; onOpenChange: (open: boolean) => void; library: LibraryInfo }) {
 const { t } = useI18n();
 const n = (v: number | undefined) => (v ?? 0).toLocaleString();
 return <Sheet open={open} onOpenChange={onOpenChange} title={t("about.title")} description="余音 · Aftertone" closeLabel={t("links.close")} className="about-sheet">
  <div className="about-body">
   <p>{t("about.p1", { pool: n(library.recallPool), limit: n(library.candidateLimit) })}</p>
   <p>{t("about.p2")}</p>
   <p>{t("about.p3", { tracks: n(library.tracks) })}</p>
   <p>{t("about.p4", { site: library.quota?.siteDaily ?? "—", ip: library.quota?.ipDaily ?? "—" })}</p>
   <a className="btn btn-soft" href="https://docs.typesafe.ai/concepts/state" target="_blank" rel="noreferrer">{t("about.jev")}<ArrowUpRight size={14} /></a>
  </div>
 </Sheet>;
}

export function Footer({ onAbout }: { onAbout: () => void }) {
 const { t, lang, setLang } = useI18n();
 const { theme, toggle } = useTheme();
 return <footer className="footer">
  <div className="footer-brand"><Logo /><span>aftertone · 余音</span></div>
  <div className="footer-links">
   <button onClick={toggle} aria-label={theme === "dark" ? t("theme.toLight") : t("theme.toDark")}>{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}{theme === "dark" ? t("theme.light") : t("theme.dark")}</button>
   <button onClick={() => setLang(lang === "zh" ? "en" : "zh")} aria-label={t("lang.label")}><Languages size={14} />{t("lang.switch")}</button>
   <button onClick={onAbout}>{t("nav.about")}</button>
   <a href="https://github.com/Emanon4/aftertone/blob/main/PRIVACY.md" target="_blank" rel="noopener noreferrer">{t("footer.privacy")}<ArrowUpRight size={13} /></a>
   <a href="https://github.com/Emanon4/aftertone" target="_blank" rel="noopener noreferrer">{t("footer.github")}<ArrowUpRight size={13} /></a>
  </div>
 </footer>;
}
