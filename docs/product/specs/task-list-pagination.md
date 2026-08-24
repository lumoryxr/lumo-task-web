## PM · 需求分析 (PRD)

### 背景 / 问题
`GET /v1/tasks`(以及 completed/people/habits 等列表)当前返回**某用户的全部行,无上限**(`SELECT ... WHERE user_id=? ORDER BY created_at ASC`,直接 `rows.map(rowToTask)` 成裸数组)。

- 重度用户(几千条任务)单次请求返回**几 MB JSON**,后端要把整集物化进内存并逐行 Zod 校验 → 高延迟、内存压力、OOM/DoS 风险。
- 客户端无法翻页、无法增量加载。
- 这是生产化检视里的 **P1**(规模化天花板)。

### 目标
对列表读取做**有界、可分页**,稳定排序、翻页不重不漏、尽量向后兼容。

### 范围
- **本增量(增量 1):仅 `GET /v1/tasks`**(未完成列表 + `q` 搜索两条路径)。
- 确立可复用的游标分页模式,后续增量推广到 `completed / people / habits / countdowns`。

### 不在范围(后续增量)
- 前端无限滚动 / 「加载更多」UI(单独增量)。
- 其余列表端点(沿用本增量模式)。
- 排序字段可配置。

### 验收标准 (AC,均可测)
- **AC-1** `GET /v1/tasks?limit=N` 最多返回 N 条。
- **AC-2** 响应提供「下一页游标」;`?limit=N&cursor=<c>` 返回紧接的下 N 条,与上一页**无重叠、无遗漏**。
- **AC-3** 排序在翻页间**稳定且确定**(keyset 游标,`created_at` 相同以 `id` 兜底),并发插入不导致错乱。
- **AC-4** 即使不传 `limit` 也强制**默认上限**(≤ 200),杜绝无界响应。
- **AC-5** `limit` 校验(1..200),非法 → 400;`cursor` 非法/伪造 → 400(不泄露信息)。
- **AC-6** 搜索 `q` 与分页**可组合**。
- **AC-7**(安全)分页严格**租户隔离**:用户 A 的 cursor 不能读到用户 B 的行;最后一页 `nextCursor=null`。
- **AC-8** 查询走索引,无全表扫描(EXPLAIN 验证,复用现有 `idx_tasks_user_completed_created`)。
- **AC-9** 向后兼容策略由 Architect 决策并写明(老客户端不传 `limit/cursor` 仍能工作)。

### 成功指标
- 单次响应大小有界(≤ N 条),不再随用户数据量线性增长。
- 大账号 p99 延迟显著下降;`GET /v1/tasks` 无全表扫描。
- 老前端零改动仍可用(兼容策略落地)。

### 待 Architect 决策(下一阶段)
- 游标式(keyset)vs 偏移式(offset):倾向 keyset(无偏移漂移、配合索引)。
- 响应形态:裸数组 → 信封 `{ items, nextCursor }` 是**破坏性契约变更**(前端 `api.listTasks` 现返回 `Task[]`)。需在「信封 + 改前端」与「默认上限 + 可选游标/不破坏形态」之间取舍,出 ADR。
- 契约先行:改 `@lumo/contracts` 的 `TaskListQuerySchema` + 新增列表响应 schema。

---
> 需求分析按规范回写 issue。Architect/契约/TDD/QA/检视将在对应 PR 下进行(检视意见记录在 PR 下)。
