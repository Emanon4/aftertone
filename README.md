# 余音 · Aftertone

**下一首，你的单曲循环。** 从一首喜欢的歌出发，用 Jev 辅助筛选真实歌曲，七首一组发现和试听。

## 网站与架构

- 公开前端：[GitHub Pages](https://emanon4.github.io/aftertone-pages/)，发布仓库只保存静态构建产物。
- 当前公开版本为听音室预览，可以收藏并打开音乐平台；独立 API 尚待 Cloudflare 账户登录后部署，线上智能找歌和站内试听尚未连接。
- 新前端使用 Vite + React；独立 API 使用 Cloudflare Worker + D1。Jev 密钥只放 Worker secret。
- 原私有 Sites 部署不是本轮发布目标。旧 Sites 相关源文件保留作历史迁移参考，不参与新的前端或 Worker 构建。

## 曲库与筛选

当前索引 **145,548 首、6,965 个主要艺人 ID**，源采集 148,607 条真实 Deezer ID，按 NFKC、大小写和空白规范化后的艺人及曲名去重，保留曲名标点和版本信息。145,536 首在采集时存在试听地址，不能据此保证现在或所有地区可播。

曲库拆为 **73 个分片**，每片最多 2,000 首。每轮按种子策展路径与全库范围抽样，最多加载 10 片、20,000 条，再结合实时关联作品召回最多 **5,000 首**。Jev 对实际候选逐首评分，最终保留最多 14 位不同艺人的作品，分两组各 7 首。明确偏好、不可试听和去重可能使候选少于 5,000，界面展示实际数量，不重复凑数。

Jev 单批最多 128 个问题，并发 4。无补充条件时 5,000 首分 40 批、10 个步骤；有补充条件时每首多一个约束问题，最多 79 批、20 步。D1 记录任务进度和步骤租约，防止并发/重放重复计费；全站每 UTC 日最多 30 轮。上游失败不返回部分推荐、不自动重试付费批次；客户端可读取已提交状态恢复网络中断。取消阻止后续步骤，已在途调用可能仍完成。

这仍是偏向艺人热门作品及其关联艺人的快照，不是全球完整曲库。`collectionGroups` 是策展发现路径，不能当作官方风格。没有可信来源的 year、genre、ISRC 保持缺失；年代条件会排除年份未知的候选。Jev 只读文本资料，不能直接听音频，筛选质量仍需用试听和复听验证。

## 实测

一次真实 Jev 测试：**5,000 首全部完成评分，13,974 ms，40 批、并发 4，零失败、零重试**，模型 `jev-1.13.0`。输入 1,636,227 tokens，输出 128,691 tokens。

该测试从上一版 5,163 首索引取 5,000 首，以 Radiohead / No Surprises 为起点；只测模型评分阶段，不含搜索、召回、D1 步骤或网页传输，也不代表推荐质量或稳定时延。可提交报告见 `data/benchmark-5000.json`。

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
npm run build
npx wrangler deploy --dry-run --config wrangler.api.jsonc
```

## 发布

私有源码仓库在当前套餐下不能启用 Pages，因此使用公开静态仓库 `Emanon4/aftertone-pages` 的 main 根目录发布；`.nojekyll` 禁用 Jekyll。源码 CI 仅验证，不对不支持的私有 Pages 执行部署。

API 需要用户完成真实 Cloudflare 登录，随后创建 D1、把返回 ID 写入 `wrangler.api.jsonc`，再执行：

```sh
npx wrangler d1 migrations apply DB --remote --config wrangler.api.jsonc
npx wrangler secret put TYPESAFE_API_KEY --config wrangler.api.jsonc
npm run deploy:api
PAGES_BASE_PATH=/aftertone-pages/ VITE_API_BASE=https://实际Worker地址 npm run build:pages
```

将 `dist-pages/` 内容及 `.nojekyll` 提交到公开发布仓库的 main。不要复制 `.env`、`.dev.vars`、源码目录或模型密钥。`VITE_API_BASE` 只能是公开 API 地址；留空时生产构建明确显示听音室预览，不发起不存在的 API 请求。大曲库数据只由 API 资产绑定读取，不进入首页 JavaScript 或 Pages 构建产物。

## 重建索引

```sh
python3 scripts/rebuild-library.py --manifest data/catalog-manifest.json --output output/rebuilt-catalog
node scripts/import-library.mjs output/rebuilt-catalog
```

有界采集公开元数据，最多 4 并发、3,000 次请求，不下载音频。提供方目录变化会使重建数量变化。清单、采集审计和最终规模分别见 `data/catalog-manifest.json`、`data/catalog-audit.json`、`data/library-manifest.json`。新采集目录没有原快照清单时，导入器不会错误套用旧哈希。

## 设计与来源

界面方向为玻璃听音室：采用原 Logo 的橙红色与暖白；七张真实封面展墙；玻璃集中在搜索台、分段按钮及浮动播放器，按钮借鉴 Apple 玻璃界面的边缘高光与按压反馈。参考 [NTS](https://www.nts.live/) 的内容组织、[Poolsuite](https://poolsuite.net/) 的播放器体验、[teenage engineering](https://teenage.engineering/) 的精确排版，以及 [Oda](https://www.oda.co/) 的声音情境。参考研究基于公开 HTML/CSS，未复刻页面。

歌曲和封面来自 [Deezer](https://www.deezer.com/)，华语搜索补充 [iTunes Search API](https://performance-partners.apple.com/search-api)。试听解析提供方即时 URL，不保存音频或签名试听链接；完整歌曲指向平台，iTunes 试听标注来源。版权属于各权利人。
