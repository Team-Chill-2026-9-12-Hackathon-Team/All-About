# B 进度交接

日期：2026-09-12。

## 已完成

- 制定 B0–B6 分层任务卡、验收标准和 Terra/Sol 执行提示词，见 `outputs/B_EXECUTION_PLAN.md`。
- 按用户要求加入小进度验收后 commit/push 的规则。
- 确认仓库：`https://github.com/Team-Chill-2026-9-12-Hackathon-Team/All-About`；B 分支：`feat/orchestrator`。
- 确认学校为 UTSG，面向各学院全体学生；将及时向用户澄清不确定问题的要求写入计划和启动提示词。
- B0 工程骨架：建立 npm workspace、server/contracts 工作区、共享 TypeScript 配置、环境模板与忽略规则。
- 使用 Node 24.19.0 和临时 npm 12.0.2 生成唯一 `package-lock.json`；安装审计报告 0 个已知漏洞。
- B0 后端基础：显式加载仓库根 `.env`，校验 HOST/PORT/OpenAI 配置，提供 `GET /api/health`；未配置 OpenAI key 时保留健康检查和离线测试能力。
- B1 契约草案：用 Zod 落地 Scope、QueryInput/Plan、Source、Snapshot、BrowserBatch、Claim/Evidence/AnswerBundle、RunStatus 和按 type 判别的 EventEnvelope；TypeScript 类型从 schema 推导。
- 为 A/C/D 提供 query input、query plan、browser batch、answer bundle 和事件 JSON 样例；课程材料明确标为虚构 fixture。
- 契约 README 记录边界和三项待确认扩展：cleanup 生命周期、开发 mock 模式、faculty/college scope 字段。当前实现严格遵循原始 v1 草案，尚未宣称团队已冻结。
- B2 契约切片：增加来源列表、创建任务、任务快照、澄清、取消和统一错误的 HTTP 边界 schema；来源公开摘要严格排除入口 URL 和其他配置。
- B2 RunStore 切片：创建 run 时先持久 queued 事件；实现单活动 run、严格状态转换、澄清上下文合并、幂等取消、递增事件序号、历史补发和实时订阅。
- B2 HTTP/SSE 切片：实现来源公开摘要、创建/恢复任务、提交澄清、取消任务和事件流；事件流支持终态迟连接补发、`Last-Event-ID` 断点续传及无效/超前游标错误。
- B3 注入式执行器首片：按 planning → browsing → synthesizing → completed/partial/failed 驱动 RunStore，将浏览信号映射为公共事件；每个任务使用独立 AbortController，取消后的迟到结果不会写回。
- 增加两个仅供自动化测试使用的可控 mock adapter；其内容明确标注为 synthetic fixture，不通过默认产品接口冒充实时 UTSG 数据。真实 C 依赖尚未接入。
- B3 超时与澄清切片：活动处理预算到期会 abort adapter 并稳定进入 failed；needs_input 使用独立等待时限，提交澄清后在同一 run 上继续，过期前不会启动浏览器。
- B4 边界校验首片：D 候选答案在写入前验证 run/mode/scope、一致且唯一的 ID、所有引用、规划来源范围，并以规范化空白后的原文检查 evidence quote；损坏答案进入稳定 failed，不污染 run 快照。
- B4 OpenAI 规划器首片：按官方 Responses API Structured Outputs 用法提供可注入规划器，模型只看到去 URL 的 registry 摘要；服务端再次限制来源 ID、用户 allowlist、access、scope、运行模式和 3/3/6/90s 预算。模型名称只读取调用方配置。
- 用户已指定应用 API 模型为 `gpt-5-mini`；本地忽略的 `.env` 已设置 `OPENAI_MODEL=gpt-5-mini`。API key 保持原值且未输出、未暂存。
- 已合入 D 的 `origin/feat/evidence` 并保留其提交历史；删除 D 的临时重复类型，改为直接消费 `@allabout/contracts`，补齐 AnswerBundle 的 mode/scope/requirements/communityNotes/sources，并将 D 包正式链接进 server workspace。
- 统一 `QueryPlan.requestedFields` 语义为事实字段而非 UI 区块；当前规划 schema 支持 deadline、submission_format、eligibility、location、registration_process、contact、other，D 当前规则提取器已实现前两项，其余会诚实落入 unknown/partial。
- 已合入 C 的 `@allabout/browser` 公共实现；新增统一 runtime 组合器，将 OpenAI planner、C.collectPages、D.buildAnswer 和 RunExecutor 连接在同一依赖图中。当前本机未配置 Steel key，因此只完成无凭据集成验证，不重复声称 C 的远端真实 smoke 是本机结果。
- 默认 server 在尚无已审阅 source registry/runtime 时，`POST /api/runs` 明确返回 503 `RUN_EXECUTION_UNAVAILABLE`，不再制造永久 queued 的任务；健康检查仍可用。
- 按用户此前“不得包含本对话外内容”的要求，合并远端后删除了 `CURSOR_CONVERSATION_HISTORY.md` 与 `PROJECT_MEMO.md`；这两份外部会话交接仍可从 Git 历史恢复，但不会进入本分支当前树。

