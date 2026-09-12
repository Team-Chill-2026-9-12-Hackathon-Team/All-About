# AllAbout 工作交接

日期：2026-09-12

## 当前停点

- 基线分支：`feat/orchestrator`
- 基线提交：`89c1b07 feat(integration): compose browser and evidence runtime`
- 已在本机从结构化压缩包恢复 B/contracts 的未提交改动；尚未 commit 或 push。
- C 的 `feat/browser` 与 draft PR #2 保持不变；D 的 `packages/evidence/` 未被本次恢复直接修改。
- 更早基线遗留的 `package-lock.json` stash 仍保留，未恢复，避免覆盖当前 workspace。

## 已完成的工作

1. 接入 live source registry，登记 CSC207H1 Academic Calendar 和 U of T Events 两个 exact-host HTTPS 公共来源。
2. 增加 `STEEL_API_KEY` 配置识别；OpenAI model 和 Steel 缺失时服务仍可健康启动，但 `/api/runs` 不会留下永久 queued 任务。
3. 扩展规划和执行：增加事实字段 `requirements`，支持 UTSG/St. George campus 别名，并为真实模式请求 deadline、eligibility、location、requirements。
4. 将浏览器 batch 的 cleanup 结果保存到 `RunSnapshot`，并在 late SSE replay 中过滤已经失效的 `viewer_ready`。
5. 新增 synthetic minimum-demo 预检：HTTP 创建任务 → B runtime → 测试专用 mock C → D → 终态与 SSE 历史。
6. 新增最小 demo 测试计划和团队问题审阅清单。

## 验证结果

- `npm install` 通过，审计 0 个已知漏洞。
- 根级 `npm run typecheck` 通过：server、browser、contracts、evidence。
- A 的隔离 pnpm 工程另行通过 `pnpm build`（含 TypeScript）和 6 个 Node tests。
- 根级 `npm test` 全部通过：
  - server：47/47；
  - browser：3/3；
  - contracts：7/7；
  - evidence：6/6。
- synthetic minimum-demo 预检已包含在 server 测试中并通过：HTTP → B runtime → mock C → real D → B 校验 → SSE/终态。
- 前端新增 Vite `/api` 代理；`127.0.0.1:5173/api/health` 已返回后端 JSON `{ok:true}`，不再返回 Vite HTML。
- 真实 CSC207 单来源链路已执行两次：HTTP 202、viewer_ready、source_checked、viewer_closed、answer_ready、cleanup=released，且没有 source_failed/run_error。
- 已合入 D 最新 `requirements` / prerequisite 提取；B 的 LIVE_WEB planner 会保证 `requestedFields` 至少包含 `requirements`、`eligibility`。
- 合入后真实 `smoke:live` 通过：completed、1 claim、1 evidence、0 unknown、cleanup=released，全部 assertion（含 answerReady）为 true。
- browser 测试：3/3 通过。
- evidence 测试：6/6 通过。
- 已修复原唯一失败：`routes.test.ts` 的 run snapshot 断言现包含 `cleanup: null`。

## 尚未完成 / 不能宣称完成

- 集成 B runtime 的真实 HTTP → Steel → D 已执行并确认传输、viewer、事实引文和 cleanup。
- 前端仍未接入 `/api/runs`、SSE、澄清、取消和历史恢复。
- 本次恢复尚未形成提交，也尚未 push。

## 建议接手顺序

1. 审阅并提交当前恢复的 B/contracts 改动；不要直接修改 D 的契约定义。
2. 连续复跑 CSC207 单来源 smoke 并记录稳定性。
3. CSC207 稳定后再启用 U of T Events；单个来源波动应降级为 partial。
4. A 接入 `/api/runs` 和 SSE；authority 提案在课程 fixture 前由团队确认。

## 安全说明

压缩包不包含 `.env`、API key、`node_modules`、`.git` 或 viewer/CDP 地址。解压到同一仓库分支后，按原路径覆盖/新增文件即可恢复这批工作区改动。
