# 验证记录

2026-09-22，首版。

- TypeScript 检查与生产构建通过；标题更新和白底唱片版式重做后再次通过。
- 5 项测试覆盖异常评分拒绝、全部候选评分、批次上限、任一上游失败整轮拒绝、多样艺术家选择、明确年代及现场约束。
- 真实 Jev：Radiohead / Weird Fishes，48 首候选、3 次请求，模型 jev-1.13.0；Jev 阶段 1564 ms，输入 13835 tokens / 输出 1071 tokens。此数字不含外部曲库召回耗时，也不是稳定性能承诺。
- 真实浏览器试听 Show Me How：audio.paused=false，currentTime=10.149，duration=29.989 秒；专辑封面均实际加载。
- 中文“周杰伦 晴天”搜到 Jay Chou 的 Sunny Day 原版（iTunes）及 Live（Deezer），保留版本标注与来源。
- 桌面 1280px 无水平溢出；390px 移动端 document.scrollWidth=390；收藏在刷新与开发登录跳转后仍保留。

未验证：大规模推荐质量、用户复听改善、全球完整曲库覆盖、任意地区所有歌曲可播、音频片段理解。