## 验证与同步

- 计划文件已做内容复核；本次文档修改执行 `git diff --check`。
- 首次计划提交：`cef933c`。该提交仍未推送成功。
- 当前登录 GitHub 账号：`Ziqinxu93`。最近一次推送返回 403；权限查询显示 `pull: true`、`push: false`。
- 本次学校范围和沟通规则更新保存为本地提交，等待仓库写权限开通后与首次提交一起同步。未把任何本地提交描述成远端已同步。
- GitHub 写权限现已生效；计划提交 `cef933c`、范围更新 `6f7aaf3` 已同步至 `origin/feat/orchestrator`。
- B0 工程骨架提交 `408a372`、健康接口提交 `e247cab`、B1 契约草案提交 `1e8393a` 均已同步至 `origin/feat/orchestrator`。
- 已创建 PR #1：`https://github.com/Team-Chill-2026-9-12-Hackathon-Team/All-About/pull/1`，从 `feat/orchestrator` 合入 `main`；当前状态为 open，尚未合并。
- 工程骨架通过 server/contracts TypeScript 检查；Vitest 已能启动，但此切片尚无测试文件，测试命令按预期以“无测试文件”退出，不能记作测试通过。
- 后端配置与健康接口通过 TypeScript 检查和 4 个 Vitest 测试；真实启动烟测访问 `http://127.0.0.1:3001/api/health` 得到 `{ok:true}`。
- 根级 `npm run typecheck` 通过；根级 `npm test` 通过，共 3 个测试文件、9 个测试。B1 测试覆盖五份共享样例和三类非法边界输入。
- B2 HTTP schema 的 contracts 类型检查通过；contracts 当前 7 个测试通过。完整根级检查在 API/RunStore 切片完成后重跑。
- RunStore 类型检查及 7 个针对性测试通过，覆盖活动冲突、状态机、迟连接、实时后续事件、超前游标、澄清和重复取消。
- HTTP/SSE 路由类型检查及 8 个针对性测试通过，覆盖来源脱敏、输入校验、单活动任务冲突、恢复、澄清、幂等取消、终态补发、断点续传和游标拒绝。
- 注入式执行器 5 个针对性测试通过，覆盖 HTTP 创建后的自动执行、完整事件顺序、partial、取消/abort/迟到结果隔离，以及 adapter 失败。
- B3 执行器当前共 8 个针对性测试；全仓共 6 个测试文件、34 个测试通过。新增覆盖处理超时、澄清续跑和澄清等待过期。
- B4 答案边界校验 6 个专项测试，并增加执行器损坏答案拒绝测试；全仓当前 7 个测试文件、41 个测试通过。覆盖跨 run/mode、重复或缺失引用、正文不存在的 quote、scope、未规划来源和被篡改的公开来源元数据。
- 已安装并锁定官方 OpenAI Node SDK 6.49.0；选择 6.x 是为了保留项目 Node ≥20 的团队兼容范围（7.15.0 要求 Node ≥22）。安装审计为 0 个已知漏洞。OpenAI 规划器 6 个专项测试通过；全仓当前 8 个测试文件、47 个测试通过。
- `gpt-5-mini` 真实最小规划 smoke 通过：Responses API 返回 plan，并且服务端最终只接受 synthetic allowlist source；请求未使用真实 UTSG 事实。可复现命令：`npm run smoke:planner --workspace @allabout/server`。
- 已合入 `origin/main` 的 A 前端提交。按 A 的 pnpm 锁文件独立安装后，6 个 `node:test` 测试和 production build 均通过；A 当前 README 写有 `pnpm test`，但 package 尚无 test script，实际验证命令为 `node --test tests/history.test.mjs`。
- 根 npm workspace 明确限定为 `apps/server` 与 `packages/*`，避免 npm 改写 A 的独立 pnpm 前端；根 Vitest 配置排除 `apps/web` 的 Node test，防止两种测试运行器互相误收集。是否最终统一包管理器仍需团队决定。
- D 适配后严格 TypeScript 检查、6 个原有 Node tests 和 synthetic smoke 均通过。新增 1 个 B→D 集成测试：B 执行器调用 D 的真实 buildAnswer，答案经过 B 引用校验后进入 completed。
- 当前根级 `npm test` 通过：server 47、browser 3、contracts 7、evidence 6，共 63 个测试；另有 A 前端 6 个独立 Node tests 及 production build 通过。`gpt-5-mini` 在事实字段 schema 更新后再次通过最小真实规划 smoke。
- C 依赖安装后，browser 严格 TypeScript 检查和 3 个无凭据测试通过，覆盖 exact-host HTTPS 白名单、阻断/登录识别及预取消不创建 Steel session。B runtime/503 专项测试通过。
- 合并 C/D 与 runtime 后，根级 `npm run typecheck` 通过；根级 `npm test` 通过，共 server 42、browser 3、contracts 7、evidence 6，即 58 个测试。A 的 6 个前端 Node tests 与 production build 继续独立验证。
- `docs/B_CONTRACT_PROPOSALS.md` 已记录 authority、cleanup/viewer 生命周期与事实字段语义的共享契约提案；未收到 A/C/D 回复前不宣称冻结。
- 用户已明确指定外部 `TEAM_MIN_DEMO_B.md` 作为执行指令；逐项对照当前分支后实施。新增 `docs/B_MIN_DEMO_TEST_PLAN.md`，区分离线预检、缺依赖启动检查与真实 Steel 验收。
- 新增 synthetic minimum-demo 全链路预检：HTTP 创建任务 → B runtime → 测试专用 mock C → D 真实公共入口 → B 校验 → 终态与 SSE 历史。测试模式固定为 `LIVE_FIXTURE`，不冒充 `LIVE_WEB`。
- 2026-09-12 公开可达性检查确认 CSC207 Academic Calendar 与 U of T Events 两个 exact-host URL 能返回内容；尚未在本机经 Steel 验证，因此不记作 C 真实浏览通过。

