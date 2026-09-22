# 余音 · Aftertone

**下一首，你的单曲循环。**

余音是一个开源的音乐发现网站。给它一首你喜欢的歌，让 Jev 从真实曲库召回的候选中辅助筛选，再用七首歌给你一个新的听歌起点。你可以试听、收藏，也可以选择常用的官方音乐平台听完整首。

[打开网站](https://emanon4.github.io/aftertone/) · [GitHub 源码](https://github.com/Emanon4/aftertone) · [隐私与数据说明](PRIVACY.md) · [验证记录](VERIFICATION.md)

## 项目介绍

世界上有很多好歌，逐首碰运气需要时间。余音想做的是：从你已经喜欢的声音出发，把需要亲自试听的范围缩小，让下一次偶遇更有方向。

| 能做什么 | 当前实现 |
| --- | --- |
| 从一首歌出发 | 搜索喜欢的录音版本，选择相近、侧向或更大胆的探索方向 |
| 有规模的筛选 | 索引 145,548 首；每轮最多 5,000 首真实候选，展示实际评分数量 |
| 七首一组发现 | 试听片段、收藏、不太合适反馈，以及沿着某首继续探索 |
| 选择自己的平台 | 网易云、QQ 音乐、Spotify、Apple Music、YouTube Music、Deezer |
| 选择自己的模型 | 站点 Jev、个人 Jev Key，或四个官方 OpenAI 兼容服务模板 |
| 玻璃听音室 | 默认暖黑背景，保留橙红 Logo；支持浅色模式与手机布局 |

Jev 根据歌曲资料和偏好评分，当前实现不分析音频。“好听”仍由你的试听判断；站内提供短试听，完整歌曲由官方平台播放。兼容模型的真实服务调用验证范围见下文。

## 网站与架构

- 公开前端：[GitHub Pages](https://emanon4.github.io/aftertone/)，由本仓库的 GitHub Actions 自动构建发布。
- [生产 API](https://aftertone-api.moji-pet.workers.dev/api/library) 已上线，Cloudflare D1 两次迁移已应用，站点 Jev 和个人模型入口已配置。GitHub Pages 新版已接入该 API，默认采用深色听音室。
- 前端使用 Vite + React；独立 API 使用 Cloudflare Worker + D1。站点 Jev 密钥使用 Worker secret，个人模型密钥按下文的 BYOK 流程传递。
- 源码按 [MIT](LICENSE) 公开发布；音乐数据、封面、试听和第三方服务不属于本项目的 MIT 授权范围，见 [第三方声明](THIRD_PARTY_NOTICES.md)。
- 原私有 Sites 部署不是本轮发布目标。旧 Sites 相关源文件保留作历史迁移参考，不参与新的前端或 Worker 构建。

## 怎样找歌

搜索并选一首喜欢的歌，选择「沿着喜欢」「换个角度」或「大胆一点」，也可以补充不要现场版、限定年代等偏好。系统召回真实候选，模型逐首评分，结果七首一组呈现；收藏和「不太合适」记录帮助下一轮调整。界面默认深色，可在页脚切换浅色，主题选择保存在当前浏览器。

[Jev](https://docs.typesafe.ai/concepts/state) 在这里承担候选评分：把起点歌曲、候选资料、当前偏好和最近反馈整理成状态，再对每首候选提出统一的适配问题。它缩小需要逐首试听的范围；当前实现没有向模型发送音频，也不会把资料关联当作已听到的旋律、音色或情绪。是否好听，由实际试听与复听判断。

站内播放提供方允许的短试听。点击「听完整首」可选择 Deezer、Spotify、Apple Music、网易云音乐、QQ 音乐或 YouTube Music：已核对来源平台和歌曲 ID 的链接标为直达歌曲（`track`），其他入口按歌名与歌手搜索（`search`）。搜索结果可能包含现场版、翻唱或同名歌曲，完整播放仍取决于平台账号、订阅与所在地区。

## 使用自己的模型

「模型设置」提供站点 Jev、个人 Jev Key 和 OpenAI 兼容服务。兼容模式提供以下四个官方地址模板，模型名称可修改：

| 模板 | 官方 API 地址 | 默认模型名称 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Qwen 国内 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Qwen 国际 | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |

模板已完成适配器和任务流程测试，**尚未使用四个服务的真实账号逐一调用验证**；默认名称不代表该账号或地区必然可用，Jev 的测速结果也不适用于这些模型。兼容模型必须返回覆盖全部问题的有效评分；缺失、重复、越界或格式错误会让本轮停止，不展示部分结果。

个人 Key 仅保留在当前标签页内存，不写入 `localStorage`、`sessionStorage` 或任务 JSON；刷新、关闭页面或切回站点模式后需重新填写。开始和推进任务时，Key 通过 `X-Model-Api-Key` 发送到 Worker，再用于所选模型的调用。D1 保存模型配置、任务数据和 Key 的 SHA-256 指纹，用于任务校验与额度隔离，不保存 Key 原文。歌曲资料、偏好与最近正负反馈会发送给所选服务，个人调用费用由使用者承担。

站点 Jev 共用每天 30 轮额度；个人 Key 各自每天 30 轮，按 UTC 日计算。设置在一轮开始时固定，运行中不能换模型；取消后已在途的调用可能仍会完成。未配置 API 地址的静态预览仍无法推荐，填写个人 Key 不会自动连接 Worker。

## 曲库与筛选

当前索引 **145,548 首、6,965 个主要艺人 ID**，源采集 148,607 条真实 Deezer ID，按 NFKC、大小写和空白规范化后的艺人及曲名去重，保留曲名标点和版本信息。145,536 首在采集时存在试听地址，不能据此保证现在或所有地区可播。

曲库拆为 **73 个分片**，每片最多 2,000 首。每轮按种子策展路径与全库范围抽样，最多加载 10 片、20,000 条，再结合实时关联作品召回最多 **5,000 首**。Jev 对实际候选逐首评分，最终保留最多 14 位不同艺人的作品，分两组各 7 首。明确偏好、不可试听和去重可能使候选少于 5,000，界面展示实际数量，不重复凑数。

Jev 单批最多 128 个问题，并发 4。无补充条件时 5,000 首分 40 批、10 个步骤；有补充条件时每首多一个约束问题，最多 79 批、20 步。OpenAI 兼容适配器每批最多 64 个问题，不沿用 Jev 的批数或时延。D1 记录任务进度和步骤租约，防止并发/重放重复计费。上游失败不返回部分推荐、不自动重试付费批次；客户端可读取已提交状态恢复网络中断。取消阻止后续步骤，已在途调用可能仍完成。

这仍是偏向艺人热门作品及其关联艺人的快照，不是全球完整曲库。`collectionGroups` 是策展发现路径，不能当作官方风格。没有可信来源的 year、genre、ISRC 保持缺失；年代条件会排除年份未知的候选。Jev 只读文本资料，不能直接听音频，筛选质量仍需用试听和复听验证。

## 实测

一次真实 Jev 测试：**5,000 首全部完成评分，13,974 ms，40 批、并发 4，零失败、零重试**，模型 `jev-1.13.0`。输入 1,636,227 tokens，输出 128,691 tokens。

该测试从上一版 5,163 首索引取 5,000 首，以 Radiohead / No Surprises 为起点；只测模型评分阶段，不含搜索、召回、D1 步骤或网页传输，也不代表推荐质量或稳定时延。可提交报告见 `data/benchmark-5000.json`。

本轮自动化验证 **81 项测试通过（含子测试）**，TypeScript、ESLint、前端生产构建和 Worker dry-run 通过。已验证范围和线上限制见 [VERIFICATION.md](VERIFICATION.md)。

生产 API 已验证曲库读取、搜索、试听地址解析与 CORS。一次真实生产任务在 4,974 ms 内完成 5,000 首候选召回和 10 步任务创建，随后取消，实际评分数为 0；这是任务创建检查，不是生产模型评分测速。

## 本地运行

Node 22.13+，需要两个终端：

```sh
npm ci
# 创建 .dev.vars，填写 TYPESAFE_API_KEY=...；该文件被 Git 忽略。
npx wrangler d1 migrations apply DB --local --config wrangler.api.jsonc
npm run dev:api
```

```sh
npm run dev
# http://127.0.0.1:5176/aftertone/，API 代理到 127.0.0.1:8788
```

```sh
npm test
npx tsc --noEmit --incremental false
npm run lint
npm run build
npx wrangler deploy --dry-run --config wrangler.api.jsonc
```

## 发布

源码仓库为 [Emanon4/aftertone](https://github.com/Emanon4/aftertone)，已公开开源。源码、后端和前端发布统一在此仓库维护。推送 main 后，GitHub Actions 运行测试、类型检查和构建，通过后自动部署 GitHub Pages。

生产 Worker 已部署至 `https://aftertone-api.moji-pet.workers.dev`；D1 数据库已绑定，`0001` 与 `0002` 两次远端迁移已应用。`/api/library` 返回 `available: true` 和 `byokAvailable: true`，搜索、曲目详情及创建后取消任务已通过生产检查。GitHub Pages 已接入生产 API，公开网页实测搜索与短试听成功。

自行部署时，先创建自己的 D1 数据库，将 ID 填入 `wrangler.api.jsonc`，并把 `worker/index.ts` 中的 `ALLOWED_ORIGIN` 改为你的前端来源。已有数据库无需重建；迁移命令只应用待执行的迁移，站点 secret 只在首次配置或轮换时写入：

```sh
npx wrangler d1 migrations apply DB --remote --config wrangler.api.jsonc
npx wrangler secret put TYPESAFE_API_KEY --config wrangler.api.jsonc
npm run deploy:api
PAGES_BASE_PATH=/aftertone/ VITE_API_BASE=https://aftertone-api.moji-pet.workers.dev npm run build:pages
```

在仓库 Settings → Pages 中选择 GitHub Actions；工作流自动上传 `dist-pages/`，不需要另建发布仓库。不要复制 `.env`、`.dev.vars`、源码目录或模型密钥。`VITE_API_BASE` 只能是公开 API 地址；留空时生产构建明确显示听音室预览，不发起不存在的 API 请求。大曲库数据只由 API 资产绑定读取，不进入首页 JavaScript 或 Pages 构建产物。

## 重建索引

```sh
python3 scripts/rebuild-library.py --manifest data/catalog-manifest.json --output output/rebuilt-catalog
node scripts/import-library.mjs output/rebuilt-catalog
```

有界采集公开元数据，最多 4 并发、3,000 次请求，不下载音频。提供方目录变化会使重建数量变化。清单、采集审计和最终规模分别见 `data/catalog-manifest.json`、`data/catalog-audit.json`、`data/library-manifest.json`。新采集目录没有原快照清单时，导入器不会错误套用旧哈希。

## 下一步怎样扩库

扩库优先补充现有热门曲目快照遗漏的录音与可靠资料，以下是后续建议，尚未实施：

1. 在提供方条款和请求预算允许的范围内，从已收录艺人的专辑与曲目目录补充非热门作品；再按语言、地区、年代和发现路径补充新艺人，分别统计新增录音数与艺人覆盖，避免大量重复版本制造虚增。
2. 同步补齐有来源的年份、录音标识及版本信息。跨平台映射优先核对 ISRC，再结合艺人、时长、专辑和版本人工抽查；尚未匹配的链接继续标为搜索。艺人风格、专辑风格与录音事实分开保存。
3. 每批增量先检查字段来源、试听可用比例、重复录音和分布，再以固定种子集比较新增作品的收藏、跳过和复听表现。规模继续扩大时，优先改进分片召回覆盖，保持每轮候选上限和费用可控。

当前的 5,000 首是每轮实际候选目标，并非每轮读取完整曲库。增加总量本身不证明更容易发现喜欢的歌。

## 设计与来源

界面方向为玻璃听音室：保留原 Logo 的橙红色，以深色为默认背景，并提供暖白浅色模式；七张真实封面展墙；玻璃集中在搜索台、分段按钮及浮动播放器，按钮借鉴 Apple 玻璃界面的边缘高光与按压反馈。参考 [NTS](https://www.nts.live/) 的内容组织、[Poolsuite](https://poolsuite.net/) 的播放器体验、[teenage engineering](https://teenage.engineering/) 的精确排版，以及 [Oda](https://www.oda.co/) 的声音情境。参考研究基于公开 HTML/CSS，未复刻页面。

歌曲和封面来自 [Deezer](https://www.deezer.com/)，华语搜索补充 [iTunes Search API](https://performance-partners.apple.com/search-api)。试听解析提供方即时 URL，不保存音频或签名试听链接；完整歌曲指向平台，iTunes 试听标注来源。版权属于各权利人。

本项目原始代码与文档采用 MIT；第三方音乐、元数据、封面、商标和 API 服务仍受各自权利及条款约束。Deezer API 的公开条款规定非商业使用，不能由本项目的代码许可证推导出音乐数据的商业使用权。第三方源码与依赖保留原许可，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
