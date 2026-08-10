# 商用前待办清单（Pre-Launch TODO）

> 本清单由一次端到端审计整理而成,覆盖:后端 / 前端 / 数据库 schema / 外部集成 / 合规运维五个维度。
> 严重级别以**向真实付费用户收费**为基准。每项标注:**为什么**、**证据(文件)**、**最终方案**、**粗略工作量**。
>
> 图例:🔴 收费硬阻断 · 🟠 上线前必须 · 🟡 规模化/收费相关 · 🟢 清理/打磨 · ✅ 已达标(无需返工)

## 进度 / Progress（滚动更新）

**已完成(已进 PR):**
- 🔴 §一.1 收费体系 → 简化为「免费 + GitHub 捐赠」;移除 Pro/Coming-soon 桩,落地页定价改为 Support 卡,Account 页加安全外链(`rel=noopener noreferrer` + 常量 URL)。
- 🔴 §一.3 邮件 → Resend 已配置;新增 boot 断言(`email-policy.ts`):provider 设了但凭据不全就拒绝启动,并修复 `email.ts` 大小写不一致导致的静默丢邮件路径。
- 🔴 §一.4 法律 → 隐私/条款按最佳实践定稿(免费+捐赠+beta 模型、命名子处理方 Render/Turso/Resend/GitHub、GDPR 权利),删除草稿横幅与占位联系方式。
- 🔴 §一.2 持久化 → web 版已接 Turso(用户完成)。
- 🟡 §四.1 AI 云配额非原子自增 → 改为单条原子 SQL(含月度滚动)。
- 🟡 §四.2 共享 AI key 无花费上限 → 新增全局月度计数表 `ai_cloud_global` + `LUMO_AI_CLOUD_GLOBAL_CAP` 上限。
- 🟡 §五.2 无优雅关闭 → 加 SIGTERM/SIGINT 排空 + 硬超时兜底。
- 🟡 §三.8 `tasks.project_id` 缺索引 → 已加 `idx_tasks_user_project`。
- 🟡 §三.9 FK-by-convention → `oauth_handoffs` 补入 `USER_SCOPED_TABLES`,并加 standards 守卫测试(含 `user_id` 的表必须在删除级联清单)。

**修订(审计不精确处):**
- §三.6 删「死列」`settings.ai_api_key/base_url/model` → **不删**:GDPR 导出仍读取它们(`user.ts:111`),删除会破坏导出,风险大于收益。
- §三.1 `projects.content` 大小 → 写入边界**已有 `.max(1MB)`**,无需再加护栏(对象存储/子表化仍是可选的进一步优化)。

**待决策/待基础设施(需要你):**
- 🟠🟡 §三.2 tags→关联表、§三.5 assignees、§三.4 习惯打卡同步、§三.1 图片外置 —— 关系型迁移,建议逐个独立 PR;需你确认路线图(见对话中的多选问题)。
- 🟠 §五.1 限流器共享存储(需 Redis/Upstash,规模化/多实例前)。(§二.6 Outlook per-user OAuth —— **已随集成移除(2026-08-10)解决**,不再是待办。)

**监控/告警/运维 —— 已落地(自托管,无对外集成):**
- ✅ §二.5 → **自托管 Prometheus exporter**(取代 Sentry 方案):后端暴露 token 门禁的 `GET /metrics`(`LUMO_METRICS_TOKEN` 未设=404 默认关闭),含默认进程指标 + `lumo_http_*`(请求量/错误率/延迟直方图/在途并发);告警走 Prometheus/Alertmanager 规则。见 `docs/OPERATIONS.md`。无 SaaS、无 DSN、数据不出机房。


---

## 一、🔴 收费硬阻断(没有这些就无法/不应收钱)

### 1. 没有任何支付 / 订阅 / 权益体系(Billing)
- **为什么**:全代码库 grep `stripe|checkout|subscription|webhook|payment` = 0 产品代码。注册时 `plan` 硬编码 `'free'`,`renews_at` 是占位;唯一能变 `'pro'` 的地方是**开发用的 seed**。`plan==='pro'` 只在 AI 云配额处解锁(999_999 vs 100),意味着**付费档在生产中根本不可达**,而"Pro 卖点"里的云同步对所有人都不设限。
- **证据**:`backend/src/routes/auth.ts:158`(硬编码 free)、`backend/src/db/seed.ts:33-34`(唯一 pro)、`backend/src/routes/ai.ts:60-61`(唯一门禁)、`web-app/src/pages/AccountPage.tsx:194-216`("Coming soon" 死桩)。
- **最终方案**:契约优先地建全链路:`subscriptions` 表(见 §三.3)→ Stripe Checkout session 端点 → **带签名校验 + 幂等**的 webhook(`checkout.session.completed`、`customer.subscription.*`)写 `plan`/`renews_at` → 到期降级任务 → 对同步/AI 配额做 plan-gating → 落地页填真实价格。
- **工作量**:3–5 周(契约 + 后端 + 前端 + webhook + 测试)。

