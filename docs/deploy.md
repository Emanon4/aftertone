# 部署指南

前端（GitHub Pages）和 API（Cloudflare Worker）分开部署。推送到 `main` 后，GitHub Actions 依次执行：lint → 类型检查 → 单元测试 → Worker 打包检查 → 端到端测试 → 构建；随后先部署 API（已配置 Cloudflare 凭据时），再部署 Pages。

## 1. API（Cloudflare Worker）

首次部署：

```sh
npx wrangler d1 create aftertone-api                 # 把 database_id 填进 wrangler.api.jsonc
npx wrangler d1 migrations apply DB --remote --config wrangler.api.jsonc
npx wrangler secret put TYPESAFE_API_KEY --config wrangler.api.jsonc
npx wrangler secret put IP_HASH_SALT --config wrangler.api.jsonc   # 任意长随机串
npm run deploy:api
```

之后每次升级：**先迁移，再部署**（`0003_quotas.sql` 新增限流表，新 Worker 依赖它）。

```sh
npx wrangler d1 migrations apply DB --remote --config wrangler.api.jsonc
npm run deploy:api
```

也可以在 GitHub 仓库 Secrets 中加入 `CLOUDFLARE_API_TOKEN`（需 Workers、D1 编辑权限）和 `CLOUDFLARE_ACCOUNT_ID`，CI 会自动完成迁移和部署。

### 可调参数（`wrangler.api.jsonc` 的 `vars`）

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | `https://emanon4.github.io` | 允许的前端来源，逗号分隔；本机 localhost 始终允许 |
| `CANDIDATE_LIMIT` | `600` | 每轮交给模型评分的候选数（50–5000）。召回池固定最多 5,000 首 |
| `SITE_DAILY_ROUNDS` | `100` | 站点 Jev 全站每日轮数（UTC 日） |
| `PERSONAL_DAILY_ROUNDS` | `30` | 每把个人 Key 每日轮数 |
| `IP_DAILY_ROUNDS` | `20` | 每个访问者（按加盐哈希的 IP）每日轮数 |
| `PERSONAL_GLOBAL_DAILY_ROUNDS` | `300` | 所有个人 Key 合计的每日上限，防止用随机 Key 刷新额度 |
| `ITUNES_COUNTRY` | `SG` | 华语搜索使用的 iTunes 区域 |
| `MODEL_BASE_URL_ALLOWLIST` | 空 | 额外允许的 OpenAI 兼容地址（仅部署方可设置） |

每轮成本约为旧版的 1/8（600 首 vs 5,000 首），所以默认站点额度从 30 轮提高到 100 轮。

### 人机验证（可选，推荐）

在 Cloudflare 控制台创建 Turnstile 站点（域名填前端域名），然后：

```sh
npx wrangler secret put TURNSTILE_SECRET_KEY --config wrangler.api.jsonc
```

并在 `vars` 中加入 `"TURNSTILE_SITE_KEY": "<site key>"`。两者都存在时，`/api/library` 会把站点 key 下发给前端，开始找歌前自动做一次无感验证；未配置时前端不会加载 Turnstile 脚本。

### 服务端推进任务

`JOB_RUNNER` Durable Object（SQLite 存储类，免费计划可用）在任务创建后用 alarm 逐步推进。个人 Key 只保存在该对象的内存中，不写入存储；对象被回收后，浏览器在 8 秒无进展时自动接手推进。两种推进方式共用 D1 租约，同一步不会被重复执行或重复计费。

### 搜索缓存与限流

`/api/music` 的搜索与单曲查询会写入 Cloudflare 边缘缓存（搜索 15 分钟、单曲 5 分钟，因为单曲带有短时效的试听签名）。**边缘缓存只在自定义域名上生效**：`*.workers.dev` 上 Cache API 是空操作，此时只有单实例内存缓存。给 Worker 绑定自定义域名（Workers → Settings → Domains）后自动启用。

`MUSIC_LIMITER`（Workers Rate Limiting）限制每个 IP 每分钟 40 次真正打到 Deezer/iTunes 的请求，命中缓存不计数；在 `wrangler.api.jsonc` 的 `ratelimits` 中调整。

### 曲库放到 R2（可选）

曲库已压缩为 v3 紧凑格式（约 12MB），随 Worker 静态资源发布即可。如仍想迁到 R2：

```sh
npx wrangler r2 bucket create aftertone-catalog
npm run catalog:upload -- aftertone-catalog
```

然后取消 `wrangler.api.jsonc` 中 `r2_buckets` 的注释并重新部署。绑定 `CATALOG` 后 Worker 优先从 R2 读取。确认线上正常后，可以把 `public/catalog` 移出仓库（建议放到 Release 附件，保留重建脚本）。

## 2. 前端（GitHub Pages）

仓库 Settings → Pages 选择 GitHub Actions。构建变量：

```sh
PAGES_BASE_PATH=/aftertone/ VITE_API_BASE=https://<你的 worker>.workers.dev npm run build
```

`VITE_API_BASE` 留空时，生产构建只显示听音室预览，不请求 API。自行部署时记得同时修改 `index.html` 中的 `og:url` / `og:image`。
