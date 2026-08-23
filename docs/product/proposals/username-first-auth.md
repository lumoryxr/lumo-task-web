# 用户名为主的注册 / 登录 + 邮箱后绑定验证

> 状态：**草案 · 待确认**。对应任务 #17。定稿后再动契约与代码。
> 关联：#14（强制登录 + 多本地用户隔离）、#16（找回模型：邮箱 + 恢复码）。

## 1. 目标

- **注册只要用户名**：注册表单只收 `username + password`，**完全不涉及邮箱**。
- **邮箱后绑定**：注册后在“账号页/引导”里可绑定邮箱，绑定**必须二次验证**（确保归属本人）。未绑定不阻断任何功能。
- **恢复码**：注册时同时签发一次性恢复码（见 #16），作为无邮箱账号的找回锚点。

## 2. 用户名规则

- 唯一（大小写不敏感唯一：存 `username` 原样 + `username_lower` 唯一索引）。
- 字符集：`[a-zA-Z0-9_-]`，长度 3–32，不以 `-`/`_` 开头或结尾。
- 保留字黑名单：`admin`、`root`、`lumo`、`support`、`system` 等。
- 前端即时校验（可用性检查端点可选，注意限流防枚举）+ 后端权威校验。

## 3. 邮箱绑定（复用已建基础设施）

邮箱验证基础设施已由邮箱验证 PR（#456）落地，可直接复用：
- 已有：`email_verification_tokens`（只存哈希、单次、24h）、`lib/emailVerification.ts` 签发/消费、`POST /v1/auth/verify-email`、`POST /v1/auth/resend-verification`、`VerifyEmailBanner`、`/verify-email` 页。
- 改造点：把“注册时自动发信”改为“**用户主动绑定邮箱时**发信”。流程：账号页填邮箱 → 签发令牌发信 → 用户点链接 `/verify-email` → 翻转 `email_verified` → 邮件找回通道（#16 路径 A）点亮。
- 约束：一个邮箱同一时刻只绑定一个账号（`email` 唯一，允许为空）；换绑需重新验证。

## 4. 契约变更（契约优先）

- `User` / `UserProfileWire`：新增 `username`（必填）；`email` 变为**可选/可空**；保留 `emailVerified`。
- 注册请求：由 `{ email, password }` → `{ username, password }`。
- 登录请求：`{ username, password }`（`identifier` 亦可，先按 username）。
- 新增用户名校验错误码：`INVALID_USERNAME`、`USERNAME_TAKEN`、`USERNAME_RESERVED`。
- 注册响应：附带一次性 `recoveryCode` 明文（见 #16，仅此一次）。

## 5. 后端

- `users` 表：加 `username`、`username_lower`（唯一索引）；`email` 允许 NULL 且唯一（部分索引）。
- 注册：校验用户名唯一 → 建账号 → 签发恢复码（存哈希）→ 返回恢复码明文一次。
- 登录：以 `username_lower` 查账号、校验密码；`emailVerified` 照常返回。
- 绑定邮箱端点（鉴权）：设置/更换 email（未验证态）→ 触发验证发信。
- 复用限流、`httpError`、审计日志。

## 6. 前端

- `RegisterPage`：邮箱字段移除，改为用户名（即时校验 + busy 态）；成功后进入恢复码展示页（#16 §3）。
- `LoginPage`：邮箱输入改用户名；占位/标签/自动填充（`autocomplete="username"`）与 i18n（en/zh）同步。
- 账号页：新增「绑定/更换邮箱」（走验证流程）与「邮箱状态」展示；`VerifyEmailBanner` 逻辑改为“已绑定但未验证”时才提示。
- api client + store（`register`/`signIn` 签名调整、`bindEmail`）+ i18n + 组件测试。

## 7. 迁移（既有邮箱账号并存）

- 存量账号只有 email 没有 username：
  - 方案：为存量账号**回填 username**（如从 email 本地部分派生并去重加序号），首次登录引导其确认/修改用户名；email 标记为已验证（沿用邮箱验证 PR 的回填策略）。
  - 过渡期登录**兼容 email 或 username 均可**登录，降低打扰；新注册一律 username。
- 迁移脚本 + 回滚说明；对 `username` 唯一冲突有确定性处理。

## 8. 测试（四层）

- **契约**：`username` 校验、`email` 可空、注册/登录请求形状、新错误码。
- **后端**：用户名注册/唯一冲突/保留字/大小写；登录；邮箱绑定→验证→翻转；迁移回填。
- **前端**：注册表单（无邮箱、恢复码展示门槛）、登录用用户名、账号页绑定邮箱。
- **契约一致性 + E2E**：注册（纯用户名）→ 拿恢复码 → 绑定邮箱 → 验证 → 邮件找回可用。

## 9. 交付顺序

1. 本方案文档确认。
2. 契约（username + email 可选 + 错误码 + 注册响应含恢复码）。
3. 后端（schema/迁移/注册/登录/绑定）。
4. 前端（注册/登录/账号页/恢复码展示）。
5. 四层测试 + 迁移脚本。
