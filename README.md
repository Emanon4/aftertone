# 余音 · Aftertone

**下一首，你的单曲循环。**

余音是一个开源的音乐发现网站。给它一首你喜欢的歌，它从真实曲库里召回候选，先按资料关联预排序，再由 Jev 逐首评分，用七首歌给你一个新的听歌起点。可以试听、收藏、分享，也可以去常用的音乐平台听完整首。

[打开网站](https://emanon4.github.io/aftertone/) · [隐私与数据说明](PRIVACY.md) · [部署指南](docs/deploy.md) · [推荐流程](docs/how-it-works.md) · [验证记录](VERIFICATION.md)

## 能做什么

| 功能 | 说明 |
| --- | --- |
| 从一首歌出发 | 搜索喜欢的录音版本，选择「沿着喜欢」「换个角度」或「大胆一点」，可补充“不要现场版、90 年代”等偏好 |
| 七首一组 | 每轮从最多 5,000 首召回中预排序出 600 首交给模型评分，最终两组各 7 首，每位艺人至多一首 |
| 会转向的反馈 | 「不太合适」可以选原因：不喜欢这位歌手会在下一轮直接排除该艺人，其余原因作为偏好交给模型 |
| 关掉页面也能继续 | 筛选在服务端由 Durable Object 自动推进，切走标签页或锁屏后回来就能看到结果 |
| 收藏随身带 | 收藏存在浏览器里，可导出 CSV、复制为文本、备份/导入 JSON，或把七首歌生成分享链接 |
| 听完整首 | Deezer、Spotify、Apple Music、网易云音乐、QQ 音乐、YouTube Music |
| 自己的模型 | 站点 Jev、个人 Jev Key，或 OpenAI / DeepSeek / Qwen 的 OpenAI 兼容接口 |
| 界面 | 「午夜玫瑰」深色主题 + 樱粉浅色主题，封面取色的氛围光，中英双语，可安装为 PWA |

Jev 根据歌曲资料和偏好评分，**不分析音频**。推荐理由只描述资料关联（关联艺人、同一策展分组、相近年代），不描述声音；“好听”仍由你的试听判断。

## 技术栈

- 前端：Vite + React 19，Radix 无样式组件，原生 CSS（无 Tailwind），GitHub Pages 发布。
- 后端：Cloudflare Worker + D1（任务、额度）+ Durable Object（服务端推进任务），可选 R2 存放曲库。
- 测试：Node 内置测试（API、任务租约、额度、预排序、导入导出）+ Playwright 端到端（桌面与手机）。

## 本地运行

需要 Node 22.13+。

```sh
npm ci
echo "TYPESAFE_API_KEY=..." > .dev.vars        # 被 Git 忽略
npx wrangler d1 migrations apply DB --local --config wrangler.api.jsonc
npm run dev:api                                 # http://127.0.0.1:8788
npm run dev                                     # http://127.0.0.1:5176/aftertone/，/api 代理到 8788
```

检查：

```sh
npm run lint && npm run typecheck && npm test
npm run test:e2e        # 本机已装 Chrome 时可加 PW_CHANNEL=chrome
npm run check:api       # Worker 打包检查，不需要 Cloudflare 凭据
```

发布、配置额度/人机验证/R2 曲库，见 [docs/deploy.md](docs/deploy.md)。

## 曲库

当前索引 **145,548 首、6,965 个主要艺人**，来自公开的 Deezer 元数据快照，以 v3 紧凑格式拆为 73 个分片（约 12MB），不含音频。曲库仍偏向艺人热门作品，大部分条目只有“策展分组”，没有年份或风格；这是预排序和推荐理由都只引用已有资料的原因。重建与扩库方法见 [docs/how-it-works.md](docs/how-it-works.md#曲库)。

## 许可

原始代码与文档采用 [MIT](LICENSE)。音乐元数据、封面、试听和第三方服务不在 MIT 范围内，见 [第三方声明](THIRD_PARTY_NOTICES.md)。**Deezer API 条款仅允许非商业使用**：如果计划商业化，需要先换成允许商用的数据源与试听来源。
