# B 共享契约待确认提案

日期：2026-09-12。状态：提案，尚未冻结。依据仅为项目 ZIP、当前仓库代码和本对话。

## P1：来源权威角色

缺口：`SourceConfig`/`PageSnapshot` 只有 `kind`，D 当前只能把所有 official 页面当作 institution，无法可靠区分 institution、instructor 与 TA。

建议：在受信任 registry 的 `SourceConfig` 增加 `authority` 和 `authorityBasis`，C 原样复制到每个 PageSnapshot；D 只消费该元数据，不根据页面措辞猜角色。

建议 JSON：

```json
{
  "authority": "instructor",
  "authorityBasis": "Registry entry identifies the course instructor announcement feed."
}
```

影响：B 更新 schema/examples；C 复制两个字段；D 删除 `official => institution` 的默认推断；A 可展示 authorityBasis，但不需要参与权重判断。建议作为 v1 必填字段变更，需 B/C/D 同意后实施。

## P2：清理状态与 viewer 生命周期

缺口：BrowserBatch 有 cleanup，但 RunSnapshot 没有；`viewer_ready` 含短期 URL，当前事件历史可在 viewer 关闭后继续补发。

建议：

- RunSnapshot 增加 `cleanup`: `not_started | active | released | not_created | release_failed`。
- B 收到 session_ready 后记录 active；C 返回 BrowserBatch 后记录实际 cleanup。
- `viewer_closed` 在 cleanup 已知后发送，reason 与 cleanup 一致；answer 完成和资源释放是两个不同状态。
- viewer URL 只发给当时的活动订阅者；收到 viewer_closed 后，历史补发不再包含 viewer_ready。不得写日志、回放文件或持久存储。
- release_failed 不显示“已释放”；P0 只允许重新发起新任务，不由 B 伪造释放成功。独立 retry 接口留到 P1。

影响：B 更新 RunStore/HTTP schema/SSE replay；C 保持最终 BrowserBatch.cleanup；A 依据 cleanup 显示浏览器状态并在 viewer_closed 后销毁播放器。需 A/B/C 同意后实施。

## P3：事实字段词汇

已在 B/D 集成分支采用：`QueryPlan.requestedFields` 表示事实字段，不是 UI 区块。当前允许规划器产生 `deadline`、`submission_format`、`eligibility`、`location`、`registration_process`、`contact`、`other`；D 当前只实现前两项，其余必须输出 unknown/partial，不可凭空回答。

影响：A 只消费 AnswerBundle 区块，无需读取 requestedFields；D 逐步扩展事实提取器。请 A/D 确认此语义，确认前不把 v1 称为正式冻结。

## 回复格式

```text
提案：P1 / P2 / P3
角色：A / C / D
结论：同意 / 修改建议 / 阻塞
字段或事件修改：
```
