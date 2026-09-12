# AllAbout Campus 团队问题审阅清单

日期：2026-09-12  
审阅对象：A（前端）、B（编排/契约）、C（浏览器）、D（证据）  
项目范围：UTSG，面向各学院全体学生。

本文只总结当前仓库、项目 ZIP 计划和本项目对话中暴露的问题，不包含其他对话内容，也不包含 API key、私有会话地址或其他凭据。

## 请优先确认的阻塞项

### 1. B 与 D 的 `requestedFields` 词汇不一致

- 当前 B 规划器输出：`summary`、`requirements`、`communityNotes`、`keyDates`。
- 当前 D 规则提取器识别：`deadline`、`submission_format`。
- 影响：即使 B→D 的类型适配完成，D 也可能找不到需要提取的字段并返回 unknown，主流程无法形成有效答案。
- 建议：区分“事实字段”和“UI 展示区块”。`requestedFields` 使用事实字段，例如 `deadline`、`submission_format`、`eligibility`、`location`；D 再把事实映射到 AnswerBundle 的 `summary/requirements/communityNotes/keyDates`。
- 需要确认：B、D；A 确认 UI 是否只依赖 AnswerBundle 区块，不直接依赖 `requestedFields`。
- 最迟阶段：B→D 首次真实集成前。

### 2. 当前契约无法可靠表示教师/TA权威角色

- `SourceConfig`/`PageSnapshot` 只有 `kind`：official、course_discussion、community。
- D 当前把所有 official 页面视为 institution，无法仅凭此区分学校机构、教师公告和 TA 公告。
- 影响：教师延期公告覆盖旧 syllabus 日期的冲突规则可能错误；institution/instructor/TA 的证据权重无法可靠判断。
- 建议：在受信任的 source registry 中增加 `authority` 与 `authorityBasis`，采集后复制到 snapshot；不要让模型仅根据页面文字自行猜角色。
- 需要确认：D 提字段需求，C 确认能否原样传递，B 更新契约，A 确认展示文案。
- 最迟阶段：契约冻结及冲突故事联调前。

### 3. C 模块和远端分支尚未出现

- 当前远端只有 main、feat/orchestrator、feat/evidence，未发现 C 的浏览器分支。
- 尚缺：`collectPages(plan, emit, signal)` 的真实公共实现、Steel 配置 smoke、viewer URL、取消/超时、页面上限和会话释放证据。
- 建议 C 最小交付：两个公开页面 smoke；逐步发出 session_ready/step/page_read/source_failed；无论成功、失败或 abort 都在 finally 有界释放；返回真实 cleanup。
- 需要确认：C。
- 最迟阶段：B5 真实集成前；在此之前 B 只能使用明确标注的 synthetic fixture。

### 4. 清理生命周期尚未在共享接口中闭合

- `BrowserBatch.cleanup` 有 released/not_created/release_failed，但 SSE 缺少完整清理状态，GET run 也没有独立 cleanup 字段。
- viewer 可能先关闭、后生成答案；处理终态与资源释放终态不一定同步。
- 影响：前端可能把“回答完成”误显示为“浏览器已释放”，或在清理失败后继续展示失效 viewer。
- 建议：RunSnapshot 增加 cleanup；定义 viewer_closed 的发送方、顺序和失效 URL 行为。C 负责释放，B 只协调并记录实际结果。
- 需要确认：A、B、C。
- 最迟阶段：C 接入和取消验收前。

## 各角色需要审阅的问题

### A — 前端

1. 当前界面仍是本地模拟，尚未接入 `/api/runs`、SSE、澄清、取消和历史恢复。
2. `apps/web/README.md` 写有 `pnpm test`，但 `apps/web/package.json` 没有 test script；当前实际命令是 `node --test tests/history.test.mjs`。
3. A 使用独立 pnpm 锁文件，B 根工程使用 npm workspace。当前临时方案是两套工程隔离运行，未统一包管理器。
4. 请确认 A 对以下状态/事件的映射：needs_input、partial、failed、cancelling、cancelled、source_failed、run_error、viewer_closed。
5. 请确认断线重连使用 `Last-Event-ID=runId:seq`，页面刷新后先 GET run，再续接 SSE。

