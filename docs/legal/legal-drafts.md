# 服务条款 & 隐私政策 — 初稿（Draft）

> ⚠️ **草稿 · 待法务审阅（DRAFT — pending legal review）**。本文件是可先上线占位的初稿，
> 参考业界常见结构撰写，**不构成法律意见**；正式发布前需由法律顾问审阅并按经营主体、
> 适用司法辖区、支付/订阅模式补全。对应任务 #18。
>
> 已存在完整法律**整页** `web-app/src/pages/legal/TermsPage.tsx` / `PrivacyPage.tsx`；
> 本稿在其基础上：①对齐 username-only 方向（注册不强制邮箱，邮箱可选、用于找回/通知）；
> ②补第三方（Resend、GitHub OAuth）、本地优先与同步、数据导出/删除等条目。
> UI 侧要的是**登录/注册页点击弹窗（Modal）**，见文末 §UI。
>
> 占位信息：生效日期 `{{EFFECTIVE_DATE}}`、主体 `{{COMPANY_ENTITY}}`、联系邮箱
> `{{CONTACT_EMAIL}}`、适用法律/管辖 `{{GOVERNING_LAW}}` — 上线前替换。
>
> 子处理方清单 / DPA 起点见 [`subprocessors.md`](./subprocessors.md)(#472)。

---

## 一、服务条款 / Terms of Service

**生效日期 / Effective date：{{EFFECTIVE_DATE}}**

### 1. 条款的接受 / Acceptance
- **ZH：** 注册账号或使用 Lumo Task（“本服务”），即表示你已阅读并同意本服务条款与隐私政策。若不同意，请勿使用。
- **EN:** By creating an account or using Lumo Task (the “Service”), you agree to these Terms and the Privacy Policy. If you do not agree, do not use the Service.

### 2. 你的账号 / Your account
- **ZH：** 注册仅需用户名与密码，**无需邮箱**。你可自愿绑定邮箱以启用邮件找回密码与通知；绑定需通过验证。你须妥善保管用户名、密码及**恢复码**，并对账号下的一切活动负责。恢复码是无邮箱时找回账号的唯一凭据，请离线妥善保存。
- **EN:** Registration requires only a username and password — **no email is required**. You may optionally link a verified email to enable email-based password recovery and notifications. You are responsible for safeguarding your username, password, and **recovery code**, and for all activity under your account. The recovery code is the only way to recover an account without a linked email — store it safely offline.

### 3. 可接受的使用 / Acceptable use
- **ZH：** 不得试图破坏安全、干扰服务、逆向或未授权访问他人数据；不得将服务用于违法用途。你对自己创建的内容及使用 AI 功能的方式负责。
- **EN:** Do not attempt to breach security, disrupt the Service, reverse engineer, or access others’ data without authorization, or use the Service unlawfully. You are responsible for your content and for how you use any AI features.

### 4. 你的内容与所有权 / Your content
- **ZH：** 你保留对自己创建内容（任务、项目等）的所有权。Lumo 是**本地优先**产品：桌面端数据默认保存在你的设备本地；仅在你启用同步时才上传至我们运营的云端用于跨设备同步。
- **EN:** You retain ownership of the content you create (tasks, projects, etc.). Lumo is **local-first**: on desktop, your data is stored locally on your device by default and is uploaded to our operated cloud only when you enable sync for cross-device use.

### 5. AI 功能 / AI features
- **ZH：** 部分功能（如智能分类）可能将相关内容发送至第三方模型服务处理。是否启用由你决定；请勿在 AI 功能中输入你不希望外传的敏感信息。
- **EN:** Certain features (e.g., smart classification) may send relevant content to third-party model providers for processing. Use is at your discretion; do not enter sensitive information you do not wish to transmit.

### 6. 第三方服务 / Third-party services
- **ZH：** 我们使用第三方以提供功能：**Resend**（发送验证/找回等邮件）、**GitHub OAuth**（第三方登录，若你选择）。其数据处理受各自条款约束。
- **EN:** We use third parties to provide features: **Resend** (verification/recovery emails) and **GitHub OAuth** (optional sign-in). Their processing is governed by their respective terms.

### 7. 服务可用性 / Availability
- **ZH：** 公测期间本服务按“现状/可用”提供，可能随时变更、暂停或停用某些功能。建议你定期使用导出功能自行备份。
- **EN:** During beta the Service is provided “as is” / “as available”; features may change, be suspended, or discontinued at any time. Keep your own backups via the export feature.

### 8. 责任限制 / Limitation of liability
- **ZH：**（占位，待法务）在法律允许的最大范围内，Lumo 不对因使用本服务产生的任何间接、附带或后果性损害负责。
- **EN:** (Placeholder — pending counsel.) To the maximum extent permitted by law, Lumo is not liable for indirect, incidental, or consequential damages arising from use of the Service.

### 9. 终止 / Termination
- **ZH：** 你可随时在「账号 → 危险区」删除账号。对违反本条款的账号，我们可暂停或终止。
- **EN:** You may delete your account anytime via Account → Danger zone. We may suspend or terminate accounts that violate these Terms.

### 10. 条款变更 / Changes
- **ZH：** 我们可能更新本条款，重大变更将通过应用内或（若已绑定邮箱）邮件通知。变更后继续使用即视为接受。
- **EN:** We may update these Terms; material changes will be notified in-app or by email (if linked). Continued use constitutes acceptance.

### 11. 联系方式 / Contact
- **ZH：** 主体 {{COMPANY_ENTITY}}；联系 {{CONTACT_EMAIL}}；适用法律 {{GOVERNING_LAW}}。
- **EN:** Entity {{COMPANY_ENTITY}}; contact {{CONTACT_EMAIL}}; governing law {{GOVERNING_LAW}}.

---

## 二、隐私政策 / Privacy Policy

**生效日期 / Effective date：{{EFFECTIVE_DATE}}**

### 1. 我们收集什么 / What we collect
- **ZH：**
  - **账号**：用户名、密码哈希、恢复码哈希；**邮箱为可选**（绑定后保存并标记验证状态）。
  - **你的内容**：任务、项目、设置等（本地优先；启用同步才入云）。
  - **技术数据**：为运行与排障产生的日志（时间、错误、粗粒度使用，尽量最小化）。
  - 我们**不出售**你的个人数据。
- **EN:**
  - **Account**: username, password hash, recovery-code hash; **email is optional** (stored with verification status once linked).
  - **Your content**: tasks, projects, settings (local-first; in cloud only if sync is enabled).
  - **Technical data**: operational/diagnostic logs (timestamps, errors, coarse usage), minimized.
  - We **do not sell** your personal data.

### 2. 如何使用 / How we use it
- **ZH：** 提供与维护功能、账号验证与找回、发送你请求或必要的通知、保障安全与排障、依法合规。
- **EN:** To provide/maintain features, verify and recover accounts, send requested or necessary notices, ensure security and debugging, and comply with law.

### 3. 存储与位置 / Storage & location
- **ZH：** 桌面端数据默认存于本地设备；启用同步后，同步数据存于我们运营的云端。密码与恢复码只存哈希；服务端存储的密钥类信息经加密。
- **EN:** Desktop data is stored locally by default; when sync is enabled, synced data resides in our operated cloud. Passwords and recovery codes are stored only as hashes; server-side secrets are encrypted at rest.

### 4. 共享 / Sharing
- **ZH：** 仅在为提供功能所必需时与处理方共享：Resend（邮件）、GitHub（OAuth，若使用）、AI 模型服务（若启用）；或依法要求时。除此之外不对外共享。
- **EN:** Shared only with processors necessary to provide features — Resend (email), GitHub (OAuth, if used), AI providers (if enabled) — or as required by law. Not otherwise shared.

### 5. 你的权利 / Your rights
- **ZH：** 你可随时**导出**（账号页）与**删除**（危险区）你的数据。删除账号将移除关联的账号与内容记录及令牌/恢复码。
- **EN:** You can **export** (Account page) and **delete** (Danger zone) your data anytime. Deleting your account removes associated account/content records and tokens/recovery codes.

### 6. 数据保留 / Retention
- **ZH：** 账号存续期间保留你的数据；删除后在合理技术周期内清除（备份轮替除外）。日志按有限期限留存后清除。
- **EN:** Data is retained while your account exists and purged within a reasonable technical window after deletion (excluding backup rotation). Logs are kept for a limited period, then removed.

### 7. 未成年人 / Children
- **ZH：** 本服务不面向 {{MIN_AGE}} 岁以下未成年人；如你认为未成年人向我们提供了数据，请联系我们删除。
- **EN:** The Service is not directed to children under {{MIN_AGE}}. If you believe a minor provided us data, contact us to delete it.

### 8. Cookie / 本地存储 / Cookies & local storage
- **ZH：** 我们使用本地存储保存登录令牌与偏好；不用于第三方广告追踪。
- **EN:** We use local storage for auth tokens and preferences; not for third-party ad tracking.

### 9. 变更与联系 / Changes & contact
- **ZH：** 政策更新将在应用内公示；疑问请联系 {{CONTACT_EMAIL}}。
- **EN:** Updates are posted in-app; questions to {{CONTACT_EMAIL}}.

---

## §UI — 登录页弹窗接线（实现说明）

- 在 `LoginPage` / `RegisterPage` 底部加一行：「继续即代表同意 **服务条款 · 隐私政策**」，两词为按钮。
- 点击 → 打开 **Modal**（符合布局规范：header 带真实 **X** 关闭按钮，`Esc` 仅为便捷），内容复用现有 `TermsPage`/`PrivacyPage` 的 section 数据。
- 建议把 `LegalLayout` 的 SECTIONS 抽为共享数据源，整页与弹窗共用，避免两处维护。
- 待办：把上面对齐后的文案回填进 `TermsPage.tsx`/`PrivacyPage.tsx`（现有 Terms 第 2 条“须提供有效邮箱”与 username-only 冲突，需改为“邮箱可选”）。
- i18n（en/zh）、CSS token、组件测试（弹窗打开/关闭/内容渲染）。
