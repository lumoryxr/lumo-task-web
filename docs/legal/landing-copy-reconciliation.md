# 落地页话术对账草案 / Landing-copy Reconciliation (DRAFT)

> **状态：草案 · 待运营方拍板。** 追踪 issue：#472（法务与合规）。SSOT：`docs/COMMERCIALIZATION_READINESS.md` §5。
>
> **本文只做对账与选项建议，不直接改营销措辞** —— 最终话术是运营/法务决定。
>
> **根因：** `landing/index.html` 用**桌面 / 本地优先模式**的隐私属性描述**整个产品**，
> 但同一产品还提供**服务端账号版**（JWT 鉴权、Turso 云数据库、Lumo Cloud AI 代理、审计日志、
> 计划中的分析）。免费公测尚可含糊，**收费 + 上分析后即为实质性误导**，且与隐私政策不一致。

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
- **隐私政策对齐**（#472）：页面话术改定后,须与 `docs/legal/legal-drafts.md` / 线上隐私政策**同口径**（子处理方 Stripe/Resend/GitHub/AI、数据留存、Cookie/存储告知）。
- **分析接入**（#475 / §7）：接 Plausible/PostHog **之前**必须先落 C1 的收敛,否则上线即打脸。
- **website/ Astro 站**：本次只审计了 `landing/index.html`;若保留/合并到 `website/`（§7 营销站合并）,需同样对账。

---

## 4. 待拍板清单（运营方）
- [ ] C1 选 A/B/C 哪个？（决定"零遥测"话术走向 —— 与是否上分析强相关）
- [ ] C2–C5 是否统一采用"**桌面 vs Web 分形态**"叙事（§2 表）？
- [ ] 是否接隐私友好分析？接的话确认 C1 不能再宣称"不收集分析数据"。
- [ ] 营销站最终以 `landing/` 还是 `website/` 为准（§7）——决定改哪一处。

> 拍板后,可另开实现 issue 落具体文案改动（前端 + i18n EN/ZH 双语）。
