# 落地页话术对账 / Landing-copy Reconciliation

> **状态：C1–C5 已按"实事求是"原则实施**（Jalen 拍板 2026-08-10：落地话术要实事求是）。
>
> **定位更新（2026-08-12）：Lumo 是免费开源个人项目 —— 不收费、不接产品分析、无公司主体。**
> 因此原先"接入 Plausible/PostHog 分析"(#475) 与"Stripe 支付"(#470) **均已取消**;下文凡涉及
> "未来接分析/支付"的前瞻项作废,"无第三方广告追踪 / 不收集分析"的话术现在是**长期成立的事实**,
> 无需为分析预留改口空间。
> 原追踪 issue：#472（已改为"开源个人项目声明",见 `legal-drafts.md` / `subprocessors.md`）。
> 变更最初落到 `landing/index.html`（EN/ZH 双语）;**该页现已删除,`website/` Astro 站为唯一营销站,
> 同口径已搬迁（见 §4）。** 下文的 `landing/index.html:行号` 仅作历史记录。**残留待拍板项见 §4。**
>
> **根因：** `landing/index.html` 曾用**桌面 / 本地优先模式**的隐私属性描述**整个产品**，
> 但同一产品还提供**服务端账号版**（JWT 鉴权、Turso 云数据库、Lumo Cloud AI 代理、审计日志、
> 计划中的分析）。此前"零遥测/完全离线/无需注册/数据永不离开设备"对 Web/账号版是实质性误导。
> **本次改动把桌面强承诺限定为桌面，账号/Web 版如实说明,并采用可长期兑现的措辞。**

---

## 1. 逐条矛盾清单

### C1 · "Zero telemetry / 零遥测数据"（最严重）
- **位置：** `landing/index.html:1178–1181`
- **原文（EN）：** "We don't track usage, collect analytics, or send data to any server without your explicit action."
- **原文（ZH）：** "我们不追踪使用情况、不收集分析数据、不在未经明确授权的情况下发送任何数据。"
- **矛盾：**
  - 服务端账号版**本质上**把任务/习惯/倒数/设置写入云端 Turso；审计日志（`lib/audit.ts`）记录账号行为。
  - **§7 计划接入 Plausible/PostHog 分析** → 直接违背"不收集分析数据"。
  - "without your explicit action / 未经明确授权"是唯一的挡箭牌，但**注册即上云**这一点普通用户不会理解为"我授权了持续遥测"。
- **建议（三选一，需拍板）：**
  - **A（推荐·限定桌面）：** 把该卡片显式限定为 **Desktop / Local mode**，措辞如
    "In local desktop mode, Lumo stores everything on your device and sends nothing to our servers."
  - **B（收敛为真话）：** 保留跨版本承诺,但改成**可兑现**的表述：
    "No third-party ad trackers. Account data is encrypted and used only to run your account."
    （**注意：** 一旦接 Plausible/PostHog,即便是隐私友好分析,也不能再说"零分析"。）
  - **C：** 删除该卡片。

### C2 · "Works fully offline / 完全离线使用 · No internet required"
- **位置：** `landing/index.html:1170–1172`
- **矛盾：** 仅**桌面本地模式**为真；**Web 版**依赖后端 API,离线不可用。
- **建议：** 限定为桌面版（"Desktop app works fully offline"）,或加"(desktop)"限定词。

### C3 · "everything is stored locally / 所有数据本地存储 · You own it completely"
- **位置：** `landing/index.html:1154–1155`（"Like Obsidian — everything is stored locally."）
- **矛盾：** 桌面本地/嵌入式副本模式为真;**直连云（Render/Web）模式**数据在 Turso 云端。
- **建议：** 限定桌面版,或改为"local-first（本地优先,可选云同步）",与 C1 口径一致。

### C4 · "No account required to start / 无需注册账号即可开始使用"
- **位置：** `landing/index.html:1209–1210`
- **矛盾：** 桌面版为真;**Web 版已强制登录 + 路由守卫**（#14 已上线,去逃生口）。
- **建议：** 限定为"Desktop: no account required";Web 版明确需要账号。

### C5 · Meta description 把 Web 与 local-first-privacy 捆绑
- **位置：** `landing/index.html:7`
- **原文：** "…local-first privacy. Available on Windows, macOS, Linux, and **Web**."
- **矛盾：** 把 local-first-privacy 卖点覆盖到 Web 版。
- **建议：** 调整为"local-first desktop apps + a hosted web app",避免把隐私卖点套到 Web。

### C6 ·（非矛盾,但需口径一致）"Lumo Cloud · 100 free AI calls" 与 Pricing "云同步即将推出"
- **位置：** `landing/index.html:1074–1085`、`1462–1466`
- **说明：** 这些**已经**在讲云端/服务端能力,与 C1–C4 的"纯本地"叙事并存于同一页,自相矛盾。
  收敛时应让"本地优先 + 可选云账号"成为**统一叙事**,而不是两套互斥说法。

---

## 2. 建议的统一叙事（供拍板）
把产品明确表述为 **"local-first, with an optional hosted account"** 双形态,隐私承诺**按形态分列**：

| 形态 | 数据位置 | 隐私承诺（可兑现） |
|---|---|---|
| **Desktop / Local** | 用户设备（可选 Dropbox/iCloud/NAS 路径） | 完全离线;不上传我们的服务器;无账号 |
| **Hosted Web / Account** | Turso 云 + 我方后端 | 加密存储;仅用于运行你的账号;无第三方广告追踪;（若上分析）隐私友好、可关闭 |

这样每条承诺都能对应到具体形态,既保住"本地优先"卖点,又不误导 Web/收费用户。

---

## 3. 与其它工作项的联动
- **隐私政策对齐**（#472）：页面话术须与线上隐私政策(`web-app/src/pages/legal/content.ts`)**同口径**（子处理方:托管/Turso/Resend/GitHub/自带 AI —— **无 Stripe/支付**、**无分析**;数据留存、Cookie/存储告知）。已对齐。
- ~~**分析接入**（#475）~~：**已取消** —— 免费开源项目不接产品分析,C1"无第三方广告追踪 / 不收集分析"永久成立。
- **website/ Astro 站**：`landing/index.html` 已删除,`website/` 为唯一营销站并已按同口径对账（见 §4）。

---

## 4. 实施状态与残留待拍板

**已实施（本次 PR，`landing/index.html`）：**
- [x] **C1** 「零遥测」→ **「无第三方广告追踪」**：采用 §1 建议 B 的可兑现口径 —— "无广告追踪 + 桌面本地不发服务器 + 账号数据加密仅用于运行账号"。**刻意不再宣称"不收集分析数据"**，以便未来接隐私友好的**第一方**分析时话术仍成立。
- [x] **C2** 「完全离线」→ **「桌面版完全离线」**（注明 Web 版需联网）。
- [x] **C3** 「所有数据本地存储 / 数据永不离开设备」→ **「本地优先,数据存在哪由你决定」**（桌面留本地 + 可选云账号）。
- [x] **C4** 「无需注册账号」→ **「桌面版无需注册」**。
- [x] **C5** meta description 去掉把 local-first-privacy 套到 Web 的表述,改为"local-first 桌面 + 可选托管 Web"。

**残留项（已随"免费开源"定位收口）：**
- [x] **隐私友好分析**（原 §7 / #475）：**不做**（#475 已关闭)。产品不接任何第一方/第三方分析,"无第三方广告追踪 / 不收集分析"是长期事实,无需再为分析预留改口空间。
- [x] **营销站归一**（§7）：已定以 Astro `website/` 为唯一营销站,`landing/index.html` 及
  `deploy-landing.yml` 已删除。`website/` 已按同样"实事求是"口径对账:`FAQ.astro` 的
  "end-to-end / 私密"表述曾暗示端到端加密,已改为"通过账号在设备间同步、数据存我方服务器、
  仅用于运行账号、无第三方广告追踪、开源可审计"——与 C1 收敛口径一致。离线口径保留("PWA 离线外壳"
  属实,见 `web-app/public/sw.js` 预缓存应用外壳)。
- [x] **隐私政策对齐**（#472）：线上隐私政策(`web-app/src/pages/legal/content.ts`)与本次落地话术**已同口径** —— 子处理方(`subprocessors.md`:托管/Turso/Resend/GitHub/自带 AI,无支付、无分析)、数据留存、Cookie/本地存储告知一致;`legal-drafts.md` 已改为"开源个人项目"概述。
