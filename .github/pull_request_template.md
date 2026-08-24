## 变更说明 / Change Summary

> 用 1-3 句话描述本次 PR 做了什么，以及为什么。(Describe what this PR does and why, in 1-3 sentences.)

## 变更类型 / Change Type

- [ ] Bug 修复 (Bug Fix) — 不破坏现有功能的修复
- [ ] 新功能 (Feature) — 不破坏现有功能的新增能力
- [ ] 破坏性变更 (Breaking Change) — 会影响现有功能或 API 的修复或功能
- [ ] 重构 (Refactor) — 不改变外部行为的代码改进
- [ ] 文档/配置 (Documentation/Config)

## 相关的 ECC Skills / Related ECC Skills

> 在编码前是否使用了相关的 ECC skills? (Did you consult relevant ECC skills before coding?)

- [ ] `/ecc:coding-standards` — 新文件或显著重构
- [ ] `/ecc:frontend-patterns` — React 组件或 hooks 相关
- [ ] `/ecc:backend-patterns` — 新 API 端点或数据库操作
- [ ] `/ecc:api-design` — 新 API 设计
- [ ] `/ecc:error-handling` — 异常处理或 fallback
- [ ] `/ecc:tdd-workflow` — TDD 流程
- [ ] `/ecc:security-review` — 认证、输入验证、Secrets 相关
- [ ] `/ecc:e2e-testing` — 端到端测试
- [ ] 无 (N/A)

## TDD 完成度 / TDD Checklist

> 是否遵循 Red → Green → Refactor 流程? (Did you follow TDD: test first, then implement?)

- [ ] 编写了测试用例，测试优先 (Tests written first)
- [ ] 所有新功能的测试全部通过 (All tests pass)
- [ ] 测试覆盖了主流程和边界情况 (Main flow and edge cases covered)
- [ ] 重构后测试仍然通过 (Tests still pass after refactoring)

## 预检查清单 / Pre-submission Checklist

- [ ] `npm run typecheck` 通过 (TypeScript check passes)
  ```bash
  cd web-app && npm run typecheck  # 或 cd backend && npm run typecheck
  ```
- [ ] `npm run lint` 通过 (ESLint passes)
  ```bash
  cd web-app && npm run lint
  ```
- [ ] 所有 `npm test` 通过 (Tests pass)
  ```bash
  cd web-app && npm test  # 或 cd backend && npm test
  ```
- [ ] 无新增的 `// eslint-disable` 或 `// @ts-ignore` 注释
- [ ] 遵循 [CLAUDE.md](/CLAUDE.md) 的架构规则
  - 前端：类型定义、组件结构、CSS tokens、状态管理
  - 后端：错误处理、数据库查询、中间件、认证
- [ ] 更新了 [CHANGELOG.md](/CHANGELOG.md)（如果是功能新增、Bug 修复或破坏性变更）

## 自测清单 / Self-test Checklist

- [ ] 本地 `make dev-full` 启动正常，功能可用 (Local dev environment works)
- [ ] 功能已在浏览器/应用中实际测试 (Manually tested in browser/app)
- [ ] 已覆盖新功能的主流程和边界情况 (Main flow and edge cases tested)
- [ ] 无明显的性能问题 (No obvious performance regressions)

## 截图 / Screenshots (如有 UI 改动 / If UI changed)

| Before | After |
|--------|-------|
| 粘贴之前的截图 | 粘贴之后的截图 |

## 关联 Issue / Closes

关联到此 PR 解决的 Issue:
Closes #<issue-number>

## Code Review 注意事项 / Notes for Reviewers

> 如有特殊的实现细节或需要额外关注的地方，请说明 (Any special implementation details or areas needing extra attention)

-

---

### 检查清单 / Reviewer Checklist
_此部分由 Reviewer 填写 (Filled by Reviewer)_

- [ ] 代码遵循 CLAUDE.md 规则
- [ ] 测试覆盖率达标 (≥80% backend, ≥100% new frontend components)
- [ ] 没有安全问题 (no hardcoded secrets, proper input validation)
- [ ] 向后兼容或标记为 Breaking Change
- [ ] CHANGELOG 已更新

参考 [PR_REVIEW_CHECKLIST.md](PR_REVIEW_CHECKLIST.md) 获取完整的审查标准。
