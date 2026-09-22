"use client";

import { ArrowUpRight, ChevronDown, Headphones, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getListeningLinks } from "@/lib/listening-links";
import type { Track } from "@/lib/music";
import "./song-links.css";

export function SongLinks({ track, compact = false }: { track: Track; compact?: boolean }) {
 const links = getListeningLinks(track);
 return <Dialog>
  <DialogTrigger className={`song-links-button${compact ? " song-links-button-compact" : ""}`} aria-label={`为《${track.title}》选择完整收听平台`}>
   <Headphones size={16} aria-hidden="true"/><span>听完整首</span><ChevronDown size={14} aria-hidden="true"/>
  </DialogTrigger>
  <DialogContent className="song-links-dialog" showCloseButton={false}>
   <div className="song-links-heading">
    <p className="song-links-eyebrow">选择收听平台</p>
    <DialogTitle className="song-links-title">{track.title}</DialogTitle>
    <DialogDescription className="song-links-artist">{track.artist}</DialogDescription>
   </div>
   <DialogClose className="song-links-close" aria-label="关闭收听平台选择器"><X size={18} aria-hidden="true"/></DialogClose>
   <div className="song-links-list" aria-label="完整收听平台">
    {links.map(link => <DialogClose asChild key={link.id}>
     <a className="song-links-platform" href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`${link.label}：${link.kind === "track" ? "直达歌曲" : "搜索歌曲"}《${track.title}》（新窗口）`}>
      <span className="song-links-initial" aria-hidden="true">{Array.from(link.label.trim())[0]}</span>
      <span className="song-links-platform-name">{link.label}</span>
      <span className={`song-links-kind${link.kind === "track" ? " song-links-kind-direct" : ""}`}>{link.kind === "track" ? "直达歌曲" : "搜索歌曲"}</span>
      <ArrowUpRight className="song-links-arrow" size={16} aria-hidden="true"/>
     </a>
    </DialogClose>)}
   </div>
   <p className="song-links-note">完整版播放适用各平台的账号、订阅与地区规则。</p>
  </DialogContent>
 </Dialog>;
}