### 2. 默认配置会丢数据(持久化)
- **为什么**:`TURSO_*` 未设时后端**静默回退**到 `file:local.db`,Render 免费盘每次 redeploy 清空 → 用户数据全丢。免费档还会 15 分钟空闲休眠(付费用户不可接受的冷启动)。
- **证据**:`backend/src/db/client.ts:26-31`、`render.yaml`(`TURSO_*` 为 `sync:false`,`plan:free`)。备份只有手动 CLI `backend/src/db/backup.ts`,无调度、无 PITR、无恢复演练。
- **最终方案**:开通 Turso 付费(PITR)+ 设置 `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` + Render 付费常驻实例 + 定时逻辑备份 + **上线前真实做一次恢复演练**。并新增 boot-time 断言:`NODE_ENV=production` 且 Turso 未配置时**拒绝启动**(对齐已有的密钥/DB-scheme 护栏),消除"静默丢数据"这条路径。
- **工作量**:1–2 天(配置 + boot 断言 + 备份脚本 + 演练)。

### 3. 账号找回邮件在生产默认被静默丢弃
- **为什么**:`sendEmail()` 在 prod 若未配 provider,会 `console.error` 后 `return`(假装成功)。密码重置、邮箱验证都依赖它;为防枚举,HTTP 响应不暴露投递状态 → 用户**忘记密码后被彻底锁死,且无任何提示**。
- **证据**:`backend/src/lib/email.ts:85-91`;调用方 `routes/auth.ts:115,359`。`LUMO_EMAIL_*` 在 `render.yaml` 为 `sync:false`。
- **最终方案**:开通 Resend(或给 switch 增加 SES/SendGrid)+ 验证发件域名(SPF/DKIM)+ boot-time 断言:prod 下启用了依赖邮件的流程却未配 provider 时拒绝启动。
- **工作量**:半天(已有 Resend transport,主要是配置 + 断言 + 域名验证)。

### 4. 法律页目前是"草稿模板"
- **为什么**:隐私/条款页面**无条件**渲染"这是模板,上线前请律师审阅并填公司实体/联系/管辖"横幅;联系邮箱是 `[your-contact-email]` 占位;责任条款写着"Replace this section with counsel-reviewed language before launch";`{{EFFECTIVE_DATE}}` 未填。收费产品不能带这些上线。
- **证据**:`web-app/src/pages/legal/LegalLayout.tsx:53-61,80-81`、`web-app/src/pages/legal/content.ts:88-89`、`docs/legal/legal-drafts.md:19`。(注:路由守卫已正确把 `/legal/*` 列为登出可访问,这点没问题。)
- **最终方案**:律师审阅定稿 → 填公司实体/联系邮箱/管辖/生效日期 → **补订阅/自动续费/退款/消费者撤回权/子处理方清单/适用法律** → 删除草稿横幅(或仅 `import.meta.env.DEV` 下显示)。
- **工作量**:法务主导,工程 0.5 天替换文案。

---

## 二、🟠 上线前必须(即便先做免费公测,多数也需要)

### 5. 无错误追踪 / 监控 / 告警
- **为什么**:`grep -i sentry` = 0。后端 `app.onError` 只写 stdout(Render 免费档日志易失),前端 `ErrorBoundary` 不上报,无 uptime 探针、无告警 → 只能靠用户告诉你挂了。
- **证据**:`backend/src/app.ts:127`、前端 `App.tsx` ErrorBoundary。
- **最终方案**:前后端接 `SENTRY_DSN` + 外部 uptime 探针 + error-rate 告警。(结构化日志 + 审计日志 + 请求关联 ID 已具备且做得好,只差"上报 + 有人被叫醒"。)
- **工作量**:1 天。

