# AllAbout — 项目接管纪要

更新时间：2026-09-12。面向 Cursor 或下一位开发者。

## 架构与数据流

```text
A 前端
  └─ POST /api/browser/collect (QueryPlan)
       └─ B Fastify server
            └─ C collectPages(plan, emit, AbortSignal)
                 └─ Steel session + Playwright
                      ├─ PageSnapshot[]（文本主数据）
                      ├─ BrowserSignal[]（含 session_ready viewer URL）
                      └─ BrowserBatch（pages/failures/cleanup）
```

共享契约在 `packages/contracts/src/schemas.ts`。不要在 A、B、C 各自定义相同字段；修改前先更新 schema、类型和示例。

## 关键文件

| 路径 | 作用 |
| --- | --- |
| `apps/server/src/app.ts` | Fastify：`GET /api/health`、`POST /api/browser/collect` |
| `apps/server/test/app.test.ts` | API contract 与注入式采集器测试 |
| `packages/browser/src/index.ts` | Steel 生命周期与 `collectPages` |
| `packages/browser/src/page-tools.ts` | URL 白名单、私网防护、正文/metadata/链接读取 |
| `packages/browser/src/*-smoke.ts` | collect、cancel、timeout、viewer 真实烟测 |
| `packages/contracts/src/schemas.ts` | Zod v1 schemas |
| `docs/C.md` | 来源范围、难度、测量数据和限制 |

## API 约定

`POST /api/browser/collect`

- Body：严格的 `QueryPlan`。
- 成功：`{ batch: BrowserBatch, signals: BrowserSignal[] }`。
- 无效 body：HTTP 400，`{ error: "INVALID_QUERY_PLAN", details: [...] }`。
- `session_ready.viewerUrl` 是短期会话 URL，只应在当前请求/会话内交给前端；不要记录到日志、git 或长期数据库。
- 请求中断会触发 `AbortSignal`，C 会关闭浏览器并释放远端 session。

当前 route 为同步 JSON 响应，会在采集结束后一次性返回 signals。如果 A 需要实时进度，应在不改变 shared signal schema 的前提下新增 SSE/WebSocket 转发层。

## 运行与验证

```sh
npm install
npm run typecheck
npm test
```

本机真实 Steel 烟测（只在内存读取 RTF key）：

```sh
python3 packages/browser/run-with-key.py /absolute/path/to/SteelKey.rtf smoke:collect
python3 packages/browser/run-with-key.py /absolute/path/to/SteelKey.rtf smoke:cancel
python3 packages/browser/run-with-key.py /absolute/path/to/SteelKey.rtf smoke:timeout
python3 packages/browser/run-with-key.py /absolute/path/to/SteelKey.rtf smoke:viewer
```

不要把 key 放进 `.env`、源代码、日志、测试输出或提交历史。`packages/browser/artifacts/` 是已忽略的本地验收产物。

## A 前端接入建议

1. 由 planner 生成符合 `QueryPlanSchema` 的 plan，并调用 B API。
2. 将 `batch.pages` 交给 LLM/证据层；文本而非截图是默认输入。
3. 找到 `signals` 中的 `session_ready` 后，把 `viewerUrl` 放入只读 iframe 或单独的“浏览过程”面板。
4. 渲染每个 PageSnapshot 的 title、url、fetchedAt 和文本摘要；把 failures 清楚呈现为“未覆盖/被阻断”，不要伪装为无结果。
5. viewer URL 和截图均是证据辅助；表格、图片或文本不足时再让视觉/OCR 链路介入。

## 可靠性与限制

- URL 必须是 HTTPS 且 hostname 与 `SourceConfig.allowedHosts` 精确匹配；不能使用宽泛 `*.utoronto.ca`。
- C 拒绝 localhost、私网 IPv4/IPv6 和 `.local` 主机，避免 SSRF。
- 每个目标最多一次重试；Hart House 可能有间歇性 403，UofT Events 曾出现 TIMEOUT。
- Steel 部署不支持调用方自定义 `sessionId`；必须使用 `sessions.create()` 返回的 session ID，才能保证释放。
- Academic Calendar 已是验证过的稳定 demo 来源。Timetable Builder、Reddit、RMP、Quercus/ACORN 不应在未满足访问条件前纳入首版采集。

## 推荐的下一步

1. A 实现调用 `/api/browser/collect` 的 UI，消费 `batch` 和 `signals`，并实际嵌入 viewer。
2. B 增加 planner → browser → LLM synthesis 的完整 run endpoint；当前仅完成 browser endpoint。
3. D 使用 PageSnapshot 的 URL、标题、抓取时间和文本片段生成可追溯 evidence；保留原文日期/时区，避免自行换算。
4. 现场彩排时使用 Academic Calendar 作为主路径，活动查询作为加分路径；验证网络下的超时提示与降级 UI。
