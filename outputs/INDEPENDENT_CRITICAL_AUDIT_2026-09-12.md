# AllAbout Campus 独立批判性审计

审计日期：2026-09-12。代码基线：ec6af45bccb237c259490ec1c6f2a834c6185a91。
对照依据：工作区 `AllAbout_Plan/01_PROJECT_PLAN.md` 和 `03_TIMELINE_AND_DEMO.md`。这代表可查证的初期书面约定，不声称恢复了所有其他任务的原始对话。旧 MessDigger 计划不适用于当前 Web Agent 项目。

## 判断

目前是有真实浏览器基础设施、有漂亮产品界面意图、但问答能力和展示真实性仍存在断层的原型。尚不能按初期门槛认定为可稳定参赛的完整产品。不能从本次结果推算获奖概率；下文按问题价值、技术实质、结果可信度和现场稳定性进行评审判断，不冒充赛事官方评分规则。

最核心的差距：真实网页路径可以浏览但不一定产出答案；最亮眼的 Deadline Detective 答案来自本地静态快照，尚未实现计划要求的真实浏览虚构课程页面。继续加账号、工具入口和动画，不能弥补这个断层。

## 本次自主验证的事实

| 检查 | 本次结果 | 能证明什么 |
|---|---|---|
| 根工程 npm test | 86 项通过：server 58、browser 11、contracts 7、evidence 10 | 模块已有一定测试覆盖 |
| 前端 npm test | 13 项通过 | history、固定路由、vault API 辅助逻辑 |
| 根工程 typecheck、前端 build | 均通过 | 编译与构建可用，不代表行为正确 |
| 真实 LIVE_WEB：What are the prerequisites for CSC207? | 58.86 秒；两个页面 checked；Timetable Builder 失败；cleanup=released；partial；claims/evidence/keyDates 全为 0 | Steel 真实采集与清理可用；本问题未交付答案 |
| DEMO101 经 3001 API | 51ms，3 个 fixture 来源，9 月 20 日延期，late penalty 未知；cleanup=not_created | 本地证据演示可用，无真实浏览会话 |
| DEMO101 经 5174 前端代理 | 28ms，同上，SSE 到终态 | 代理、HTTP、SSE 正常路径可用，不代表 React 消费事件已实测 |
| 5173 /api/health | 404；5174 为 200 | 本机存在启动入口混淆 |
| 实际 UI 浏览器检查 | 工具访问 127.0.0.1:5173 与 localhost:5173 均被 ERR_BLOCKED_BY_CLIENT 阻止 | 不是产品报错证据；本次不能声称通过点击、视觉或响应式验收 |

原始输出：`independent-audit-results.json`、`independent-live-run.json`。反例脚本：`npx tsx outputs/independent-audit.ts`；加 `--http` 可重跑 3001/5174 的 fixture HTTP 流程。端口需要按实际环境确认。它是诊断探针，输出包括漏洞是否存在，不是断言通过就代表产品合格的测试套件。

## 1. UI

### P0：认证流程制造了不存在的成功

`apps/web/src/Desk.tsx` 的 AuthGate：登录只等待计时器后进入；创建账号/忘记密码直接展示“验证码已发送”，验证也只等待计时器。没有认证请求、发送验证码或校验验证码。30 天功能仅为 localStorage 时间戳。

作为明确标示的本地 demo gate 可以接受；作为真正登录、注册、验证码成功就是错误陈述。评委一旦问“邮件为什么没收到”“换账号是否隔离”，会直接暴露。后端 credential 路由也没有身份验证，所以登录 UI 不能当作 keychain 的安全边界。未读取或修改用户真实凭据；凭据边界结论来自代码。

### P0：Live 和浏览过程表达过度

界面有 mode chip，这点应保留；但右上角 Live 恒定显示。LIVE_FIXTURE 没有解释“仅本地快照、无云浏览”，fixture collector 仍发 navigate/read_visible_text，前端显示 Opening the live page/Reading visible text。用户很容易理解成真的访问过网页。

split panes 实际主要是来源状态卡；真实 C 使用一个 page 逐个导航。后端在采集前发 split_panes，不能以此证明打开了多个真实网页窗格。来源被捕获后，UI 又统一显示“Campus sites block being framed here”，这不是每个站点本次都验证出的原因。

### P1：关键信息被展示层裁掉

AnswerView 只展示 unknowns[0]、communityNotes[0]，主要结论截断至 180 字符、事实约 160 字符。首条 lead 没有直接附 Cite；后续才有引用。普通日期块取 keyDates[0]，没有在这一块按 needs_confirmation 显示风险。复杂冲突和缺失信息可能在简洁 UI 中丢失。

作业未找到日期时，使用写死句子声称已打开 public calendar、Reddit、Piazza；当前路由实际可以是 calendar、Piazza、Quercus。这个句子不是依据实际 Coverage 生成。不是模型幻觉，却仍然是产品输出失实。

### P1：页面入口和功能承诺偏离主线

初期 P0 是左聊天、右浏览/证据、过程与关键日期双时间线。现在增加登录、工具选择、账号金库等入口。工具选择不等于时间表提醒/学习计划等服务已经实现。现有关键日期展示不等于原计划的完整双时间线验收。