### 6. ✅ Outlook 日历集成是"单邮箱共享"—— 已随集成移除解决(2026-08-10)
- **原风险**:用 app-only client-credentials 读**一个固定邮箱** `LUMO_MS_USER_EMAIL`,没有 per-user OAuth → 每个登录用户看到的是**同一个人**的日历,多租户 SaaS 是跨租户泄露/不可用。
- **决议(resolved-by-removal)**:上线前产品决定移除 Microsoft Outlook 集成(server Graph proxy + MSAL 浏览器 OAuth + connect UI + `@azure/msal-browser`);`routes/outlook.ts` 已删除。跨租户泄露面随之消失。保留的日历能力为本地 ICS 导入 + 只读 `.ics` 订阅源(见 §保留项)。
- **后续**:如未来需要 per-user 日历,应实现 per-user delegated OAuth(auth-code + 每用户加密存 refresh token)——现已从待办降级为未来可选项(见 ROADMAP #169 V3)。

### 7. 生产必设环境变量与"未设时的行为"
- **必设**:`LUMO_ALLOWED_ORIGINS`(CORS)、`TURSO_DATABASE_URL`+`TURSO_AUTH_TOKEN`(持久化)、`LUMO_APP_BASE_URL`(邮件/OAuth 链接不是 localhost)、`VITE_API_BASE`(构建期,错/缺则请求全 404)、`LUMO_EMAIL_*`(找回邮件)。
- **可选(未设=功能安全隐藏)**:`LUMO_AI_KEY`(云 AI,另见 §四.3 需花费上限)、`LUMO_GITHUB_*`。(`LUMO_MS_*` 已随 Outlook 集成移除(2026-08-10)不再使用。)
- **两个"未设=坏"的陷阱**(见 §一.2、§一.3):Turso、Email —— 都应升级为 prod 下 boot 拒启。
- **最终方案**:在 `deploy/` 与 README 补一份"生产环境变量清单"并把两个陷阱纳入 boot 断言。
- **工作量**:半天(与 §一.2/§一.3 合并做)。

### 8. 落地页"不追踪/不上服务器"宣传与托管账号产品矛盾 ✅
- **证据(历史)**:原 `landing/index.html:~1180`。该说法适用于桌面本地模式,但托管产品是服务器端多租户、数据存 Turso。
- **现状**:`landing/` 已删除,营销站归一到 Astro `website/`;`website/FAQ.astro` 的隐私/同步表述已按
  "实事求是"口径改写(去掉暗示端到端加密的"end-to-end",如实说明数据存我方服务器、仅用于运行账号、无第三方广告追踪)。
- **残留**:引入分析工具时仍需补 cookie/consent 说明(见 §七 / #475)。

---

## 三、🟠🟡 数据库表最终化与可扩展性(你的明确要求:不能半吊子,要终局设计)

> 原则:JSON 列**可以**是最终方案——前提是该数据**永不被关系式查询**。凡是已经/即将被关系式查询的,现在趁数据量小改成关联表,晚改要做有损或高风险的在线迁移。

### 3.1 🟠 `projects.content` 内联 base64 图片(V1 自述的临时方案)
- **风险**:`projects` 是同步实体,整行(含图片)进每次 pull/push 与每台设备的本地库。一张截图(1–5MB base64)让 payload 无上限膨胀。
- **最终方案**:图片移对象存储或 `project_assets(id, project_id, user_id, url/bytes, created_at)` 子表,`content` 只存引用。**迁移非有损**,但每拖一天 payload 越肿 → 视为规模化前阻断。`migrate.ts:442-458`。

### 3.2 🟠 `tasks.tags_json`(+ `completed_entries.tags_json` 快照)已被关系式使用
- **判定**:Stats 已按 tag 统计,且专门把 tag 快照到 `completed_entries` 以便按 tag 计数——**这就是"已在关系式查询"的铁证**,属 schema 债而非最终选择。
- **最终方案**:建 `tags(id, user_id, label, ...)` + `task_tags(task_id, tag_id)` 多对多;`completed_entries` 的 tag 快照作为**不可变历史**的合理反规范化保留。`migrate.ts:270-297`。

### 3.3 🟠 `users.plan` / `users.renews_at` = "两列凑的计费 schema"
- **风险**:`plan` 无 CHECK、契约里是裸 `z.string()`(非枚举),`renews_at` 是自由 TEXT(不可排序比较),无订阅状态/provider/外部订阅 id/周期/审计。
- **最终方案**:建 `subscriptions(user_id, plan, status, provider, external_id, current_period_end, cancel_at, created_at, updated_at)`,`plan`/`status` 用枚举(CHECK 或契约枚举);`users.plan` 可留作反规范化缓存。**收费前必须设计**(给活跃付费账号补计费状态风险极高)。`migrate.ts:18-19`。

### 3.4 🟡 `habit_logs` 不同步 + 复合主键无 `id`/`updated_at`/`deleted_at`
- **风险**:习惯定义同步、打卡历史/连胜不同步;且因无代理主键 + 硬删除,日后接入通用四元组同步引擎需**表重建**(有序、易错的在线迁移)。
- **最终方案**:若打卡应跨设备(几乎必然)→ 趁数据量小现在补 `id`/`updated_at`/`deleted_at` + tombstone 并加入同步清单;若刻意本地化,写进文档说明。`migrate.ts:394-402`、`sync/manifest.ts`。

### 3.5 🟡 `tasks.assignee_ids`(JSON person-id 数组,已被关系式使用)
- **判定**:person 删除时用 `json_each` 改写 JSON(证明关系式使用),且已重建过一次(`assignee_id→assignee_ids`)。若路线图有"分配给我"/按人分享/按人通知 → 需 `task_assignees(task_id, person_id)`;若 People 永远只是卡片上的展示标签 → 可作为最终选择。**按路线图决策**。`migrate.ts:28`、`people.ts:149-161`。

### 3.6 🟡 死列清理 `settings.ai_api_key` / `ai_base_url` / `ai_model`
- 已被 `ai_configs`(per-provider JSON,合理最终选择,密钥加密)取代;这三列仅在一次性迁移里被读。**用已有的 guarded `DROP COLUMN` 模式删除**(`ai_provider` 仍是活跃的选择指针,保留)。`migrate.ts:146-160`。

### 3.7 🟡 稳定枚举列补 `CHECK` 约束
- `quadrant`/`recurrence`/`calendar`/`projects.status`/`templates.kind` 等稳定枚举加 DB 级 CHECK;**会增长的枚举(`plan`、`ai_provider`)不加 CHECK**(避免迁移摩擦),在契约层约束。

### 3.8 🟡 `tasks.project_id` 缺索引
- 项目视图与项目删除级联都按 `project_id` 过滤却无索引 → 每次全分区扫描。`CREATE INDEX idx_tasks_user_project ON tasks(user_id, project_id) WHERE deleted_at IS NULL`。`migrate.ts:586-587`。

### 3.9 🟡 FK 靠约定 → 新表漏加级联会静默产生孤儿行
- FK 全局关闭(嵌入式副本的合理取舍),级联在代码里处理且有测试;但 `oauth_handoffs` 有 `user_id` 却**不在** `USER_SCOPED_TABLES`(账号删除会遗留,靠 boot 定时清理自愈,影响小)。
- **最终方案**:保留代码级联模型,新增 standards 测试:**凡含 `user_id` 列的表必须出现在 `USER_SCOPED_TABLES`**(对齐已有的四元组守卫)。`user.ts:22-37`。

> ✅ 明确的最终选择(不动):`ai_configs`(per-provider JSON,永不关系式查询)、`subtasks_json`、`completed_entries` 的 tag/历史快照(不可变历史反规范化)、令牌表(哈希存储、单用、带过期与定时清理)。

---

## 四、🟡 半成品 / 临时方案清理(会被付费用户第一时间撞上)

### 4.1 AI 云配额是非原子读改写(可竞争绕过 100 限额)
- `incrementCloudUsage` 先 SELECT 再 UPDATE(JS 里算 +1),并发下少计、可越额。**改为单条原子 SQL**:`UPDATE settings SET ai_cloud_used = CASE WHEN ai_cloud_month=:m THEN ai_cloud_used+1 ELSE 1 END, ai_cloud_month=:m WHERE user_id=:uid`,并用条件 `WHERE ai_cloud_used < :limit` 兜底。收费后是**营收完整性**问题。`ai.ts:78-89`。

### 4.2 共享 `LUMO_AI_KEY` 无全局花费上限
- 唯一限制是 per-user 100/月;一波注册可直接打到你的 Anthropic 账单无天花板。**加聚合/全局花费护栏 + 告警**;云模型硬编码 `claude-haiku-4-5-20251001`。`ai.ts:57,72`。

### 4.3 `docs.ts` 手写 OpenAPI + 过期 "(stub)" 标签
- `/v1/ai/parse` 早已 LLM 实现,summary 仍写 "(stub)";且 ~640 行手写 OpenAPI 违反 CLAUDE.md 的"从 `@lumo/contracts` 生成"。**改为服务生成的 spec 并删手写对象**。`routes/docs.ts:600`。

### 4.4 AccountPage 的 Plan 区("Coming soon" 死桩)+ i18n 缺口
- Plan 区无任何动作(与 §一.1 绑定):接真实 checkout,或若本期不做货币化则**移除该区**以免暗示可购买。另 `AccountPage.tsx:201` 有硬编码英文 helper(无 zh)绕过 `strings.ts`,及若干内联双语字符串(QuickCreate/TodayPage/TaskEditModal,双语齐全但绕过中央目录)——收敛进 `strings.ts` 并去重象限标签。

### 4.5 限流器是进程内内存 Map(多实例失效)——见 §五.2

---

## 五、🟡 规模化 / 运维打磨(单实例可先上,横向扩展前必须)

1. **限流器进程内内存**:`lib/rateLimit.ts:20` 是本地 `Map`,>1 实例时有效限额翻倍、重启即清零。多实例前换共享存储(Redis `INCR`+TTL / Upstash / Turso)。
2. **无优雅关闭**:`index.ts` 无 SIGTERM 处理,每次 redeploy 丢在途请求。加"停止接新连接 + 排空在途"。
3. **无 staging 环境 / 回滚 runbook**:目前单 prod、`autoDeploy:true`。出现支付 webhook 后 staging 尤为关键;补回滚手册。
4. **注册滥用控制薄弱**:仅用户名注册、邮箱验证非阻断、无 CAPTCHA;公开/付费前对敏感动作加信号(CAPTCHA 或"验证后激活")。
5. ~~**Outlook app token 模块级内存缓存**~~:**已随 Outlook 集成移除(2026-08-10)解决** —— `routes/outlook.ts` 及其模块级 token 缓存已删除,此项不再适用。

---

## 六、🟢 文档漂移修正(与实现不符,会误导贡献者/自己)

1. `ARCHITECTURE.md` 称 Drizzle + Postgres + services,实际是**裸参数化 SQL over libSQL**——更正。
2. `COMMERCIALIZATION_READINESS.md` 把"CI 加 npm audit"标 `[todo]`,实际**已在 CI 跑**(前后端,`ci.yml:381,386`)——更新。
3. `LAUNCH_CHECKLIST` 说"吊销令牌缓存易失/重启即丢"——实际**source of truth 是 DB `revoked_tokens` 表 + `session_version`**,跨重启/多实例持久;只有限流器是真易失。更正,别低估自己的鉴权设计。
4. `web-app/CLAUDE.md` 提到的 `src/mocks/tasks.ts` 是**过期文档**(无此上线代码)——删除引用。
5. `render.yaml` 仍 `plan:free`——与"移出免费档"的结论未同步。

---

## ✅ 已达标(审计验证为生产级,无需返工——给决策信心)

- **安全 / 鉴权核心**:JWT + 轮换单用 refresh(重用检测)、**DB 持久**吊销 + `session_version` 失效、bcrypt cost-12 timing-safe、boot 密钥强度强制、每路由 Zod 边界校验、`hasKey`/导出不泄露密钥、SSRF 防护、安全头、请求体大小限制、`/health`+`/ready`、全局 `onError`(无静默 500)、结构化 + 审计日志 + 请求关联 ID。
- **GDPR 导出 / 删除**:端到端(列白名单无密钥;删除原子级联 14 张用户表)——审计中**最强项**,文档描述准确。
- **前端工程**:i18n 中英 1025/1025 平价、ErrorBoundary + 路由兜底、所有异步动作有 loading/busy 态、无 `TODO/FIXME/mock/any/ts-ignore` 等 dev 残渣。
- **AI(自带 key)**:真实 OpenAI/Anthropic 调用、密钥加密存储、per-user 限流、启发式降级是有意的"无 key 也能用"。
- **GitHub OAuth**(env-gated 优雅降级)、**Calendar ICS feed**(能力令牌哈希存储、限流)、**Sync 引擎**(HLC/LWW、严格 `user_id` 隔离)——均生产级。
- **迁移健壮性**:表重建已改为原子 batch + 自愈(本会话 #464)。

---

## 建议执行顺序(里程碑)

- **M0 · 免费公测可上线**(约 1 周):§一.2 持久化 + 备份/演练、§一.3 邮件、§一.4 法律定稿、§二.5 监控、§二.8 宣传更正、§四.1 原子配额、§四.2 AI 花费上限、§六 文档更正。
- **M1 · Schema 终局化**(约 1 周,趁数据量小):§三.2 tags 关联表、§三.3 subscriptions 表、§三.1 projects 图片外置、§三.4 habit_logs 决策、§三.6/3.7/3.8/3.9 清理与约束/索引/守卫测试。
- **M2 · 开始收费**(约 3–5 周):§一.1 Billing 全链路(依赖 M1 的 subscriptions 表)+ plan-gating + 落地页定价。
- **M3 · 规模化**:§五 限流共享化、优雅关闭、staging/回滚、滥用控制。(§二.6 Outlook per-user OAuth —— 已随集成移除(2026-08-10)解决,从此里程碑移除。)

> 每一项都遵循仓库的契约优先 + TDD + 四层测试规范(见 `CLAUDE.md` / `TESTING.md`)。
