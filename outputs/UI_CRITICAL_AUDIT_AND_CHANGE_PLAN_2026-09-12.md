# AllAbout Campus UI 独立审计与改造计划

日期：2026-09-12。审计对象为本机 `http://127.0.0.1:5174` 实际运行页面。

## 审计方式和边界

先前的 Codex 内置浏览器因 loopback 安全策略返回 `ERR_BLOCKED_BY_CLIENT`。本轮改用已授权的 macOS CuaDriver 控制 Chrome 后台窗口，已实际完成：登录页 → 工具选择页 → Course Desk → DEMO101 结果页。每次操作前后均重新读取窗口状态并留存截图。

- `ui-audit-login-desktop.png`
- `ui-audit-tools-desktop.png`
- `ui-audit-desk-desktop.png`
- `ui-audit-demo-clean.png`

这是桌面端实测。响应式结论来自 CSS 和 DOM 审查，尚未完成独立手机视口截图，因此不能把移动端列为视觉验收通过。

## 总评

视觉完成度高于产品完成度。第一眼像成熟校园 SaaS，第二眼却难以迅速回答三个评委问题：它刚才真的做了什么、结论是什么、为什么值得相信。

当前风格的主要问题不是丑，而是“过度产品化”：登录、工具选择、背景插画、颜色系统、动效、历史、Keychain 和工具配置建立了一个宽产品的承诺；真正有获奖辨识度的查证、冲突处理和原文证据反而被压缩在左侧滚动区。页面在努力表现完整，却没有把唯一应被记住的能力放到视觉中心。

## 风格问题

### P0 — 视觉语言与核心命题错位

登录页的蓝紫橙渐变、工具页四种强调色、工作台低饱和校园插画分别像三个产品。品牌共同点只剩 `a.` 和深蓝色。工具页颜色最活跃，却是最不该成为展示高潮的页面；核心结果页反而灰、淡、小。

改造方向：统一为深海军蓝 + 证据青色 + 语义状态色。橙色只用于需要确认，红色只用于失败，紫色不承担新业务类型。减少大面积渐变和背景装饰，把颜色预算用于 `Verified / Updated / Unknown / Blocked / Fixture`。

### P0 — 结果信息层级倒置

DEMO101 结果页中，左侧最显眼的是四步流程、三来源 chips、Coverage 和活动记录；真正的“9 月 20 日”需要向下滚动。首屏能看到很多过程，却看不到一句完整结论。

改造方向：终态后把回答卡置顶并固定展示：一句结论、大号日期、旧→新变化、权威来源、未确认项。过程默认折叠为一行 receipt；展开后再看详细事件。

### P0 — 右侧占据多数面积却没有产生相应信息价值

空态右侧用约一半屏幕展示 “Watch three sites at once”。fixture 终态则出现三个窄栏，重复标题、URL、`CAPTURED` 和同一句 framing 说明。真正的 quote 被挤成窄文本。用户需要左右来回寻找“哪条证据支持哪条结论”。

改造方向：运行中右侧显示单个真实 Live Viewer；终态切换为 Evidence Workspace。默认展示当前被引用的来源原文，并用 source tabs 切换，不同时展开三个伪浏览器窗格。引用点击应联动右侧来源、定位 quote、高亮原句。

### P1 — 字体过小、对比过淡、信息密度虚高

大量状态、来源、底部说明采用 9–11px 淡灰文字。1440px 桌面截图中已经需要靠近阅读；投影或录屏会更差。较大的留白没有换来更清晰的字号，反而容纳了更多弱标签。

改造方向：正文最低 14px，关键状态 12px，避免 9–10px 承担重要含义；提升灰字对比；删除无法影响决策的辅助文案。以 1280×720 投影可读为最低演示标准。

### P1 — 圆角、阴影与装饰细节过多，缺少明确主动作

卡片、chip、圆点、描边、渐变、阴影、动画几乎每个区域都有。单个元素精致，组合后却像 UI kit 展示。主输入和证据引用没有获得明显高于设置、历史和 Keychain 的视觉优先级。

改造方向：减少容器层级和圆角种类；头部只保留品牌、真实模式、历史。把 Keychain 和 motion 放入次级菜单。一个屏幕保持一个主要动作。

### P1 — 品牌语言泛化

“Campus answers. Without the hunt.” 和 “One less thing to figure out.” 易读但缺乏技术差异。任何校园搜索产品都能使用。最有差异的 Deadline Detective、权威更新关系和 Coverage Receipt 没成为主语言。