建议下一步：直接进入 Course Desk 或明确 Demo sign-in；移除虚假的验证码文案；以真实 run.mode/cleanup 解释模式；完整显示待确认项；让 lead、更新理由、日期都能点回原文；区分“来源卡”和“实时浏览”。本次不对美观度打分，未完成实际渲染检查。

## 2. 前后端连接

### P0：用户提问路径绕过了模型 planner

前端 buildQueryInput 总是发送 sourceIds；runtime.ts 在 sourceIds 非空时直接 createDefaultPlan。D 默认是 RuleBasedExtractor。因此正常 UI 路径本质是正则分类 → 固定来源 → 逐页读取 → 规则提取，不是模型根据问题规划、搜索和综合。

固定入口在初期计划中允许；问题在于其能力范围和宣传不一致，并且不支持基本自由表述。复现：

- `DEMO101 A2 deadline` → 正确 fixture。
- `What is the DEMO101 submission format?` → LIVE_WEB，CSC207 日历和两个活动网站。
- `When is MAT223 Assignment 2 due?` → scope 为 MAT223，来源却选 CSC207。
- `When is the DEMO101 final exam?` → 普通考试页面；不是 DEMO101 来源。

这些属于路由错误复现；不把路由结果进一步推断为已经输出错误答案。错误 scope 也可能导致后端拒绝，从而整次失败。正确行为应是准确路由或明确不支持/澄清。

### P1：后端支持重连不等于前端完成重连

live.ts 的 fetch SSE 不发送 Last-Event-ID，流 EOF 后不重新打开；异常仅 reconcile。每秒 GET snapshot 能恢复部分终态答案，这是有价值的兜底，但无法恢复遗漏的完整活动过程。

restore 把 lastSeq 设成 snapshot 最新序号，然后从无 cursor 的事件端点重放；旧 viewer_ready 和 clarification_needed 会被丢弃。snapshot reconcile 未恢复 clarification。刷新/恢复正在等待澄清的 run 存在丢失输入提示的代码路径。本次是静态确认，不声称已在浏览器注入断线复现。

### P1：错误/取消路径不完整

start 在 503/409 等错误后保留 detecting/planning；cancel 不检查 HTTP 状态，网络异常后只注释“后端仍会终止”，没有证据保证；新请求取消旧请求后固定等待 400ms，而不是确认清理与终态。reset 仅断开前端流，没有发取消请求。

### P1：启动与测试入口脱节

根 npm workspace 没有 apps/web，因此根 npm test/typecheck 不包含前端；本次单独执行了前端测试和构建。现场同时存在 5173 与 5174，前者 API 路径 404。应提供唯一启动入口和前端 API 自检，不能仅看页面加载成功。

建议下一步：统一由后端决定有效来源与 scope，前端只给用户选择/建议；加入故障注入的 React/浏览器 E2E：断线、恢复澄清、409、503、取消失败、重置后再问、parentRunId 追问的模式更新。

## 3. 后端与证据

### P0：真实路径有页面、没有答案

本次真实请求抓取了 CSC207 Calendar 和 CS department 两页，但答案完全没有 claims/evidence。正确保留未知比编造好，但对评委而言，59 秒后仍没有回答先修课问题，产品价值没有交付。

当前 collectTarget 读首页和链接，没有依据问题选择详情链接继续查找；提取器依赖句子关键词/固定字段。不是有 readLinks 函数就代表已实现自主搜索。需要选定真实问题、真实两页，确保至少第二页贡献一条可验事实。

### P0：Deadline Detective 对反例不可靠

独立探针复现：

1. syllabus 改成 9 月 25 日、发布于 9 月 15 日；教师延期页保留 9 月 20 日、发布日期改成 9 月 1 日。系统仍将 9 月 20 日标 confirmed。resolveConflicts 不用 snapshots 的发布时间，单个 instructor+extended 即可胜出。正确行为至少保留冲突，不能自动认定旧公告覆盖新文件。
2. 一页写 A1 9 月 18 日、A2 9 月 20 日，系统误判为同一实体的两个 deadline 冲突。因为 claim 继承整个 snapshot 的 entity，没有句子级作业匹配。
3. 真实教师角色没有通用可信元数据通路：默认 registry 专门硬编码 demo101 sourceId；其他 official 一律 institution，不能按 fixture 成功声称真实教师公告更新也成功。

### P0：引用存在不等于语义得到支持

把真实 bundle 的结论及对应 claim 改为“2099 年 1 月 1 日截止、迟交永远接受”，保留真实 quote，validateAnswerBundle 仍接受。当前校验主要检查引用存在、ID、结构和 scope，不能兜底语义错误。

这是验证器防线缺口，并非声称当前规则引擎已经自主生成这句话。它说明未来接 LLM 后，现有 validator 不足以证明答案可信。

### P0：模式边界可绕过

同一组 fixture snapshots 配上 LIVE_WEB input 与 answer，可以通过 validateAnswerBundle。它检查 answer.mode 与 input.mode，却不充分验证 snapshot.contentMode 和 run.mode 的一致性。用户输入模式不应成为数据真实性的最终依据。

