# GitHub 登录 & 邮件配置手册（VPS）

> 面向 **GitHub Actions 部署** 的自托管场景：`.github/workflows/deploy-vps.yml`
> 每次部署都会 **从本仓库的 Secrets/Variables 渲染出 `/opt/lumo/deploy/vps/.env`**，
> 再 `pull + up -d`。所以这两项功能的配置 **填在 GitHub 里**，不要在服务器上手改
> `.env`（下次部署会被覆盖）。完整部署说明见
> [`vps-deployment.md`](./vps-deployment.md)；本文只聚焦两件最容易忘的事：**GitHub
> 登录** 和 **邮件**。

把下文出现的 `app.example.com` 全部替换成 **你的真实域名**。

---

## 名词：两个不同的「GitHub 位置」

配置时会涉及两个完全不同的页面，别混淆：

| 简称 | 页面 | 用途 |
|---|---|---|
| **OAuth App** | `https://github.com/settings/developers` → OAuth Apps | 在这里 **创建应用、拿到** Client ID / Client Secret |
| **仓库配置** | 仓库 → Settings → Secrets and variables → **Actions** | 把拿到的值 **填进来**，部署时会写入服务器 `.env` |

仓库配置页有两个标签页：**Secrets**（加密、日志脱敏，放敏感值）和 **Variables**
（明文存储，放非敏感值）。下表会标明每个变量该放哪个标签。

---

## 一、GitHub 登录

工作原理：三个变量都配齐后，后端 `GET /v1/auth/github/config` 才返回
`githubEnabled:true`，前端登录页才会显示「用 GitHub 登录」按钮；**缺任何一个，按钮就
隐藏**（这就是「突然选不了 GitHub 登录」的典型原因）。

### 步骤 1 — 创建 GitHub OAuth App（拿凭据）

打开 **`https://github.com/settings/developers` → OAuth Apps → New OAuth App**，填：

| 字段 | 值 |
|---|---|
| Application name | `Lumo Task`（随意） |
| Homepage URL | `https://app.example.com` |
| **Authorization callback URL** | `https://app.example.com/v1/auth/github/callback` |

> ⚠️ Callback URL 必须与下面的 `LUMO_GITHUB_CALLBACK_URL` **一字不差**（协议、域名、
> 路径 `/v1/auth/github/callback` 都要对上），否则 GitHub 会拒绝回调。

创建后：
- 复制 **Client ID**；
- 点 **Generate a new client secret**，复制 **Client Secret**（只显示一次，立即复制）。

### 步骤 2 — 填进仓库配置

仓库 → Settings → Secrets and variables → **Actions**：

| 名称 | 标签页 | 值 |
|---|---|---|
| `LUMO_GITHUB_CLIENT_ID` | **Variables** | 步骤 1 的 Client ID |
| `LUMO_GITHUB_CALLBACK_URL` | **Variables** | `https://app.example.com/v1/auth/github/callback` |
| `LUMO_GITHUB_CLIENT_SECRET` | **Secrets** 🔒 | 步骤 1 的 Client Secret |

同时确认 `LUMO_APP_BASE_URL`（**Variables**）= `https://app.example.com`（它是回调
来源与邮件链接的基地址，通常在初次部署时已设好）。

---

## 二、邮件（Resend）

工作原理：后端事务邮件（**邮箱验证**、**密码重置**）走 `sendEmail()`。只有
`LUMO_EMAIL_PROVIDER=resend` + `LUMO_RESEND_API_KEY` + `LUMO_EMAIL_FROM` 三者齐全才
真正投递；否则生产环境会 **静默丢弃**（为防账号枚举，接口不暴露投递状态）。后端有
启动守卫：**只配一半会导致容器启动即报错崩溃**（安全失败，不会带病上线），所以三项
要么都填、要么都不填。

### 步骤 1 — Resend 侧