改造方向：主标题直接描述结果，例如 “Know which deadline is current—and why.” 副文案说明 “Checks syllabus, announcements, and student discussion without mixing policy with opinion.”

## 作用与联调问题

### P0 — `LIVE_FIXTURE` 标签存在，但行为语言仍伪装成 live

fixture 没有 Steel session，UI 却展示 `Opening the live page`、`Reading visible text`、`Live sources reviewed`、`Live browsing`，并对 fixture URL 使用 “Campus sites block being framed here”。这是目前最危险的 UI 诚信问题。

改造方向：后端事件必须带 executionKind，前端严格映射：

| 模式 | 运行中标签 | 终态说明 |
|---|---|---|
| LIVE_WEB | Live web | Steel session released at… |
| LIVE_FIXTURE + Steel | Live demo pages | Fictional content, real browser execution |
| LOCAL_FIXTURE | Local demo data | No browser session was created |
| REPLAY | Recorded run | Recorded at… |

目前合约没有 LOCAL_FIXTURE，需要 B 与 A 一起决定新增模式，或用 execution/cleanup 字段明确区分。不能继续只信用户提交的 mode。

### P0 — 状态之间互相矛盾

实测 fixture 终态同时出现：`Partial answer ready`、`Viewer unavailable`、`Live sources reviewed`、`Waiting for viewer_ready`、`Live browsing`。这不是文案小瑕疵，而是前端没有由一个真实状态机决定所有标签。

改造方向：建立单一 `PresentationState`，由 run.status、mode、viewerUrl、viewerClosed、cleanup、answer/coverage 推导。所有 header、footer、空态、toolbar 和 badge 只能消费这一状态，禁止各自独立猜测。

### P0 — 输入区显示错误上下文

DEMO101 完成后，输入框下仍固定显示 `CSC207H1 · LIVE_WEB`，与当前 run 的 `DEMO101 · LIVE_FIXTURE` 冲突。评委会认为结果与问题上下文没有锁定。

改造方向：composer 显示当前继承 scope；新任务时显示 Auto-detect。点击追问后显示 `Following DEMO101 · Assignment 2`。上下文来自后端 snapshot/parent，不再硬编码。

### P0 — Coverage UI 混合“计划覆盖”和“实际覆盖”

左侧 Coverage 使用前端 catalog 和 blueprint 推断，右侧来源卡又使用 run 事件与 answer。用户无法分辨计划打开、正在访问、已读、blocked 和未选择。

改造方向：后端返回唯一 coverage receipt；前端只额外显示 `not selected`。每个来源必须具备实际状态、失败原因、内容模式、抓取时间及贡献的 claim 数。没有 `source_checked` 不能显示为 reviewed。

### P0 — Citation 没有完成“结论到证据”的空间联动

引用按钮虽然存在，但主结论不总是紧邻引用；终态右侧又同时展示多个来源。用户点击后缺少清晰的“这句话由这里支持”关系。

改造方向：每条 claim 一行：结论 → 权威标签 → 引用编号。点击时右侧只选中对应 source，滚到 quote，并用短暂高亮；顶部同时显示来源日期和适用 scope。键盘焦点也要移动到证据标题。

### P1 — 假登录流程干扰产品并触发浏览器密码体验

实测登录会触发 Chrome 保存密码/泄露密码提示，因为页面使用真正的 password autocomplete 语义，却没有真正认证。它既增加演示步骤，也带来意外系统弹窗，遮挡结果页。

改造方向：黑客松版删掉账号密码表单，改为 `Enter demo workspace`；如果一定要保留，关闭真实密码管理语义并明确 `Local demo profile`。真正认证进入赛后范围。

### P1 — 工具选择承诺了未实现功能

Timetable alerts、Study plan、Important notices 的卡片与选择动画非常完成，容易让评委要求现场展示；当前主功能仍是 Course Desk。这是展示面主动制造的攻击面。

改造方向：比赛版本直接进入 Course Desk。其他能力移到 “Next” 小区块或完全隐藏。若保留工具页，只有已完成能力可交互，未来功能显示 `Roadmap` 且不可选。

### P1 — 终态 `partial` 没说明哪些部分成功

DEMO101 因 late penalty 未知而显示 Partial，视觉上像整个答案失败；真实网页查询得到零 claim 也显示 Partial。两者严重程度完全不同。

