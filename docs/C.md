# C — UTSG 浏览器：开工记录与网站清单

核验：2026-09-12。用户确认首版 UTSG，开工时剩余 24 小时；不要默认为 UTSG 所有学院共用 Arts & Science 规定。
仓库：Team-Chill-2026-9-12-Hackathon-Team/All-About；本地分支 feat/browser。检查 main 时仅有 README，共享契约尚未建立。

## 本轮交付

- `packages/browser/src/index.ts`：已实现 `collectPages(plan, emit, signal)`；真实 Steel SDK + Playwright，default context、固定公开页面、事件、逐页失败、单次重试、预算、取消与远端释放确认。
- `packages/browser/src/page-tools.ts`：exact-host HTTPS 白名单、可见正文和同源链接读取、阻断/登录识别、页面日期 metadata。
- `packages/browser/src/events-smoke.ts`：真实两页 QueryPlan 验收；写出完整 `BrowserBatch` 和脱敏摘要。
- `packages/browser/src/smoke.ts`：T+0–1h 的低层探针，保留用于站点诊断。
- `packages/browser/run-with-key.py`：macOS RTF 凭据启动器，只在内存解析并传入子进程；不复制密钥到仓库。
- 模块独立 package.json / tsconfig，未改根配置。临时本地安装依赖，无模块锁文件；B 建 workspace 时迁移到根统一锁文件。
- 已通过 TypeScript 检查、基础单元测试和真实两页 `collectPages` 验收。没有实现最终答案、自动候选链接选择或 UI viewer 播放。

依赖实装：steel-sdk 0.18.0、playwright 1.63.0、typescript 7.0.2、@types/node 22.20.2；Node 22.22.3。

```sh
# 在仓库根目录执行；安装只作用于 C 的模块
npm install --prefix packages/browser --no-package-lock
npm run typecheck --prefix packages/browser
python3 packages/browser/run-with-key.py /absolute/path/to/SteelKey.rtf
# 运行公共 collectPages 两页验收
python3 packages/browser/run-with-key.py /absolute/path/to/SteelKey.rtf smoke:collect
# 真实创建后在导航阶段取消，并验证远端释放
python3 packages/browser/run-with-key.py /absolute/path/to/SteelKey.rtf smoke:cancel
# 只测候选活动两页
SMOKE_SET=events python3 packages/browser/run-with-key.py /absolute/path/to/SteelKey.rtf
# 非 macOS：通过环境注入 STEEL_API_KEY，然后运行
npm run smoke --prefix packages/browser
```

本地结果在 `packages/browser/artifacts/`，已忽略：`collect-pages-batch.json` 是交给 D 的完整快照，`collect-pages-summary.json` 是脱敏验收摘要。READABLE 仅表示读取到足量正文，不表示问题已回答、字段抽取正确或网站全量接入。未保存 viewer/CDP URL。

## 网站清单

难度是工程估计：1 最容易、5 最困难。阅读正文、页面交互、权限条件分开判断；不能因为页面公开就推断已获批量采集或再分发授权。首版只做少量按需读取。

