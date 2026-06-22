<!-- GitLab MR Template（默认）。用 git push -o merge_request.create 时自动套用。 -->

## 变更说明 / Change Summary
> 1-3 句话：做了什么、为什么。

## 变更类型 / Change Type
- [ ] Bug 修复  - [ ] 新功能  - [ ] 破坏性变更  - [ ] 重构  - [ ] 文档/配置

## TDD / 质量门禁
- [ ] 测试优先（Red → Green → Refactor）
- [ ] 契约先行：API 变更已先改 `@lumo/contracts`
- [ ] `backend`: typecheck + test:coverage(≥80%) + test:security + test:standards 全过
- [ ] `web-app`: typecheck + lint + test + build 全过
- [ ] i18n 双语 key、CSS token（无硬编码颜色）
- [ ] 无新增 `// @ts-ignore` / `// eslint-disable`
- [ ] CHANGELOG 已更新（功能/修复/破坏性变更）

## 关联 / Closes
Closes #<issue-number>

## Reviewer 注意事项
> 需要额外关注的实现细节。

---
### Reviewer Checklist
- [ ] 遵循 `CLAUDE.md` 架构规则
- [ ] 覆盖率达标、无安全问题（密钥/输入校验/鉴权）
- [ ] 向后兼容或已标记 Breaking Change
- [ ] 流水线全绿