1. 在 [resend.com](https://resend.com) 注册，**验证一个你自己的发件域**（按提示添加
   DNS 记录：SPF + DKIM，建议再加 DMARC）。
   > ⚠️ 生产别用 Resend 的测试域（`onboarding@resend.dev` 之类）——它只能发给你自己
   > 的注册邮箱，真实用户收不到。
2. 创建一个 **API Key**（形如 `re_xxx`）。

### 步骤 2 — 填进仓库配置

仓库 → Settings → Secrets and variables → **Actions**：

| 名称 | 标签页 | 值 |
|---|---|---|
| `LUMO_EMAIL_PROVIDER` | **Variables** | `resend` |
| `LUMO_EMAIL_FROM` | **Variables** | `Lumo <no-reply@app.example.com>`（发件人须在已验证域内） |
| `LUMO_RESEND_API_KEY` | **Secrets** 🔒 | 步骤 1 的 `re_xxx` |

确认 `LUMO_APP_BASE_URL`（**Variables**）已指向 `https://app.example.com`——邮件里的
验证/重置链接靠它拼接，缺失会拼成 `localhost` 而失效。

---

## 三、让配置生效

改完 GitHub 的 Secrets/Variables **不会自动生效**，跑一次部署即可（它会重新渲染
`.env` 并重启容器）：

**仓库 → Actions → 「Deploy to VPS」工作流 → Run workflow**

---

## 四、验证

```bash
# 1) GitHub 登录是否启用（期望 true）
curl https://app.example.com/v1/auth/github/config
# → {"githubEnabled":true}

# 2) 邮件：先在应用里触发一次「忘记密码」，再到服务器看日志是否走了 resend
/opt/lumo/deploy/vps/lumo.sh logs | grep '"transport":"resend"'
```

- GitHub 登录：回到登录页点按钮，走完 GitHub 授权后应跳回
  `https://app.example.com/#/oauth/github?code=...` 然后进入应用。
- 邮件：目标邮箱应收到「Verify your Lumo email」/「Reset your Lumo password」。

---

## 五、排错速查

| 现象 | 最可能原因 | 处理 |
|---|---|---|
| 登录页没有 GitHub 按钮 | 三个 `LUMO_GITHUB_*` 缺一，`/config` 返回 `false` | 补齐后重新部署；用上面的 `curl` 确认 |
| `curl` 返回 `true` 但按钮仍不显示 | 前端拿到的 API 基址或 CORS 不对（多见于 SPA 与 API 不同源） | 检查 `VITE_API_BASE` 与 `LUMO_ALLOWED_ORIGINS`（单进程镜像同源，通常无需设） |
| GitHub 授权后报 redirect_uri 不匹配 | OAuth App 的 callback 与 `LUMO_GITHUB_CALLBACK_URL` 不一致 | 两处改成完全一致 |
| 容器启动即崩、日志提 `LUMO_EMAIL_*` | `provider=resend` 但缺 key 或 from（启动守卫拦截） | 三项补齐或全部清空 |
| 邮件收不到、日志无 `transport:"resend"` | 生产未配 provider，走了静默 no-op | 配齐 Resend 三项后重新部署 |
| 邮件进垃圾箱 | 发件域缺 SPF/DKIM/DMARC | 在 Resend 后台按提示补全 DNS |

> 没有邮件也不至于把人锁死：注册（含 GitHub 注册）都会发一次性 **recovery code**，
> 可通过 `/auth/recovery/reset` 离线重置密码；邮箱验证是非阻塞提示，不影响基本使用。

---

## 附：变量速查

| 变量 | 标签页 | 必填 | 用途 |
|---|---|---|---|
| `LUMO_APP_BASE_URL` | Variables | 是 | 回调来源 + 邮件链接基地址 |
| `LUMO_GITHUB_CLIENT_ID` | Variables | GitHub 登录 | OAuth App 的 Client ID |
| `LUMO_GITHUB_CALLBACK_URL` | Variables | GitHub 登录 | `https://<域名>/v1/auth/github/callback` |
| `LUMO_GITHUB_CLIENT_SECRET` | Secrets 🔒 | GitHub 登录 | OAuth App 的 Client Secret |
| `LUMO_EMAIL_PROVIDER` | Variables | 邮件 | 固定为 `resend` |
| `LUMO_EMAIL_FROM` | Variables | 邮件 | `Name <addr@已验证域>` |
| `LUMO_RESEND_API_KEY` | Secrets 🔒 | 邮件 | Resend API Key |

完整的变量清单（数据库、日志、AI、监控等）见
[`vps-deployment.md` §3.1](./vps-deployment.md#31-one-time-setup--github-managed-config)
与 [`deploy/vps/.env.example`](../../deploy/vps/.env.example)。
