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
- B/C 接口：`POST /api/browser/collect` 用共享 `QueryPlanSchema` 校验请求，调用 `@allabout/browser`，返回 `{ batch, signals }`；客户端断开时向浏览任务传递取消信号。
- B1 契约草案：用 Zod 落地 Scope、QueryInput/Plan、Source、Snapshot、BrowserBatch、Claim/Evidence/AnswerBundle、RunStatus 和按 type 判别的 EventEnvelope；TypeScript 类型从 schema 推导。
- B2 API/SSE：新增共享的 `RunSnapshot`、创建任务响应、澄清请求/响应、来源摘要和 SSE event ID 契约；这些是已获确认的 v1 加法。
- B2 RunStore：实现单活动任务的内存存储、严格递增事件序号、原子“先订阅后补发”SSE 历史重放、终态取消幂等，以及任务状态快照。
- B2 路由：提供 `GET /api/sources`、`POST /api/runs`、`GET /api/runs/:id`、`GET /api/runs/:id/events`、澄清与取消接口。`/api/sources` 暂仅公开已验证的 Academic Calendar 和 UofT Events 的 id/label/kind/access；D 的权威 registry 到位前不得将其视为完整来源清单。
- 为 A/C/D 提供 query input、query plan、browser batch、answer bundle 和事件 JSON 样例；课程材料明确标为虚构 fixture。
- 契约 README 记录边界和三项待确认扩展：cleanup 生命周期、开发 mock 模式、faculty/college scope 字段。当前实现严格遵循原始 v1 草案，尚未宣称团队已冻结。

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
- B2 验证：contracts 类型检查和 7 个契约测试通过；server 类型检查和 14 个测试通过。覆盖任务创建/冲突、未知任务、取消幂等、澄清状态限制、SSE cursor 拒绝、历史重放、重连补发和实时 SSE 格式。

## 当前边界

- B0 本地实现已完成；B1 核心契约和 B2 添加的 run/SSE 契约已实现并通过测试。B2 不启动真实浏览或答案合成：这些由 B3 在注入 C/D 后实现。
- 实际 Git checkout：`C:\Users\xuziq\Desktop\hackthon\work\github-sync`。
- 真实密钥已安全复制到此 checkout 的 `.env`，该文件被 Git 忽略；未输出或暂存密钥。
- 当前 Codex 运行环境能运行 Node，但没有全局 `npm` 命令；通过临时 npm 12.0.2 完成依赖安装。团队普通 Node/npm 环境可直接使用锁文件；本地后续检查可直接调用已安装工具。
- 正常团队命令：`npm install`、`npm run dev:server`、`npm run typecheck`、`npm test`。当前 Codex 终端的验证使用锁文件中相同工具直接执行，并额外完成真实服务烟测。
- 下一步：B3 生命周期层。注入 C 的 `collectPages` 和 D 的 `buildAnswer`，实现 queued → planning/browsing/synthesizing → 终态、取消/超时传播和迟到结果隔离；在引入真实浏览前先复核 90 秒活动预算与 5 分钟澄清窗口。具体演示课程/活动尚未选定，推进到依赖该选择的步骤时及时问用户。
