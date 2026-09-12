# AllAbout Campus 联合验收

日期：2026-09-12  
基线：`ec6af45bccb237c259490ec1c6f2a834c6185a91` 加本轮未提交改动

## 十例矩阵

| # | 场景 | 期望 | 结果 | 证据 |
|---:|---|---|---|---|
| 1 | 后端 health | 3001 返回 200 | PASS | `npm run check:local` |
| 2 | 前端代理 health | 5174 `/api/health` 返回 200 | PASS | `npm run check:local` |
| 3 | 真实 Carillon + Soldiers' Tower | LIVE_WEB、2 个贡献来源、日期、引用、released | PASS | `live-web-acceptance.json`，连续 3 次 |
| 4 | DEMO101 A2 主故事 | LIVE_FIXTURE、3 页、明确 Fictional、9 月 20 日、released | PASS | `live-fixture-acceptance-run-{1,2,3}.json` |
| 5 | 中文 `DEMO101 A2 截止日期` | 仍路由到 DEMO101 fixture | PASS | `independent-audit-results.json` |
| 6 | DEMO101 submission format / final exam | 不误入真实网页；已知格式有引用，考试缺失保留 unknown | PASS | 路由回归测试与 fixture corpus |
| 7 | MAT223 Assignment 2 | 保留 MAT223 scope，不套用 CSC207 calendar | PASS | 前端路由回归测试 |
| 8 | 同页 Assignment 1 / 2 | 不制造跨作业冲突 | PASS | evidence 回归测试与独立审计 |
| 9 | 旧 extension 对较新 syllabus | 不自动覆盖，日期均为 needs_confirmation | PASS | evidence 回归测试与独立审计 |
| 10 | 真实性边界 | 非法日期为 unknown；虚构 claim 被拒；LIVE_WEB fixture 被拒 | PASS | validator/date 回归测试与独立审计 |

结果：10/10 场景正确完成或正确保留 unknown/unresolved；没有用 partial 伪装完整成功。

## 三次完整主故事

| 次数 | 延迟 | Viewer | 页面 | 日期 | 冲突 | Cleanup | 人工介入 |
|---:|---:|---|---:|---|---|---|---|
| 1 | 23.068s | ready | 3 | 2026-09-20 17:00 EDT | explicit_update | released | 0 |
| 2 | 21.774s | ready | 3 | 2026-09-20 17:00 EDT | explicit_update | released | 0 |
| 3 | 21.785s | ready | 3 | 2026-09-20 17:00 EDT | explicit_update | released | 0 |

## UI 与 API 对照

浏览器运行 `7cf83c4b-b4bf-4b51-b1ee-5058e2417424` 的 1280×720 终态与 API snapshot 一致：

- UI 与 API 均显示 `LIVE_FIXTURE`、`partial`、3 source receipts；
- UI 的 9 月 20 日 EDT 与 snapshot keyDate 一致；
- UI 的未知项是 late penalty，和 snapshot `unknowns[0]` 一致；
- UI 显示 Viewer released，snapshot 为 `viewerState=closed`、`cleanup=released`。

## 完整检查

- server：66/66
- browser：11/11
- contracts：7/7
- evidence：14/14
- web：20/20
- TypeScript：全部 workspace 通过
- web production build：通过
- 响应式：1280×720、1440×900、390×844；390px 无水平溢出

## 仍未冒充通过的边界

- `release_failed` 的呈现由契约与 UI 分支测试覆盖，没有故意制造真实 Steel 释放故障。
- `needs_input` 的 snapshot 恢复由 HTTP 与 store 测试覆盖，没有为了演示强迫线上 planner 产生一次澄清。
- 登录墙与 MFA 仍是受限能力；不会把登录页或 MFA 页计作已读来源。