### P1：日期合法性未严格验证

parseDateValue('2026-02-31') 返回 precision=date。仅匹配字符串形状，不检查真实日历有效性。还需要真实月份天数、闰年、时区、区间、不完整年份，以及 same instant 不同 offset 等测试；不能把已实现部分解析当成全面时间语义。

### P1：账号金库已超出本地登录门的保护能力

credential-routes 无认证与用户隔离。即便磁盘密码加密，也不代表 HTTP 调用者有访问/修改权限。当前 localhost 单用户 demo 与真正多用户产品要清楚分开；不要把本地 sign-in 推广为安全账户系统。无需在黑客松中重做完整账号系统，最有效是缩回明确单用户演示边界。

## 为什么已有测试仍然全绿

- 前端路由测试主要断言固定三 sourceIds，验证实现一致性，缺少同义词、中文、未知课程、同课不同问题的期望行为。
- min-demo-preflight 明确使用 mock C + real D，测试名称是诚实的；不能把它向上汇总成真实 E2E 完成。
- evidence 的延期成功例使用受控 fixture 角色和日期；没测旧延期公告、同页多个作业、真实来源角色缺失。
- smoke-live-event 的 quoteOk 只看 quote 非空；不是语义支持验证。
- 同一 smoke 的 honestIfMissingFields 在缺字段时允许 `partial || fields.size > 0`，有任意字段也能满足，不能保证缺失项正确呈现。
- live smoke 不验证“两页分别贡献事实”或三条关键事实。terminal 枚举含 failed/cancelled；虽有其他断言，仍不能把 terminal 单项当成功。
- 无本次可证明的完整 UI E2E、三次连续真实主故事、刷新与 SSE 丢包验收。

## 初期计划对照

| 初期验收 | 当前判断 |
|---|---|
| 真实浏览、可见过程 | Steel 后端真浏览已验证；iframe 视觉未验证；fixture 事件语义需纠正 |
| 两页贡献三条事实、至少一日期 | 本次真实查询不达标；其他故事未据此宣告全失败 |
| 同对象不同措辞 | 已复现路由不一致，不达标 |
| Deadline Detective | 狭窄 fixture 成功，反例失败；真实浏览 fixture 未实现 |
| 官方/教师/学生分层 | demo 有局部实现，真实角色适配不足 |
| Coverage 诚实 | 后端能报 blocked；前端写死叙述和只显示首个 unknown 需要修正 |
| fixture/cache/replay 标签准确 | 存在模式校验漏洞、Live 恒定标签；不能验收 |
| 取消/超时/SSE 重连 | 后端有单测，前端端到端证据不足 |
| 三次连续完整主故事 | 本次没有达成，不应宣称已达成 |
| P1 最多两项、主线稳后再做 | 账号、工具选择、keychain 等已扩大范围；核心未稳 |

## 下一步，以获奖展示价值排序

后续唯一执行顺序见 `outputs/NEXT_EXECUTION_ORDER_2026-09-12.md`。下面的列表保留为审计结论，不再单独作为排期。

UI 的逐屏视觉审计和具体改造顺序见 `outputs/UI_CRITICAL_AUDIT_AND_CHANGE_PLAN_2026-09-12.md`。该报告已把 UI 工作纳入 Phase 0–3，并要求与 run 状态、mode、coverage、citation 和 cleanup 联调验收。

1. **立刻冻结新增功能，先恢复可信度。** A 修正假认证/验证码、Live/fixture 和写死来源文案；B 强制模式一致性与失败状态。验收：界面不宣称未发生的动作。
2. **B+D 打通一个真实有答案的问题。** 限定一个具体活动或课程问题，保证两页相关、第二页贡献事实、每条关键事实有原文。不能以页面数/HTTP 200 代替问答成功。
3. **D 修复真正差异化的更新判断。** 实体级 A1/A2、学校/学期、可信教师角色、更新关系与时间；不充分时明确 unresolved。把本报告反例写成期望正确行为的回归断言。
4. **C 把 fixture 主故事变成真正 LIVE_FIXTURE。** 云浏览器访问公开可达的自建虚构页，有真实 session 与原文；如来不及，明确标本地证据演示，不能演成真实浏览。
5. **A+B 完成用户可感知的故障恢复。** 断线续传、澄清恢复、取消确认、唯一启动入口。C 验证各终态释放。不要用额外动画掩盖等待。
6. **重新跑原计划 10 例和三次完整演示。** 错学期、权限失败、未解决冲突、模式标签等关键项必须全过；记录延迟、人工介入、失败原因。达到门槛后才考虑继续 polishing。

展示取舍：推荐只讲“跨页发现截止更新，并展示为何可信”，不要讲“校园所有信息、所有工具、自动管理账号”。若真实路径在冻结前仍无法产出有用答案，则按实际能力提交限定范围的 evidence demo，而不是扩大产品承诺。

本轮仅新增审计脚本、结果与报告；未修改业务实现、未推送代码、未改变现有服务或真实账户。真实 Web 仅自主执行了一轮公开页面查询。UI 未完成的验证明确列为未验证。
