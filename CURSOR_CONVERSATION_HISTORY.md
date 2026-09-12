# AllAbout — 对话与决策历史（供 Cursor 接管）

更新时间：2026-09-12。本文是项目决策摘要，不包含 Steel API key、调试播放器 URL 或任何个人登录态。

## 原始目标

- 团队：GitHub Organization `Team-Chill-2026-9-12-Hackathon-Team`。
- 仓库：`All-About`；本地目录即本文件所在仓库。
- 目标学校和首版范围：University of Toronto St. George（UTSG）。
- Hackathon 开工时剩余约 24 小时。
- C 负责 Steel 浏览器：网页导航、正文提取、实时浏览画面、来源/失败状态，供 B 后端和 A 前端使用。

## 已确认的产品决策

1. 采集策略是“文本为主、截图为辅”。Steel 优先读取标题、正文、表格、日期 metadata、URL 和抓取时间；LLM 基于结构化文本提炼 claims/evidence/answer。
2. 截图不是默认主数据。它用于页面视觉证据、纯图片/复杂表格的兜底，以及文本过短、页面阻断或展示时的复核。共享 `PageSnapshot` 已预留可选 `screenshotRef`。
3. Reddit、Rate My Professors 首版只做外链：分别存在 API/数据访问和自动访问许可条件，未获许可前不进行自动采集。
4. Quercus 和 ACORN 属于登录后的个人数据，本项目没有授权登录态；首版不使用本机登录态。
5. UofT 官方 Academic Calendar 是现场保底来源；UofT Events、Hart House 等活动源存在间歇性拦截或超时，适合展示但需保留一次重试和降级路径。

## 已完成工作

- C 实现 `collectPages(plan, emit, signal)`：Steel SDK + Playwright、精确 HTTPS host 白名单、私网拦截、正文/metadata 读取、失败分类、一次重试、总时间预算、取消、会话释放。
- B/C 使用 `@allabout/contracts` 共享 Zod schema 和 TypeScript 类型。
- B 服务已提供 `POST /api/browser/collect`：请求体为 `QueryPlan`，返回 `{ batch, signals }`。
- `session_ready` signal 带只读 Steel viewer URL；A 可将其嵌入 iframe/播放器区域。
- 已做真实 Steel viewer 视觉验收；实际画面显示 UofT Events 页面。
- 已做真实 B/C HTTP 联调：Academic Calendar 的 CSC207H1 返回 1 页、0 失败、583 字符，且 cleanup 为 `released`。

## 当前代码状态

- 当前分支：`feat/browser`。
- 最近提交：
  - `9324f57 feat(server): integrate Steel page collection endpoint`
  - `2b2a2c7 docs(browser): record completed stability validation`
  - `6271519 feat(browser): finish contracts viewer and failure validation`
- 当前修改已提交，未推送；除非项目负责人明确要求，不主动 push。

## 已验证结果

- `npm run typecheck` 通过。
- `npm test` 通过：server 6 tests、browser 3 tests、contracts 5 tests。
- C 的公开双页查询修复后连续三轮成功：2 pages、0 final failures、`cleanup=released`。
- 取消测试返回 `CANCELLED` 并释放会话；1 秒总预算测试返回 `TIMEOUT` 并释放会话。
- UofT Events 在随后 HTTP 烟测中出现过可重试 TIMEOUT；不可把“曾经成功”当作永远稳定。现场建议优先演示 Academic Calendar。

## 下一位开发者应先读

1. `PROJECT_MEMO.md`：当前架构、运行方式、可执行 next steps。
2. `docs/C.md`：来源清单、真实测量记录和限制。
3. `docs/B.md`：后端基础和接口说明。
4. `packages/contracts/src/schemas.ts`：跨角色唯一数据契约。
