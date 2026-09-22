# 验证记录

2026-09-22，首版。

- TypeScript 检查与生产构建通过；标题更新和白底唱片版式重做后再次通过。
- 5 项测试覆盖异常评分拒绝、全部候选评分、批次上限、任一上游失败整轮拒绝、多样艺术家选择、明确年代及现场约束。
- 真实 Jev：Radiohead / Weird Fishes，48 首候选、3 次请求，模型 jev-1.13.0；Jev 阶段 1564 ms，输入 13835 tokens / 输出 1071 tokens。此数字不含外部曲库召回耗时，也不是稳定性能承诺。
- 真实浏览器试听 Show Me How：audio.paused=false，currentTime=10.149，duration=29.989 秒；专辑封面均实际加载。
- 中文“周杰伦 晴天”搜到 Jay Chou 的 Sunny Day 原版（iTunes）及 Live（Deezer），保留版本标注与来源。
- 桌面 1280px 无水平溢出；390px 移动端 document.scrollWidth=390；收藏在刷新与开发登录跳转后仍保留。

未验证：大规模推荐质量、用户复听改善、全球完整曲库覆盖、任意地区所有歌曲可播、音频片段理解。

## 曲库与七首版本（2026-09-22）

- 已接入 5,163 首歌曲、403 个规范化艺人署名；源数据 5,235 个 Deezer ID，再按艺人/曲名去重。4,027 首带人工策展检索集合；没有把这些集合写成官方歌曲 genre。
- 所有索引记录不含 preview URL；7 首首页示例也没有签名试听链接。实际密钥精确扫描无匹配，`.env` 被 Git 忽略。
- 10 项测试通过：增加 200 首召回、艺人候选上限、跨平台重复录音与不可试听排除、13 批最多 3 并发、首批失败停止排后续付费请求。
- 浏览器从 Radiohead / Weird Fishes 开始完整找歌成功：HTTP 200、200 首候选、13 次 Jev 请求、jev-1.13.0；返回 14 位不同艺人，界面显示每组 7 首。Jev 阶段 2,983 ms，input 75,682 / output 5,159 tokens，不含资料召回，不能据此推断稳定性能或成本。
- 浏览器播放新推荐 Decks Dark：paused=false，currentTime=6.079 秒。桌面显示 7 张推荐，scrollWidth=1280；手机显示 7 张推荐，scrollWidth=390。
- 已检查桌面与手机截图：`output/playwright/library-home.png`、`library-recommendations.png`、`library-mobile.png`（仅本机验收，不进入 Git）。
- 曲库独立静态存储，由 ASSETS 按请求 URL 读取；修复本地开发假域名导致的索引 404。生产构建、类型检查通过，库内容不会进入首页 JavaScript。

这一轮推荐主要来自实时艺术家关联，尚不能证明扩库提升了推荐质量。后续应通过陌生歌曲命中率与实际复听验证，并补足冷门、年代和不同语言的覆盖。
