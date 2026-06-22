<!-- GitLab Issue Template: Story（用户故事）。新建 Issue 时在 "Choose a template" 选 Story。 -->

# 📖 Story: <Title>

## 用户故事 / User Story

**As a** <角色 / role>
**I want to** <功能 / capability>
**So that** <价值 / benefit>

## 背景 / Background

简要描述为什么需要这个功能。(Why this is needed.)

## 验收标准 / Acceptance Criteria

> 每条 AC 必须可测 —— 它们会直接转成测试用例。

- [ ] 用户可以 [操作]
- [ ] 系统显示 [结果]
- [ ] [约束条件] 满足

## 定义完成 (DoD) / Definition of Done

- [ ] 契约先行：API 变更先改 `@lumo/contracts`，`make ci` 一致性测试通过
- [ ] TDD 红→绿→重构，测试覆盖主流程 + 边界 + 错误
- [ ] 覆盖率 ≥ 80% (backend) / 新前端组件 ≥ 100%
- [ ] 双端 typecheck + ESLint 全过
- [ ] i18n 双语 key、CSS token（无硬编码颜色）
- [ ] CHANGELOG 已更新
- [ ] MR 已合并到 `main`，流水线全绿

## 测试用例 / Test Cases

### 主流程 / Happy Path
- 给定 … 当 … 那么 …

### 边界 / Edge Cases
- 给定 … 当 … 那么 …

### 错误处理 / Error Handling
- 给定 … 当 … 那么 …

## 技术细节 / Technical Details

- **契约变更**：…（Zod schema / OpenAPI）
- **后端**：…（端点 / DB / 中间件）
- **前端**：…（组件 / store / API client）

## 优先级 / Priority

- [ ] P0 紧急  - [ ] P1 高  - [ ] P2 中  - [ ] P3 低  - [ ] P4 未来

## 工作量 / Effort

- [ ] XS (<4h)  - [ ] S (4-8h)  - [ ] M (1-2d)  - [ ] L (2-3d)  - [ ] XL (>3d)

/label ~feature ~needs-triage