## 当前边界

- B0–B4 与 synthetic minimum-demo 预检已完成；C/D 已在 B 集成分支消费共享契约，仍等待 A 的正式评审后才可标记冻结。通用 C/D runtime 和 live source registry 已接线；C 独立 Academic Calendar smoke 已真实通过，但 B 的 HTTP → Steel → D 端到端仍未在本机验收。
- 实际 Git checkout：`C:\Users\xuziq\Desktop\hackthon\work\github-sync`。
- 真实密钥已安全复制到此 checkout 的 `.env`，该文件被 Git 忽略；未输出或暂存密钥。
- 当前 Codex 运行环境能运行 Node，但没有全局 `npm` 命令；通过临时 npm 12.0.2 完成依赖安装。团队普通 Node/npm 环境可直接使用锁文件；本地后续检查可直接调用已安装工具。
- 正常团队命令：`npm install`、`npm run dev:server`、`npm run typecheck`、`npm test`。当前 Codex 终端的验证使用锁文件中相同工具直接执行，并额外完成真实服务烟测。
- 2026-09-12 本次接管已从结构化交接包恢复 B/contracts 改动，修复 `RunSnapshot.cleanup` 的旧路由断言；`npm install`、根级 typecheck 和 63 个测试全部通过。A 隔离工程 production build 与 6 个 Node tests 通过。恢复期间未修改 `packages/evidence/`，D 继续从 `@allabout/contracts` 导入类型。
- 2026-09-12 真实单来源集成烟测：经 Vite `/api` 代理创建 CSC207 LIVE_WEB run，HTTP 202；SSE 收到 viewer_ready、两次 browser_step、source_checked、viewer_closed、answer_ready 和终态，0 source_failed/run_error，cleanup=released。首次运行在旧 D 下诚实返回 partial、0 claims/evidence。
- 随后合入 D 的 `69a8967 fix(evidence): extract requirements and prerequisites` 及其前置提交；B 的 LIVE_WEB planner 边界强制包含 `requirements`、`eligibility`。修正 D 最新分支的 NodeNext 相对导入与严格测试 fixture 后，全量检查通过。重启前后端后，同一 `smoke:live` 成功返回 completed、1 claim、1 evidence、0 unknown、cleanup=released，所有 assertion（含 answerReady）为 true。
- 下一步：保留 CSC207 作为单来源保底，连续复跑并记录稳定性；随后再启用 U of T Events。Events 波动不得阻塞 Academic Calendar 保底。A 仍需把真实 SSE/AnswerBundle 接入界面。

## 2026-09-12 活动字段冻结

事实字段（requestedFields，不是 UI 区块）：
- 课程：`requirements` / `prerequisite`、`eligibility`、`submission_format`、`deadline`、`location`
- 活动：`event_date`、`event_time`、`location`、`organizer`、`registration_link`、`deadline`、`eligibility`、`requirements`、`event_description`、`event_name`
- LIVE_WEB 课程查询仍强制 `requirements`+`eligibility`；活动查询强制 `event_date`+`location`，不再机械补课程字段
- `scope.entity` 标识单场活动；本轮活动详情源 `alumni-carillon-recital`（Alumni 公开页）。Hart House/Xplore 因 Cloudflare 不作为本轮集成源
- 命令：`npm run smoke:live`（课程回归）、`npm run smoke:live-event`（活动，走 POST /api/runs + SSE）
- 缺字段允许诚实 partial；不得为 completed 虚构报名链接
