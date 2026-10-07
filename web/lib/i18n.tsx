import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const zh = {
 "nav.discover": "发现", "nav.saved": "收藏", "nav.about": "关于", "nav.search": "搜索歌曲", "nav.settings": "模型设置", "nav.home": "余音首页",
 "lang.switch": "EN", "lang.label": "Switch to English",
 "theme.toLight": "切换为浅色", "theme.toDark": "切换为深色", "theme.light": "浅色", "theme.dark": "深色",
 "hero.fromSeed": "从这首出发", "hero.featured": "先听这七首", "hero.yours": "你的七首 · 第 {n} 首", "hero.shared": "朋友分享的七首",
 "hero.tagline": "下一首，你的单曲循环。\n从喜欢的一首，发现下一组七首。", "hero.previewLength": "试听约 30 秒",
 "hero.play": "试听", "hero.pause": "暂停", "hero.start": "从这首出发", "hero.continue": "沿着这首继续", "hero.dismiss": "不太合适",
 "hero.save": "收藏", "hero.unsave": "取消收藏", "hero.dot": "查看第 {n} 首",
 "console.placeholder": "输入喜欢的歌或歌手…", "console.search": "找歌", "console.seed": "起点", "console.removeSeed": "移除起点歌曲",
 "console.notes": "偏好（选填）：不要现场版、90 年代…", "console.find": "寻找我的七首", "console.finding": "正在筛选",
 "console.directions": "探索方向", "dir.close": "沿着喜欢", "dir.sideways": "换个角度", "dir.bold": "大胆一点",
 "dir.close.hint": "寻找关联更近的作品", "dir.sideways.hint": "换一位歌手，保留探索起点", "dir.bold.hint": "从更广的曲库中寻找新方向",
 "console.hints": "试试", "console.serverRuns": "关掉页面也会继续筛选，回来就能看到结果",
 "progress.preparing": "正在召回候选并预排序", "progress.scored": "已筛选 {a} / {b} 首", "progress.cancel": "取消",
 "results.pick": "选择你喜欢的那一个录音版本", "results.none": "没有找到，试试加上歌手名字", "results.close": "收起搜索结果", "results.choose": "从这首出发", "results.preview": "试听片段：{title}",
 "rail.featured": "先听这七首", "rail.yours": "你的七首", "rail.shared": "朋友分享的七首", "rail.group": "第 {n} 组", "rail.from": "从 {n} 首候选中筛选",
 "rail.more": "再听七首", "rail.newRound": "寻找新一轮", "rail.share": "分享这七首", "rail.details": "筛选详情",
 "rail.meta": "本轮评分 {scored} 首（从 {pool} 首召回中预排序）· {sec} 秒 · {model}",
 "rail.empty.title": "这一轮，没有勉强凑数。", "rail.empty.body": "换一个起点，或者放宽刚才的条件。", "rail.empty.reset": "重新找个起点",
 "rail.listen": "去平台听完整首", "rail.listenNote": "「直达」已核对歌曲 ID，其余按歌名与歌手搜索",
 "rail.savedTitle": "沿着收藏继续", "rail.savedCount": "你留下的 {n} 首", "rail.viewAll": "查看全部",
 "card.preview": "试听片段：{title}", "card.pause": "暂停试听：{title}",
 "links.direct": "直达歌曲", "links.search": "搜索歌曲", "links.open": "听完整首", "links.choose": "选择收听平台", "links.note": "完整版播放适用各平台的账号、订阅与地区规则。", "links.close": "关闭",
 "dismiss.title": "哪里不太合适？", "dismiss.hint": "帮下一轮换个方向", "dismiss.artist": "不喜欢这位歌手", "dismiss.style": "风格不对", "dismiss.energy-high": "太吵太躁",
 "dismiss.energy-low": "太慢太闷", "dismiss.era": "年代不对", "dismiss.song": "只是这首不行",
 "saved.title": "我的收藏", "saved.empty.title": "还没有留下的歌", "saved.empty.body": "听到心动的那一首，点一下爱心。", "saved.empty.cta": "去听点新的",
 "saved.follow": "沿着这首找", "saved.csv": "导出 CSV", "saved.text": "复制为文本", "saved.backup": "备份 JSON", "saved.import": "导入备份", "saved.share": "分享前七首",
 "saved.note": "收藏保存在当前浏览器；用备份文件可以换设备继续。", "saved.resetDismissed": "清空不合适记录（{n}）",
 "player.label": "试听片段 · {sec} 秒", "player.ended": "试听片段结束", "player.play": "播放试听片段", "player.replay": "重播试听片段", "player.pause": "暂停试听片段",
 "player.progress": "试听片段进度", "player.volume": "音量",
 "toast.saved": "这首留下了 · 保存在当前浏览器", "toast.unsaved": "已移出收藏", "toast.dismissed": "记下了，下一轮换个方向", "toast.copied": "链接已复制",
 "toast.textCopied": "已复制 {n} 首歌", "toast.exported": "已导出", "toast.imported": "已导入 {n} 首收藏", "toast.importFailed": "导入失败：这不是余音的备份文件",
 "toast.storage": "浏览器存储不可用，收藏只保留到本次关闭。", "toast.resetDismissed": "已清空不合适记录", "toast.applied": "已应用 {model}", "toast.shareLoaded": "已打开分享的七首",
 "error.short": "输入至少两个字，或试试歌手的名字。", "error.preview": "智能找歌与站内试听即将开放，先从这七首歌开始探索。",
 "error.noService": "需连接筛选服务才能推荐；请先在音乐平台收听。", "error.noByok": "此筛选服务暂未开启个人模型，请先使用站点 Jev。",
 "error.noPreview": "这首暂时没有试听片段，可打开音乐平台听完整版。", "error.playAgain": "请再次点击试听片段。", "error.audio": "试听片段暂时无法播放，可以打开音乐平台收听。",
 "error.search": "搜索暂时不可用。", "error.round": "这一轮未完成，请再试一次。", "error.incomplete": "没有取得完整筛选结果。", "error.stopped": "这轮筛选没有完成，请重新开始。",
 "error.turnstile": "人机验证没有完成，请再试一次。", "error.share": "分享的歌曲暂时打不开。", "error.close": "关闭提示",
 "preview.note": "听音室预览 · 智能找歌与站内试听即将开放，当前可前往音乐平台收听。",
 "footer.github": "GitHub", "footer.privacy": "隐私说明",
 "about.title": "关于余音", "about.p1": "从你喜欢的一首歌出发，先召回最多 {pool} 首真实候选，按资料关联预排序后，由 Jev 对其中 {limit} 首逐首评分，七首一组呈现。",
 "about.p2": "Jev 不能直接听音频。资料关联是试听线索，不是对“好听”的保证；曲库中的策展集合也不等于官方音乐风格。",
 "about.p3": "当前索引包含 {tracks} 首，仍偏向艺人热门作品。曲目资料和试听片段来自 Deezer，部分华语搜索由 iTunes 补充。完整版由各音乐平台播放。",
 "about.p4": "收藏和不合适记录保存在当前浏览器。筛选会把歌曲资料、偏好和最近最多 8 条正负反馈发给所选模型服务。站点 Jev 全站每天最多 {site} 轮，每台设备每天最多 {ip} 轮。",
 "about.jev": "了解 Jev 的能力",
 "model.title": "选择这次找歌的模型", "model.desc": "默认使用站点 Jev，也可以连接自己的模型服务。", "model.service": "选择模型服务",
 "model.site": "站点 Jev", "model.site.desc": "使用站点提供的额度", "model.jev": "自己的 Jev", "model.jev.desc": "使用个人 API Key",
 "model.compat": "OpenAI 兼容", "model.compat.desc": "连接所选模型服务", "model.template": "服务模板", "model.endpoint": "官方 API 地址", "model.name": "模型名称",
 "model.key": "个人 API Key", "model.key.jev": "粘贴你的 Jev API Key", "model.key.compat": "粘贴所选服务的 API Key",
 "model.privacy": "个人密钥仅保留在当前标签页内存，刷新或关闭后清除。推荐时会发送至筛选服务，用于本轮模型调用；后台继续筛选时只保存在运行中的任务内存里。",
 "model.site.note": "站点 Jev 共用每日额度。切回站点模式会清除已应用的个人密钥。",
 "model.personal.note": "个人模型服务的调用费用由你承担；每个个人 Key 独立计算每日额度。歌曲资料、偏好与最近反馈会交给所选服务筛选。",
 "model.previewOnly": "当前为静态预览，需连接筛选服务。可以先配置；填写个人 Key 后仍需连接服务才能开始推荐。",
 "model.noByok": "此筛选服务暂未开启个人模型。设置可预先保留在本页，开启后才能使用。", "model.busy": "本轮正在使用开始时的设置。结束或取消后可应用新设置。",
 "model.cancel": "取消", "model.apply": "应用设置", "model.err.key": "请先填写个人 API Key。", "model.err.newline": "API Key 不能包含换行，请重新粘贴。", "model.err.name": "请填写要使用的模型名称。",
 "model.summary.site": "站点 Jev", "model.summary.jev": "自己的 Jev", "model.chip": "Jev 辅助筛选",
};
export type MessageKey = keyof typeof zh;
const en: Record<MessageKey, string> = {
 "nav.discover": "Discover", "nav.saved": "Saved", "nav.about": "About", "nav.search": "Search songs", "nav.settings": "Model settings", "nav.home": "Aftertone home",
 "lang.switch": "中", "lang.label": "切换为中文",
 "theme.toLight": "Switch to light", "theme.toDark": "Switch to dark", "theme.light": "Light", "theme.dark": "Dark",
 "hero.fromSeed": "Starting from", "hero.featured": "Start with these seven", "hero.yours": "Your seven · No. {n}", "hero.shared": "Seven shared with you",
 "hero.tagline": "The next song for your repeat button.\nFrom one song you love to the next seven.", "hero.previewLength": "~30 s preview",
 "hero.play": "Preview", "hero.pause": "Pause", "hero.start": "Start from this", "hero.continue": "Keep going from here", "hero.dismiss": "Not for me",
 "hero.save": "Save", "hero.unsave": "Unsave", "hero.dot": "Show track {n}",
 "console.placeholder": "Search a song or artist you love…", "console.search": "Search", "console.seed": "Seed", "console.removeSeed": "Remove the seed song",
 "console.notes": "Preferences (optional): no live versions, 90s…", "console.find": "Find my seven", "console.finding": "Finding",
 "console.directions": "Direction", "dir.close": "Stay close", "dir.sideways": "Side step", "dir.bold": "Be bold",
 "dir.close.hint": "Closely related recordings", "dir.sideways.hint": "Other artists, same starting point", "dir.bold.hint": "Wander wider across the catalog",
 "console.hints": "Try", "console.serverRuns": "It keeps going if you leave — come back for the result",
 "progress.preparing": "Recalling and pre-ranking candidates", "progress.scored": "Scored {a} / {b}", "progress.cancel": "Cancel",
 "results.pick": "Pick the recording you like", "results.none": "Nothing found — try adding the artist", "results.close": "Close results", "results.choose": "Start from this", "results.preview": "Preview: {title}",
 "rail.featured": "Start with these seven", "rail.yours": "Your seven", "rail.shared": "Seven shared with you", "rail.group": "Set {n}", "rail.from": "picked from {n} candidates",
 "rail.more": "Seven more", "rail.newRound": "New round", "rail.share": "Share these seven", "rail.details": "Round details",
 "rail.meta": "Scored {scored} (pre-ranked from {pool} recalled) · {sec}s · {model}",
 "rail.empty.title": "Nothing forced into this round.", "rail.empty.body": "Try another seed or loosen your preferences.", "rail.empty.reset": "Pick a new seed",
 "rail.listen": "Listen to the full song", "rail.listenNote": "“Direct” links are verified track IDs; others search by title and artist",
 "rail.savedTitle": "Continue from your saves", "rail.savedCount": "{n} kept", "rail.viewAll": "View all",
 "card.preview": "Preview: {title}", "card.pause": "Pause preview: {title}",
 "links.direct": "Direct", "links.search": "Search", "links.open": "Full song", "links.choose": "Choose a platform", "links.note": "Full playback depends on each platform's account, subscription and region.", "links.close": "Close",
 "dismiss.title": "What's off?", "dismiss.hint": "Steers the next round", "dismiss.artist": "Not this artist", "dismiss.style": "Wrong style", "dismiss.energy-high": "Too loud",
 "dismiss.energy-low": "Too slow", "dismiss.era": "Wrong era", "dismiss.song": "Just this song",
 "saved.title": "Saved", "saved.empty.title": "Nothing saved yet", "saved.empty.body": "Tap the heart when a song sticks.", "saved.empty.cta": "Discover something",
 "saved.follow": "Find from this", "saved.csv": "Export CSV", "saved.text": "Copy as text", "saved.backup": "Back up JSON", "saved.import": "Import backup", "saved.share": "Share first seven",
 "saved.note": "Saves live in this browser; use a backup file to move devices.", "saved.resetDismissed": "Clear “not for me” ({n})",
 "player.label": "Preview · {sec}s", "player.ended": "Preview ended", "player.play": "Play preview", "player.replay": "Replay preview", "player.pause": "Pause preview",
 "player.progress": "Preview position", "player.volume": "Volume",
 "toast.saved": "Saved in this browser", "toast.unsaved": "Removed from saved", "toast.dismissed": "Noted — the next round will steer away", "toast.copied": "Link copied",
 "toast.textCopied": "Copied {n} songs", "toast.exported": "Exported", "toast.imported": "Imported {n} saved songs", "toast.importFailed": "Import failed: not an Aftertone backup",
 "toast.storage": "Browser storage is unavailable; saves last until you close the tab.", "toast.resetDismissed": "Cleared", "toast.applied": "Using {model}", "toast.shareLoaded": "Opened the shared seven",
 "error.short": "Type at least two characters, or try an artist name.", "error.preview": "Smart discovery is coming soon — start with these seven.",
 "error.noService": "Recommendations need the API; listen on a music platform for now.", "error.noByok": "Personal models are not enabled here yet; use the site Jev.",
 "error.noPreview": "No preview for this one — open a music platform for the full song.", "error.playAgain": "Tap the preview again.", "error.audio": "The preview can't play right now; try a music platform.",
 "error.search": "Search is unavailable right now.", "error.round": "This round didn't finish. Please try again.", "error.incomplete": "The round returned no complete result.", "error.stopped": "This round stopped. Please start again.",
 "error.turnstile": "The human check didn't complete. Please try again.", "error.share": "The shared songs couldn't be opened.", "error.close": "Dismiss",
 "preview.note": "Listening-room preview · Smart discovery is coming soon; listen on a music platform for now.",
 "footer.github": "GitHub", "footer.privacy": "Privacy",
 "about.title": "About Aftertone", "about.p1": "From one song you love, Aftertone recalls up to {pool} real candidates, pre-ranks them by documented links, and has Jev score {limit} of them one by one, shown seven at a time.",
 "about.p2": "Jev cannot hear audio. Metadata links are listening leads, not a promise that a song sounds good; curated collections are not official genres.",
 "about.p3": "The index holds {tracks} recordings, still skewed to artists' popular tracks. Metadata and previews come from Deezer, with iTunes for some Chinese searches. Full songs play on each platform.",
 "about.p4": "Saves and “not for me” marks stay in this browser. Each round sends song metadata, your preferences and up to 8 recent likes/dislikes to the selected model. The site Jev allows {site} rounds a day overall and {ip} per device.",
 "about.jev": "About Jev",
 "model.title": "Choose the model for this round", "model.desc": "The site Jev is the default; you can also connect your own model.", "model.service": "Model service",
 "model.site": "Site Jev", "model.site.desc": "Uses the site's quota", "model.jev": "Your Jev", "model.jev.desc": "Your personal API key",
 "model.compat": "OpenAI-compatible", "model.compat.desc": "Connect a supported provider", "model.template": "Provider", "model.endpoint": "Official API base", "model.name": "Model name",
 "model.key": "Personal API key", "model.key.jev": "Paste your Jev API key", "model.key.compat": "Paste the provider's API key",
 "model.privacy": "Your key stays in this tab's memory and is cleared on refresh or close. It is sent to the API for this round only; while a round runs server-side it lives only in that job's memory.",
 "model.site.note": "The site Jev shares a daily quota. Switching back to the site clears your applied key.",
 "model.personal.note": "Provider costs are yours; each key has its own daily quota. Song metadata, preferences and recent feedback are sent to the provider.",
 "model.previewOnly": "This is a static preview without the API. You can configure now, but recommendations need the service.",
 "model.noByok": "Personal models are not enabled on this service yet.", "model.busy": "This round uses the settings it started with. Apply changes after it ends.",
 "model.cancel": "Cancel", "model.apply": "Apply", "model.err.key": "Enter your personal API key first.", "model.err.newline": "The API key can't contain line breaks.", "model.err.name": "Enter a model name.",
 "model.summary.site": "Site Jev", "model.summary.jev": "Your Jev", "model.chip": "Jev-assisted",
};

export type Lang = "zh" | "en";
const dictionaries: Record<Lang, Record<MessageKey, string>> = { zh, en };
const LANG_KEY = "aftertone-lang";
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;
const I18nContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void; t: Translate } | null>(null);

function initialLang(): Lang {
 try { const stored = localStorage.getItem(LANG_KEY); if (stored === "zh" || stored === "en") return stored; } catch { /* Fall back to the browser language. */ }
 return typeof navigator !== "undefined" && !/^zh/i.test(navigator.language) ? "en" : "zh";
}
export function format(lang: Lang, key: MessageKey, vars: Record<string, string | number> = {}) {
 return dictionaries[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}
export function I18nProvider({ children }: { children: ReactNode }) {
 const [lang, setLangState] = useState<Lang>(initialLang);
 useEffect(() => { document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"; }, [lang]);
 const setLang = useCallback((next: Lang) => { setLangState(next); try { localStorage.setItem(LANG_KEY, next); } catch { /* Session only. */ } }, []);
 const t = useCallback<Translate>((key, vars) => format(lang, key, vars), [lang]);
 const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
 return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() {
 const value = useContext(I18nContext);
 if (!value) throw new Error("useI18n must be used inside I18nProvider");
 return value;
}
