# 贡献指南

欢迎为 lumo-task-web 项目贡献代码、报告问题或改进文档！本指南介绍了我们的开发流程、角色分工和技术规范。

## 开发流程全景

```
Issue 提出 → Issue 分类 → 需求拆解 → Feature 分支开发 → PR 审查 → Merge → 发布
```

### 1️⃣ 提出问题（Issue 作者）

提交 Issue 时请：
- 选择合适的模板（Bug / Feature Request / Documentation / Epic）
- 清晰描述问题或需求
- 提供复现步骤或使用场景
- 附上截图/日志（如适用）

### 2️⃣ 问题分类（Issue Triage 团队）

Triage 责任人负责：
- 添加标签（类型、优先级、部分）
- 评估问题重要性和工作量
- 拆解大需求为多个子任务（Epic → Story → Task）
- 分配优先级（P0-P4）
- 分配给开发者或标记为 `help-wanted`

**Triage 责任人**: @jalenforwu

### 3️⃣ 开发（开发者）

开发者负责：
- 从 issue 创建特性分支（遵循命名约定）
- 基于 CLAUDE.md 编写代码
- 遵循 TDD 流程：测试优先 → 实现 → 重构
- 保证所有测试和类型检查通过
- 提交 PR，通过 CI 检查

### 4️⃣ 审查（Code Reviewer）

Reviewer 负责：
- 检查代码质量、测试覆盖、安全问题
- 验证 CLAUDE.md 规则遵循情况
- 检查 CHANGELOG 是否更新
- Approve 或 Request Changes
- 将 PR 合并到 main

### 5️⃣ 发布（Release Manager）

Release Manager 负责：
- 管理版本号和 CHANGELOG
- 创建 Release Notes
- 发布新版本和构建产物

---

## 分支命名约定

遵循以下约定创建特性分支（从 `main` 分支切出）：

```
feature/<feature-name>     # 新功能
fix/<bug-name>             # Bug 修复
docs/<docs-name>           # 文档更新
refactor/<refactor-name>   # 代码重构
test/<test-name>           # 测试改进
ci/<workflow-name>         # CI/CD 改进
chore/<task-name>          # 杂务（依赖更新等）
```

**示例**：
- `feature/dark-mode`
- `fix/memory-leak-in-api`
- `docs/api-reference`
- `refactor/extract-hooks`

---

## Commit 消息格式

遵循 **Conventional Commits** 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type（必需）

- **feat**: 新功能
- **fix**: Bug 修复
- **docs**: 文档修改
- **style**: 代码样式改变（不影响逻辑）
- **refactor**: 代码重构（不改变功能）
- **test**: 添加或修改测试
- **ci**: CI/CD 配置或脚本改变
- **chore**: 依赖更新、构建工具更新等

### Scope（可选）

影响范围，如：`frontend`、`backend`、`api`、`db`、`ci`

### Subject（必需）

- 使用祈使语气（"add" not "added"）
- 首字母大写
- 不以句号结尾
- 中文或英文均可

### Body（可选）

- 解释 **why**，不是 **what**
- 每行不超过 72 字符
- 多行时用空行分隔

### Footer（可选）

- 关联 Issue：`Closes #123`
- Breaking Change：`BREAKING CHANGE: description`

### 示例

```
feat(api): add task completion endpoint

Users can now mark tasks as completed via PATCH /api/tasks/:id/complete.
The response includes updated task state and completion timestamp.

Closes #456
```

```
fix(frontend): correct form validation delay

Replace setInterval with debounce(500) to avoid rapid re-renders
during user input in the task creation form.

BREAKING CHANGE: validateForm() signature changed to async
```

---

## Issue 优先级标签

| 标签 | 含义 | 响应时间 | 示例 |
|------|------|--------|------|
| **P0** | 紧急，服务中断或严重数据丢失 | < 24h | 用户数据被删除；服务完全不可用 |
| **P1** | 高优先级，重要功能损坏 | < 48h | 核心功能失效；安全漏洞 |
| **P2** | 中等优先级，普通功能缺陷 | < 1 周 | 特定场景下的 Bug；界面显示问题 |
| **P3** | 低优先级，改进和优化 | < 2 周 | 性能优化；用户体验改进 |
| **P4** | 考虑中，想法阶段 | 无时间限制 | 未来规划；讨论中的功能 |

---

## Issue 标签体系

### 类型标签