改造方向：结果状态拆成 `Answer found + 1 unresolved item`、`No supported answer found`、`Some sources blocked`。状态由 confirmed claim 数、unknown 数、coverage 决定，不能用一个 partial 覆盖所有情况。

## 应加入下一步执行计划的 UI 工作

完整跨模块执行顺序已经统一到 `outputs/NEXT_EXECUTION_ORDER_2026-09-12.md`。本节保留 UI 细化要求；如果顺序与总表冲突，以总表为准。

### Phase 0：真实性修复，必须先做

负责人 A+B，目标 1–2 小时。

1. 去掉假登录/验证码和工具选择阻塞，比赛入口直接进入 Course Desk。
2. 引入统一 PresentationState，修复所有互相矛盾的状态文案。
3. composer 改用真实 run scope/mode；Coverage 只显示后端事实。
4. 明确区分 LOCAL_FIXTURE、真实 Steel fixture、LIVE_WEB、REPLAY。
5. DEMO101 终态不得再出现 `Opening live page` 或 `Live sources reviewed`。

验收：给评委任意截图，所有模式、来源、viewer、cleanup 和 answer 状态互不矛盾。

### Phase 1：重构核心演示信息架构

负责人 A+D，目标 2–3 小时。

1. 终态把 Answer Hero 放在左侧顶部：当前日期、旧日期、更新理由、权威来源。
2. research 流程默认折叠；保留一行 Coverage Receipt。
3. 右侧终态改为单来源 Evidence Workspace；引用点击完成联动定位。
4. 所有 unknowns 完整呈现并按重要性排序，不只显示第一条。
5. 区分 “有答案但有缺口” 与 “没有找到可信答案”。

验收：在 5 秒静态截图测试中，陌生人能指出结论、依据、未确认项和运行模式。

### Phase 2：视觉系统收敛

负责人 A，目标 1–2 小时。

1. 统一色彩和字体层级；删除无语义的紫色、橙色装饰。
2. 重要文本不低于 12px；投影关键文字不低于 14px。
3. 移除背景大字和非必要校园线稿，扩大有效内容区域。
4. 缩减 header：品牌、scope、模式、历史；设置和 Keychain 放次级入口。
5. 动画只保留运行状态和引用高亮，并遵守 reduced motion。

验收：1280×720、1440×900、窄屏三种视口；无重要信息截断，无双重滚动迷失。

### Phase 3：UI × 后端行为验收

负责人 A+B+C+D，目标 2 小时。

必须实际跑：

1. LIVE_WEB 有答案；LIVE_WEB 无答案；一页 blocked。
2. LOCAL_FIXTURE；真实 Steel fixture；REPLAY。
3. SSE 中断后恢复；刷新处于 needs_input 的 run；取消和 cleanup failure。
4. 引用跳转；多个 unknown；unresolved conflict；superseded deadline。
5. 三次连续 120 秒主故事。

记录每轮首个进度时间、答案时间、模式、人工介入、最终状态。截图测试必须和 API snapshot 对照，避免 UI 自己生成“成功”。

## 建议的比赛版首屏

```text
┌ AllAbout Campus | DEMO101 · Fall 2026 | LOCAL DEMO DATA ┐
├────────────────────────┬────────────────────────────────┤
│ Question               │ Evidence                       │
│                        │ Instructor announcement         │
│ A2 deadline changed?   │ Published Sep 12 · Instructor  │
│                        │                                │
│ Sep 20 · 5:00 PM       │ “...extended and now due...”   │
│ Updated from Sep 18    │            [highlighted quote] │
│ [Instructor notice 2]  │                                │
│                        │ [Syllabus] [Announcement] [Post]│
│ Unknown: late penalty  │                                │
│ Coverage: 3/3 checked  │                                │
├────────────────────────┴────────────────────────────────┤
│ Ask a follow-up…                         [Send]          │
└─────────────────────────────────────────────────────────┘
```

这个布局把“结论—更新—证据—未知”放在同一视线内。浏览过程仍可展开，但不再抢夺结果的主视觉位置。

## 完成定义

UI 改造完成不等于 CSS build 通过。必须同时满足：视觉截图清楚、AX 语义可读、后端状态一致、引用可定位、模式真实、断线/取消/缺失场景不会制造成功。直到 Phase 0–3 全部验收前，不建议继续加入新页面或新功能。
