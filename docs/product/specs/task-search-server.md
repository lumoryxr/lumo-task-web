# PRD — Server-side Task Keyword Search

- **Status:** In delivery
- **Author:** PM (automated engineering pipeline)
- **Slice:** First vertical slice of "Task Search" (M1), server side.

## 1. 需求分析 / Problem

当前关键词搜索只在前端对**已加载的全量任务缓存**做内存过滤（`CommandPalette`）。这在任务量大、或未来服务端分页/多设备同步场景下不可扩展：客户端不一定持有全部任务。需要一个**服务端**搜索能力作为可扩展基础。

## 2. 用户故事 / User Story

**As a** Lumo Task 用户
**I want to** 通过关键词在服务端搜索我的任务（标题或描述）
**So that** 即使任务很多、或客户端未缓存全部数据，也能快速定位到目标任务。

## 3. 验收标准 / Acceptance Criteria（= 测试依据）

- [ ] `GET /v1/tasks?q=<kw>` 返回标题**或**描述（中英双语列）包含 `<kw>` 的未完成任务。
- [ ] 匹配**大小写不敏感**。
- [ ] 不传 `q` 时行为与原来完全一致（返回全部未完成任务）。
- [ ] 用户输入中的 LIKE 通配符（`%` `_` `\`）按**字面量**处理，不作为模式。
- [ ] 无匹配返回空数组 `[]`。
- [ ] `q` 超长（>200 字符）在路由边界返回 `400`。
- [ ] 每个返回项符合 `@lumo/contracts` 的 `TaskWireSchema`。
- [ ] 仅返回**当前用户**的任务（鉴权 + 用户隔离）。

## 4. 范围 / Scope

- **In:** 契约 `TaskListQuerySchema`、后端 `GET /tasks` 搜索、后端测试、前端 `api.listTasks(q?)` 能力。
- **Out（后续切片）:** 把 `CommandPalette` 切到服务端搜索（当前内存过滤 UX 良好，保留）；全文索引/相关性排序；高亮。

## 5. 成功指标 / Success Metrics

- 搜索接口 P95 延迟 < 50ms（demo 数据量级）。
- 关键词命中准确率 100%（AC 覆盖）。

## 6. 非功能 / Non-functional

- **安全:** 参数化绑定，无 SQLi；通配符转义；输入长度上限。
- **契约先行:** 查询参数 schema 落在 `@lumo/contracts`，后端 `zValidator("query", …)` 消费。