- `bug`: Bug 报告
- `feature`: 新功能请求
- `documentation`: 文档相关
- `question`: 问题咨询
- `help-wanted`: 寻求社区帮助
- `good-first-issue`: 适合新贡献者

### 生命周期标签

- `needs-triage`: 等待 triage 团队分类
- `needs-info`: 等待 issue 作者提供更多信息
- `needs-repro`: 需要复现步骤或示例代码
- `stale`: 30 天无活动，即将关闭
- `wontfix`: 决定不修复
- `duplicate`: 重复的 issue

### 部分标签

- `frontend`: web-app 相关
- `backend`: backend API 相关
- `ci`: CI/CD 流程相关
- `infra`: 基础设施相关
- `devops`: 运维相关

### 技术栈标签

- `typescript`: TypeScript 相关
- `react`: React/前端框架相关
- `node`: Node.js/后端相关
- `database`: 数据库相关
- `security`: 安全相关

---

## PR 检查清单

创建 PR 前，请确保：

- [ ] **遵循分支命名约定**（feature/xxx、fix/xxx 等）
- [ ] **基于 issue 编码**（PR 关联一个 issue）
- [ ] **Commit 消息遵循规范**（Conventional Commits）
- [ ] **代码遵循 CLAUDE.md**（架构规则、测试、类型检查）
- [ ] **所有本地检查通过**（typecheck、lint、test）
- [ ] **测试覆盖率达标**（backend ≥80%, frontend 新组件 100%）
- [ ] **无新的 ESlint 警告**（无 disable 注释）
- [ ] **无硬编码 secrets**（API 密钥、密码等）
- [ ] **更新 CHANGELOG**（if 实质性更改）
- [ ] **截图/视频**（if UI 改动）

PR 模板中会自动提示这些检查项。

---

## Code Review 标准

详见 [PR_REVIEW_CHECKLIST.md](PR_REVIEW_CHECKLIST.md)

Code Reviewer 会重点检查：
1. **代码质量**：CLAUDE.md 合规、可读性、坏味道
2. **测试覆盖**：是否有充分的测试
3. **类型安全**：无 `any`、无 `// @ts-ignore`
4. **安全性**：输入验证、SQL 注入防护、Secrets 泄漏
5. **向后兼容**：API 变更是否标记为 breaking change
6. **性能**：是否有明显的性能回归

---

## 本地开发环境

### 环境要求

- Node.js 20+
- npm (with workspace 支持)
- Git
- Make（可选，用于简化命令）

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/lumoryxr/lumo-task-web.git
cd lumo-task-web

# 安装依赖
npm install

# 启动开发环境
make dev-full

# 运行本地检查
make ci
```

### 常用命令

```bash
# 前端相关
cd web-app
npm run typecheck          # TypeScript 检查
npm run lint               # ESLint 检查
npm test                   # 运行前端测试
npm run build              # 构建生产版本

# 后端相关
cd backend
npm run typecheck          # TypeScript 检查
npm test                   # 运行 API 测试
npm run test:integration   # 运行集成测试
npm run build              # 构建后端

# 整体检查
make ci                    # 等价于 npm run typecheck && npm run lint && npm run build && npm test
```

---

## 问题排查

### CI 流程中失败的检查

#### typecheck 失败
```bash
cd web-app && npm run typecheck
cd backend && npm run typecheck
```
修复 TypeScript 类型错误。

#### lint 失败
```bash
cd web-app && npm run lint
npm run lint -- --fix     # 自动修复可修复的问题
```

#### 测试失败
```bash
cd backend && npm test
cd web-app && npm test
npm run test -- --watch   # 监听模式，实时重新运行
```

#### 安全审计失败
```bash
cd web-app && npm audit --omit=dev
cd backend && npm audit
npm audit fix              # 尝试自动修复
```

---

## 获取帮助

- **问题在线讨论**：在 Issue 中提出具体问题
- **代码审查建议**：查看 PR 评论和建议
- **架构决策讨论**：参考 [.github/adr](adr/) 中的决策记录
- **项目规范**：查看 [CLAUDE.md](/CLAUDE.md) 和 [ARCHITECTURE.md](/ARCHITECTURE.md)

---

## 我们感谢所有的贡献！

感谢你为 lumo-task-web 项目的改进做出的贡献。无论是代码、文档、Bug 报告还是建议，都对我们的项目发展至关重要。
