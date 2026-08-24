---
name: Story (用户故事)
description: 可交付的用户故事，包含验收标准和测试
labels: ["feature", "needs-triage"]
---

# 📖 Story: <Title>

## 用户故事 / User Story

**As a** <角色 / role>
**I want to** <功能 / capability>
**So that** <价值 / benefit>

示例 / Example:
- As a user, I want to mark tasks as completed, so that I can track my progress.

## 背景 / Background

简要描述为什么需要这个功能。

(Brief description of why this feature is needed.)

## 验收标准 / Acceptance Criteria

列出这个 Story 完成的条件：

(List the conditions for this story to be complete)

- [ ] 用户可以 [操作]
- [ ] 系统显示 [结果]
- [ ] [约束条件] 满足
- [ ] 

## 定义完成 (DoD) / Definition of Done

以下条件都满足才能标记为完成：

(The story is done when all of these are true)

- [ ] 代码已编写并 review 通过
- [ ] 单元测试 / 集成测试全部通过，覆盖率 ≥ 80% (backend) / 100% (new frontend components)
- [ ] 代码遵循 [CLAUDE.md](/CLAUDE.md) 架构规则
- [ ] TypeScript check 和 ESLint 全部通过
- [ ] UI 改动已在浏览器中验证（如适用）
- [ ] CHANGELOG 已更新
- [ ] 文档已更新（如适用）
- [ ] PR 已合并到 main

## 测试用例 / Test Cases

描述应该编写的测试：

(Describe the tests that should be written)

### 主流程 / Happy Path
- 给定 [前置条件]
- 当 [用户操作]
- 那么 [预期结果]

### 边界情况 / Edge Cases
- 给定 [前置条件]
- 当 [边界条件]
- 那么 [预期结果]

### 错误处理 / Error Handling
- 给定 [错误情况]
- 当 [触发条件]
- 那么 [错误处理]

## 技术细节 / Technical Details

### 前端变更 (如适用)
- 新增的 React 组件
- 状态管理的变更
- API 调用的变更

### 后端变更 (如适用)
- 新增的 API 端点
- 数据库 schema 的变更
- 业务逻辑的实现

### 数据库变更 (如适用)
- 新增的表或字段
- 迁移脚本

## 关联的 Issue / Related

关联的 Epic 或其他 Story：

(Link to related Epic or other Stories)

- Epic: [#XXX](link)
- 依赖的 Story: [#XXX](link)
- 被依赖的 Story: [#XXX](link)

## 优先级 / Priority

选择一个优先级标签：

(Select one)

- [ ] P0 - 紧急 (Critical)
- [ ] P1 - 高 (High)
- [ ] P2 - 中 (Medium)
- [ ] P3 - 低 (Low)
- [ ] P4 - 考虑中 (Future consideration)

## 工作量估计 / Effort Estimation

估计完成此 Story 需要的工作量：

(Estimate the effort to complete this story)

- [ ] XS (< 4 小时)
- [ ] S (4-8 小时)
- [ ] M (1-2 天)
- [ ] L (2-3 天)
- [ ] XL (> 3 天)

## 相关文档 / References

- [设计文档 / Design Doc](link)
- [原型 / Prototype](link)
- [API 文档 / API Spec](link)

## 备注 / Notes

添加任何其他相关信息：

(Add any other relevant information)

---

> Note: Story 应该由开发者创建 Task（如果工作量较大）。详见 [CONTRIBUTING.md](../CONTRIBUTING.md)