| 来源与入口 | 用途 | 难度 | 实测/依据与下一步 | 24h 优先级 |
|---|---|---|---|---|
| [A&S Academic Calendar](https://artsci.calendar.utoronto.ca/) | 课程介绍、prerequisite/exclusion、专业要求 | 1/5 | Steel 已读 CSC207/CSC148；HTML main 可提取，保留标题与字段边界 | P0 首选 |
| [CS department](https://web.cs.toronto.edu/undergraduate/courses) | 课程入口、院系说明、申请/奖学金 | 2/5 | 官网搜索验证；Steel 未测，跨站链接和日期需分别处理 | P0 候选 |
| [Hart House events](https://harthouse.ca/events/month) | 活动时间地点、参与条件、比赛规则 | 2–3/5 | Steel 已成功读取 Xplore 详情+规则两页；规则是多列比赛表，必须保留表头和列关系 | P0 活动首选候选 |
| [Student Life](https://www.studentlife.utoronto.ca/events/) | 服务、活动发现、资源入口 | 2/5 | Steel 可读入口；入口指向社交平台/Folio/CLNx，不等于具体活动详情已接入 | P0 辅助 |
| [UofT events](https://www.utoronto.ca/events) | 跨部门活动发现 | 2–3/5 | Steel 已读完整列表；跨域详情仍需逐站处理，必须使用 St. George 分类筛选 | P0 活动发现 |
| [Timetable Builder](https://ttb.utoronto.ca/) | 学期实际开课、section、时间地点等 | 4/5 | Steel 可读搜索表单；尚未完成 division/session 选择或课程搜索。官方说明它不检查个人选课资格、不执行选课 | P1，预留 2–4h 技术预算 |
| [A&S academic dates](https://www.artsci.utoronto.ca/current/dates-deadlines/academic-dates) | 选课/退课等学术日期 | 3–4/5 | web 阅读遇到人机验证；Steel HTTP200 但仅56字符，NO_MATCH。不能将状态码200写成采集成功 | 有界排查后再决定 |
| [The Varsity](https://thevarsity.ca/about/) | 校园新闻、学生视角 | 2–3/5 | 学生报纸，非教师政策；网页研究已核实，Steel/具体文章未测 | P1 背景补充 |
| [Reddit r/UofT](https://www.reddit.com/r/UofT/) | 学生经验、课程讨论 | 4–5/5 + 访问条件 | 未做 Steel 采集；需确认获准 API/数据访问。分页、排序、删帖、作者匿名、校区/学期混杂增加难度 | 首版外链，获准后接 |
| [Rate My Professors](https://www.ratemyprofessors.com/) | 教师评价、主观难度 | 4–5/5 + 许可条件 | 条款要求事先许可后自动访问；未做 Steel 采集。需处理教师同名、校区、评论年代和样本偏差 | 首版外链，获准后接 |
| [Quercus](https://q.utoronto.ca/) / [ACORN](https://www.acorn.utoronto.ca/) | 私有课程公告、个人选课信息 | 5/5 | 官方确认 UTORid 登录；尚无本项目授权会话和隔离验收，不使用本机登录态 | 后续独立连接器 |
| [ULife](https://www.ulife.utoronto.ca/organizations) | 社团发现 | 未定，暂估3/5 | 旧资料有入口；本次 web 无法打开，当前可用性未确认，不能当已可用数据源 | 暂缓 |

网站范围按 exact host 登记，不能简单允许所有 utoronto.ca 后缀。CS 官方域名是 web.cs.toronto.edu；Hart House 为 harthouse.ca。遇到链接/重定向时必须重新校验目标。

## 推荐首个活动 demo

当前稳定保底问题：Xplore Hart House 什么时候、在哪里，是否列为 UTSG 活动？

1. [UofT 活动列表](https://www.utoronto.ca/events)把 Xplore 列在 U of T St. George 下并给出日期。
2. [活动详情](https://harthouse.ca/events/xplore-hart-house/)提供日期、地点、活动时段及参与对象。

比赛规则页仍可作为加分来源，但实测出现间歇性 HTTP 403。给 D 的关键提醒：详情页时区字样为 EST，首版保留原文并交给 D 核验，不自行改写 UTC offset。UofT 总活动列表包含多个校区，必须用其 St. George 分类上下文判断适用范围。

## 24h 执行与待接接口

- 0–1h：key/session/CDP/两页读取/释放已有实测；iframe 的实际播放仍未验收。
- 1–3h：已完成。固定 QueryPlan 输出两张完整 PageSnapshot，两个页面都贡献可核对信息。
- 3–6h：公共函数、allowedHosts、失败分类、取消、总预算与清理已提前完成；待 B 发布正式契约后替换本地临时类型并联调。
- 6–12h：实际 viewer 联调；错误/取消/超时测试，锁定公开来源保底。
- 12–18h：受控课程三页；保底稳定后再选课表等加分项。
- 18–24h：现场网络、三轮重跑、20h冻结、22h固定展示、彩排。

给 B 的交接请求（文件记录，尚未发送）：建立 packages/contracts，落实计划中的 QueryPlan、PageSnapshot、BrowserSignal、SourceFailure、BrowserBatch；根 workspace 安装 steel-sdk/playwright 并统一锁版本。C 已实现公共函数，当前只需把集中在 `src/types.ts` 的临时类型替换为共享 import。

## 证据与限制

- [Calendar CSC207](https://artsci.calendar.utoronto.ca/course/csc207h1)、[CSC148](https://artsci.calendar.utoronto.ca/course/csc148h1)：真实 Steel 读取验证。
- [Timetable 官方说明](https://easi.its.utoronto.ca/student-information-systems/timetable-builder/)：数据覆盖与用途。
- [Reddit API terms](https://redditinc.com/policies/data-api-terms)、[Reddit 自动访问规则](https://support.reddithelp.com/hc/en-us/articles/360043512931-Don-t-break-the-site)：获准访问前提。
- [RMP terms](https://www.ratemyprofessors.com/terms-of-use)：事先许可要求。
- [UTORid](https://utorid.utoronto.ca/)：Quercus/ACORN 的登录关联。
- [Steel SDK](https://github.com/steel-dev/steel-node)：签名以已安装的0.18.0类型复核。

首次创建尝试和取消验收各出现一次 HTTP400；当前部署返回的明确原因是它不支持调用方自定义 sessionId，因为 ID 编码了调度器选择的区域。实现已按该部署要求改为使用 create 响应返回的 ID。若创建请求已到达但响应丢失，客户端无法得知该区域化 ID；这是当前清理能力的边界。还需连续重跑和真实 viewer 播放验证。

## 本轮实际测量

- 公共站点批次：2026-09-12 16:14 UTC，约17.6秒（含会话创建、5页访问、释放）；CSC207 584字符、CSC148 1047字符，Student Life入口1044字符、TTB入口1105字符；日期页56字符判NO_MATCH。
- 活动批次：2026-09-12 16:15 UTC，约6.6秒；Xplore详情9591字符、规则7636字符；均HTTP200。两批成功会话均retrieve确认released。
- 两次成功均收到viewer URL，但未播放验证。上述耗时是单次观察，不是性能保证；规则表的语义提取仍需单独验收。
- 公共函数验收：2026-09-12 16:27 UTC，约10.3秒；UofT Events 13920字符，Xplore详情9585字符。Hart House 首次请求被拦截，函数按预算重试后成功；2页、0最终失败、viewer事件和released清理均通过。
- 规则详情页和活动详情页在连续测试中都出现过间歇性403，因此保底改为每个域名只访问一页，并保留单次重试；仍需连续三轮稳定性验收。
- 移除自定义 sessionId 后，16:30 与 16:31 UTC 两轮公共函数验收均通过；后一轮 Hart House 使用一次重试，总耗时约11.6秒。执行中取消验收也通过：0页、CANCELLED、source_failed事件、cleanup=released。
