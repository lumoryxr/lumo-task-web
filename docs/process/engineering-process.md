# Engineering Process (GitLab) — Lumo Task

世界级、契约先行、TDD 强制的端到端开发流程。迁移自原 GitHub Actions，现运行在 GitLab CI/CD。

## 角色链

```
PM → Architect(含契约) → Engineer(全栈) → Reviewer(审+改) → QA(E2E+安全) → Release
```

定义见 `.claude/agents/*.md`。两条硬卡口：**契约先行**（API 变更先改 `@lumo/contracts`）、**AC = tests**（验收标准直接转测试）。

## 端到端流程（一个需求一条龙）

1. **PM** — 把需求写成 Issue（用 `Story` 模板）或 `docs/product/specs/<feature>.md`：用户故事 + 可测 AC + 优先级 + 成功指标。
2. **Architect** — 涉及 API 先改 `@lumo/contracts`（Zod schema），必要时加 ADR。
3. **Engineer** — 建分支 `feat/<slug>`，TDD 红→绿→重构，遵守 i18n 双语、CSS token、`httpError` 规范、conventional commits。
4. **QA** — 单元测试 + Playwright E2E 覆盖每条 AC；安全检查（鉴权/输入/密钥）。后端覆盖率 ≥80%。
5. 本地全绿（见下）→ push 分支自动建 MR（`Closes #<issue>`）。
6. **Reviewer** — 审 MR，能直接修就改并 push。
7. 流水线全绿 + 审核通过 → 合并到 `main`。

## 本地门禁（等价 `make ci`，提交前必跑）

```bash
# 契约
( cd packages/contracts && npm ci --include=dev && npm test && npm run build )
# 后端
( cd backend && npm ci --include=dev && npm run typecheck \
  && npm run test:coverage && npm run test:security && npm run test:standards )
# 前端
( cd web-app && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --include=dev \
  && npm run typecheck && npm run lint && npm test && npm run build )
```

## GitLab 流水线（`.gitlab-ci.yml`）

- **门禁（stage test/build/gate）**：13 个 job（前端 typecheck/lint/Vitest/build、Playwright、后端 typecheck/build/api+覆盖率/security/standards/integration、contracts、npm audit）→ `ci` 聚合 job。
- **Release（stage release）**：推 `v*` tag 自动建 GitLab Release。
- **Windows 打包（stage package）**：手动 job，自建 Windows runner（tag `windows`）；`Run pipeline` 加变量 `VERSION_LABEL=1.2.3` 触发。

## 需在 GitLab 项目里启用的门禁设置（一次性）

1. **Settings → Merge requests** → 勾 **Pipelines must succeed** + **All threads must be resolved**。
2. **Settings → Repository → Protected branches** → `main`：禁止 force push，Allowed to merge = Maintainer。
3. **Settings → CI/CD → Runners** → 确认 Linux shared runner 开；注册自建 Windows runner（tag `windows`）。
4. （Premium）启用 **Code Owner approval** 让 `CODEOWNERS` 生效。

## 开 MR（无需 Web UI）

```bash
git push -o merge_request.create \
         -o merge_request.target=main \
         -o merge_request.title="feat: <title>" \
         gitlab feat/<slug>
```
