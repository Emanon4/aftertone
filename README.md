# 余音 · Aftertone

从一首喜欢的歌出发，找到下一首心头好。一个使用 Jev 辅助筛选的音乐发现网站。

## 已实现

- 歌名 / 歌手搜索，真实专辑封面，Deezer 曲库与 iTunes 华语搜索补充。
- 选择一首歌作为起点，从艺术家电台与关联艺术家召回最多 48 首。
- Jev 分批评价资料与偏好匹配，每批最多 16 首，最多 3 个并行请求；完整校验评分，失败不伪造或部分返回推荐。
- 三首一组试听；三种探索方向；换一首作为起点继续找；收藏及“不太合适”反馈。
- 收藏和反馈存于当前浏览器；试听采用提供方即时 URL，不下载或缓存音频；支持暂停、进度、音量及官方完整歌曲链接。
- ChatGPT 身份验证保护付费接口；D1 原子计数限制全站每 UTC 日 30 轮 Jev 筛选；无自动重试。

## 推荐边界

Jev 当前只接收文本。首版依据歌曲、艺术家、专辑类型、发行年份、来源关系和用户明确偏好筛选，不声称分析音频、旋律、人声质感或歌曲片段。资料缺失会降低判断依据。推荐质量需要持续用真实试听与复听验证。

年代约束使用提供方的发行年份，可能是再版发行年；不要把它当作首次录音时间。曲目版本在搜索结果中保留，选择时核对原版、现场、混音等。部分地区或曲目没有试听。

## 本地运行

Node 22.13+。

```sh
npm ci
cp .env.example .env
# 将 TYPESAFE_API_KEY 填入 .env，文件已被 Git 忽略。
npm run db:generate # 仅 schema 改动时需要；已有迁移无需重新生成
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_shocking_rocket_racer.sql
npm run dev
```

本地首次点“帮我找歌”后按提示登录。开发登录只在 loopback 环境模拟用户；线上身份由 Sites 验证。不要重复执行已应用的建表迁移。

```sh
npm test
npx tsc --noEmit
npm run build
```

## 部署

前后端以 Cloudflare Worker 运行。`.openai/hosting.json` 保存 Sites 身份和逻辑 `DB` 绑定。部署时配置服务端 `TYPESAFE_API_KEY` secret 并应用 `drizzle/` 中迁移。生产不依赖本机 `.env`。网站默认仅所有者可访问。GitHub 保存完整源码，不保存密钥、构建包或试听音频。

## 数据及设计依据

曲目与专辑封面来自 [Deezer](https://www.deezer.com/)，部分搜索来自 [iTunes Search API](https://performance-partners.apple.com/search-api)。试听仅用于发现对应歌曲，附平台链接；iTunes 试听注明来源，不作独立的连续播放服务。媒体版权属于各权利人，技术可访问性不代表可转授权。

界面借鉴 [NTS](https://www.nts.live/) 的音乐内容优先、[Qobuz](https://www.qobuz.com/) 的真实专辑呈现，以及 [Poolsuite](https://poolsuite.net/) 的明确播放器反馈。公开 HTML/CSS 研究用于提炼原则，界面没有复制这些网站。

Jev 官方边界：[State](https://docs.typesafe.ai/concepts/state)、[Score](https://docs.typesafe.ai/primitives/score)。

首页黑胶摄影：[Evan-Amos / 12in-Vinyl-LP-Record-Angle](https://commons.wikimedia.org/wiki/File:12in-Vinyl-LP-Record-Angle.jpg)，作者声明公有领域（PD-self）。