### B — 编排与契约

1. v1 契约已实现并通过测试，但尚未获得 A/C/D 的正式冻结确认。
2. 默认 server 尚未组合真实 source registry、C.collectPages 和 D.buildAnswer；依赖未配置时不能宣称端到端可用。
3. `gpt-5-mini` 仅完成 synthetic registry 的最小结构化规划 smoke；尚未用真实 UTSG registry 验证。
4. 需要根据第 1、2、4 项审阅结果更新契约并补迁移说明。
5. 需要确定 real runtime 在缺少 C/D 配置时是启动失败、健康但拒绝 POST，还是仅开放离线模式；不能让任务永久停在 queued。

### C — 浏览器采集

1. 确认 AbortSignal 后的行为：抛 CANCELLED、返回部分 BrowserBatch，还是两者结合。
2. 确认超时/取消后最多等待多久完成释放，以及 release_failed 是否可重试。
3. 确认每个 page_read 的 snapshot 已包含最终 URL、标题、正文、时间、scope、contentMode 和建议的 authority 元数据。
4. 确认 allowedHosts、最大 3 页、最大 6 步、90 秒活动预算如何强制执行；重试是否计入总预算。
5. viewer URL 属于短期敏感运行信息，不写日志、不放回放、不提交仓库。

### D — 证据与答案

1. feat/evidence 原分支使用临时本地类型；B 集成分支正在改用 `@allabout/contracts`，当前改动尚未提交，不应视为稳定版本。
2. 请审阅补齐的 AnswerBundle 字段：mode、scope、requirements、communityNotes、sources。
3. 请确认事实字段词汇表及其到答案区块的映射，解决 `requestedFields` 不一致。
4. 请确认 authority 元数据需求，避免 official 一律等于 institution。
5. B 会验证引用存在、quote 属于 snapshot、scope/run/mode 一致；D 仍负责语义支持性、角色权重和冲突判断。

## 产品/团队需要确认

| 问题 | 当前建议 | 影响 |
|---|---|---|
| 是否允许按学院筛选 | P0 只把“各学院全体学生”作为受众，不增加 Faculty/College 筛选 | 若需要筛选，必须扩展 Scope 和 UI |
| 正式演示对象 | 选择一个公开 UTSG 活动作为真实路径；课程延期故事继续明确标记为虚构 fixture | 决定 D registry 与 C smoke 页面 |
| live / fixture / replay 规则 | UI 必须显式标识；synthetic fixture 不得冒充 LIVE_WEB | 影响赛事合规和演示文案 |
| 包管理器 | 当前前端 pnpm、后端 npm 分离；赛后再统一，比赛前不做大迁移 | 影响一键安装和 CI |
| 缺少真实依赖时的服务行为 | 建议健康检查可用，但 POST run 返回明确的未配置错误 | 防止 queued 永久挂起 |

## 当前已验证事实

- B 的 server/contracts：8 个测试文件、47 个 Vitest 测试通过。
- `gpt-5-mini` 的 Responses API Structured Outputs 最小 smoke 通过。
- A 前端：6 个 Node tests 通过，production build 通过；界面明确标注为模拟。
- D 原分支：6 个 Node tests 通过；严格 TypeScript 检查在旧临时契约下失败。B 集成分支已开始修复，但需完成全量验证后才能更新此状态。
- C：尚无可验证的远端实现。

## 建议的审阅回复格式

请每位队友在对应条目下回复：

```text
条目：
结论：同意 / 修改建议 / 阻塞
字段或事件示例：
我负责的下一步：
预计交付分支或提交：
```

