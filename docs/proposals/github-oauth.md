# GitHub 登录（#15）— 设计与实现计划

> 状态：**草案 · 待确认**。对应任务 #15。**代码在 #17+#16 落地后再动**（会改到同一批
> LoginPage/RegisterPage/契约/i18n，避免与正在进行的用户名认证改动冲突）。
> 关联：#17（用户名为主）、#14（强制登录）。

## 1. 目标

- 登录页只保留 **GitHub** 一种第三方登录，**删除 Google / Apple 桩**（`OAuthButton`
  的 google/apple 分支与 i18n `auth.google`/`auth.apple` 一并移除）。
- GitHub 登录**真正可用**：授权跳转 → 回调换 token → 绑定/创建账号 → 前端落地会话。

## 2. 账号模型（与 #17 用户名体系对齐）

一个 GitHub 身份（`github_user_id`）唯一绑定一个 Lumo 账号：
- **已登录时点「连接 GitHub」**：把 GitHub 身份绑定到当前用户（账号页）。
- **未登录时用 GitHub 登录**：
  - 若该 `github_user_id` 已绑定某账号 → 直接登录该账号。
  - 若未绑定 → **创建新账号**：用户名取 GitHub `login`（冲突则加后缀，遵循 #17 用户名规则），
    `email` 为空（GitHub 邮箱**不自动信任**，需用户后续在账号页绑定并二次验证 —— 与 #17 一致，
    不因第三方就绕过邮箱验证）。同时签发一次性恢复码（与 #16 一致）。
- 存储：`users` 增 `github_user_id TEXT`（可空、唯一部分索引）。绝不存 GitHub access token
  超过换取用户信息所需；只留 `github_user_id` 做稳定关联。

## 3. 流程（Authorization Code，confidential client）

1. 前端点「使用 GitHub 登录」→ `GET /v1/auth/github/start`（后端生成随机 `state`，
   存服务端短期存储/签名 cookie，防 CSRF）→ 302 到 GitHub authorize：
   `https://github.com/login/oauth/authorize?client_id=…&redirect_uri=…&scope=read:user&state=…`
   - scope 仅 `read:user`（如需邮箱再加 `user:email`，但邮箱仍走二次验证，故 V1 只 `read:user`）。
2. GitHub 回调 `GET /v1/auth/github/callback?code=…&state=…`：
   - 校验 `state`（不符 → 400，防 CSRF）。
   - 用 `code` + `client_secret` 向 `https://github.com/login/oauth/access_token` 换 access token（后端，绝不暴露给前端）。
   - 用 token 调 `GET https://api.github.com/user` 取 `id`/`login`。
   - 按 §2 绑定或创建账号；签发 Lumo `token` + `refreshToken`。
   - 重定向回前端一个落地路由（如 `/oauth/github?token=…` 的安全交换，或设一次性 code）
     让前端存入会话 → 进入 app。
3. 失败（用户取消 / state 错 / GitHub 报错）→ 重定向回登录页并可读报错。

## 4. 安全

- `client_secret` 只在后端，走环境变量，绝不入库/返回/日志。
- `state` 随机 + 单次 + 短期，绑定到会话，回调必校验（CSRF）。
- 回调 SSRF 面：仅请求固定 GitHub 域名常量，不接受用户传入 URL。
- 复用 `authRateLimit` 限流；`audit("auth.github.*")` 记录（不含 token）。
- 令牌交换失败/GitHub 5xx → `httpError`，可读文案。
- 前端落地时的 token 传递避免出现在浏览器历史/日志：优先「一次性交换 code」而非 URL 明文 token。

## 5. 契约（契约优先）

- `error.ts` 新增：`OAUTH_STATE_INVALID`(400)、`OAUTH_EXCHANGE_FAILED`(502)、
  `GITHUB_ACCOUNT_LINKED`(409，该 GitHub 已绑定别的账号且当前已登录冲突)。
- 若 start/callback 返回结构化 JSON（而非纯重定向），定义其响应 schema；纯重定向则仅错误码入契约。

## 6. 后端

- `routes/auth.ts`（或新 `routes/oauthGithub.ts`）：`/github/start`、`/github/callback`。
- `lib/githubOauth.ts`：`buildAuthorizeUrl(state)`、`exchangeCode(code)`、`fetchGithubUser(token)`。
- 迁移：`users` 加 `github_user_id`（可空）+ `CREATE UNIQUE INDEX … WHERE github_user_id IS NOT NULL`。
- 账号页「连接/断开 GitHub」端点（鉴权）。

## 7. 前端

- `OAuthButton`：删除 `google`/`apple`（含 ICONS 两项与 i18n）。GitHub 去掉 `comingSoon`，
  `onClick` → 跳 `/v1/auth/github/start`（整页跳转）。
- 新增 GitHub 回调落地路由/页，交换会话后进入 app。
- `LoginPage`/`RegisterPage`：只留 GitHub 一颗按钮（**在 #17 改完表单后再接线**）。
- 账号页：显示 GitHub 连接状态 + 连接/断开。
- api client + store（`startGithubLogin`/`completeGithubLogin`/`linkGithub`/`unlinkGithub`）+ i18n(en/zh) + 组件测试。

## 8. 测试

- 后端：state 校验、回调换取（mock GitHub HTTP）、新建 vs 绑定、已绑定冲突、限流。
- 前端：按钮渲染/跳转、回调落地、账号页连接态。
- 契约：新错误码。

## 9. 需要你（运营方）提供 —— 可并行准备

1. **创建一个 GitHub OAuth App**（Settings → Developer settings → OAuth Apps）：
   - Homepage URL：生产站点（如 `https://lumo-task-frontend.onrender.com`）。
   - **Authorization callback URL**：`{后端域名}/v1/auth/github/callback`
     （生产后端 `https://lumo-task-backend-1c3x.onrender.com/v1/auth/github/callback`；
     本地/预览各自再加一条，GitHub OAuth App 可多回调或用多个 App）。
   - 拿到 **Client ID** 和 **Client Secret**。
2. **配置环境变量**（后端，勿入库/前端）：
   - `LUMO_GITHUB_CLIENT_ID`
   - `LUMO_GITHUB_CLIENT_SECRET`
   - `LUMO_GITHUB_CALLBACK_URL`（或由 `LUMO_APP_BASE_URL`/后端域名推导）
3. 决策点：桌面端(Electron)是否也支持 GitHub 登录？桌面无公网回调，通常走
   系统浏览器 + 自定义协议回跳（`lumo://`）或本地回环端口。**建议 V1 仅 Web 支持
   GitHub 登录，桌面维持用户名/密码**，回调复杂度留到后续。请确认。

## 10. 未配置时的降级

未设 `LUMO_GITHUB_CLIENT_ID` 时：后端 `/github/start` 返回 501/未启用，前端按钮
自动隐藏或回落 `comingSoon`，以免生产上点了报错。
