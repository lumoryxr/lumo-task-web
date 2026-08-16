# Lumo Task — 上线营销与开源增长策划案

> Status: v1 (2026-07-13, 过夜起草)。目标:让更多人**体验并留用** Lumo Task,并**吸引开源贡献者**。
> 预算假设:≈0 现金,靠内容 + 社区 + 产品本身的故事性驱动(indie / build-in-public)。

---

## 0. 一句话定位

**"每天早上告诉你——现在到底该做哪件事。"**
一个围绕**艾森豪威尔矩阵 + 番茄钟 + AI 分类**的专注型任务管理器,而且**每一行代码都由 AI 写成**。

两个可独立传播的钩子:
- **产品钩子(给用户)**:治"任务多到不知道先做啥"的焦虑 —— 四象限 + 每日首要任务推荐 + 全屏专注。
- **元钩子(给开发者/科技圈)**:**100% AI-coded** 的真实长期实验(每个 commit / PR 都是 Claude 写的)。这是稀缺的、可持续产出的"故事线",比功能本身更容易破圈。

> 核心策略:**用元钩子破圈拉流量,用产品钩子承接留存。** 两条叙事都要有,但对不同渠道侧重不同。

---

## 1. 目标受众 × 渠道矩阵

| 受众 | 痛点 / 动机 | 主渠道 | 叙事侧重 |
|---|---|---|---|
| 知识工作者(工程师/研究者/学生) | 任务过载、拖延、专注难 | Product Hunt、Reddit(r/productivity, r/getdisciplined)、少数派、即刻 | 产品钩子 |
| 效率工具爱好者 | 爱试新工具、爱矩阵/番茄法 | Hacker News、少数派、V2EX、小红书(效率赛道) | 产品钩子 + 双语/本地优先 |
| AI/开发者社区 | 好奇"AI 能不能独立做完一个产品" | HN、X/Twitter(build-in-public)、掘金、Bilibili、r/programming | 元钩子(AI-coded 实验) |
| 潜在开源贡献者 | 想参与有意思的项目 / 练手 / 简历 | GitHub、Discord、good-first-issue 榜单站 | 元钩子 + 清晰的贡献路径 |

---

## 2. 用户增长(拉新)——分阶段

### Phase A — 上线前(1 周准备,资产先行)
把"能一眼看懂 + 立刻上手"做到位,再谈推广。**Checklist:**
- [ ] **落地页/README 首屏**:15 秒讲清"是什么 + 为谁 + 立刻试" + 一张会动的 GIF(拖拽四象限 + 进入专注)。
- [ ] **30–45 秒 Demo 视频**(录屏配字幕,中英各一版),用于 PH / 推特 / B 站。
- [ ] **Live demo 免注册可玩**(local-first 是天然优势——强调"无需注册、断网可用")。
- [ ] **一张对比图**:Lumo vs Todoist/Things —— 突出"矩阵优先级 + 内置专注 + AI 分类 + 双语"。
- [ ] **埋点**:落地页→demo→注册/安装 的转化漏斗(Plausible/Umami 之类轻量无 cookie 分析,契合 local-first 隐私调性)。
- [ ] **社媒账号**:X + 即刻(build-in-public 主阵地),头像/简介统一。

### Phase B — 上线日(集中火力一天)
- **Product Hunt**:周二/周三 00:01 PST 上线;标题突出双钩子("A focus task manager, coded 100% by AI");首评自述实验故事;动员早期用户/朋友首小时点赞评论。
- **Hacker News**:`Show HN: Lumo Task – a focus manager where 100% of the code is AI-written`。HN 吃"技术实验 + 可玩 demo + 坦诚复盘",元钩子在这里最灵。**准备好回帖**(架构、AI 工作流、踩坑、成本)。
- **Reddit**:r/SideProject、r/productivity 各发一帖,措辞按版规(先给价值、别硬广)。
- **中文同步**:少数派(投稿"我用 AI 从 0 做了个效率工具")、V2EX(分享创造)、即刻(build-in-public 动态)、掘金(技术向)。
- **准备 FAQ 话术**:AI 怎么写的?质量怎么保证?数据在哪?为什么开源?

### Phase C — 持续(每周节奏)
- **Build-in-public 周更**:每周发 1 条"这周 AI 给 Lumo 加了啥/修了啥"(带 PR 链接和 diff 截图)。这是**可持续、低成本、独一份**的内容源——直接复用过夜/日常的开发日志(ROADMAP.md 已经在记)。
- **SEO 长尾**:写 3–5 篇博客(可放 website/):"艾森豪威尔矩阵实操"、"番茄工作法 + 四象限"、"我如何让 AI 独立维护一个上线产品"。中英各一版。
- **对比/工具榜**:提交到 AlternativeTo、Awesome-Selfhosted、开源效率工具合集、Toolify/一些 AI 产品目录。

---

## 3. 内容策略(核心资产:AI-coded 开发日志)

这个项目最大的差异化不是功能,而是**"AI 独立开发一个真实上线产品"的连载**。把它当**内容产品**运营:

- **每次有意思的 PR = 一条内容**:难 bug 的定位过程、一次 code-review 抓到的越权漏洞、一次重构、一次视觉打磨——配 before/after 截图或 diff。
- **月度复盘**:这个月 AI 合了多少 PR、发现并修了几个安全问题、测试覆盖变化、踩过的坑。数据 + 坦诚 = 可信度。
- **"给 AI 立的工程铁律"**:契约先行、AC=测试、每 PR 实跑 code-review——这套流程本身就是很好的技术内容(工程/AI 双圈都爱看)。

> 这条内容线几乎零额外成本(工作本来就在做),却能持续供给所有渠道。**这是本策划案的杠杆点。**

---

## 4. 开源贡献者吸引

开源项目的贡献漏斗 = **看到 → 看懂 → 跑起来 → 找到能上手的活 → 提第一个 PR → 被善待**。逐环节降摩擦:

### 4.1 让人"看懂 + 跑起来"(5 分钟内)
- [ ] README 顶部:徽章(CI/Demo/License/**AI-Coded**)已有 ✅;补一段"**Why contribute**"(参与一个 AI-driven 开发实验、技术栈现代、CI 严格、review 到位)。
- [ ] **一条命令起项目**(dev 脚本 + `.env.example` + "已知坑"小节),README 里显眼。
- [ ] `ARCHITECTURE.md`:一页讲清前后端/契约/测试分层,让新人快速建立心智模型。

### 4.2 让人"找到能上手的活"
- [ ] 建 **`good first issue` / `help wanted`** 标签,并**手动挑 8–12 个真·小而清晰**的任务(带验收标准 + 相关文件路径 + 提示)。这是转化贡献者最关键的一步。
- [ ] 一个公开 **ROADMAP / GitHub Projects 看板**,让人看到方向、认领任务。
- [ ] `CONTRIBUTING.md` ✅ 已有 → 校对:分支命名、提交规范、本地门禁怎么跑、PR 模板、review 期望。
- [ ] **PR/Issue 模板** + 明确的"我们如何 review"(强调 AI + 人协作、code-review 会真跑)。

### 4.3 让人"被善待 + 想留下"
- [ ] **48h 内响应**首个 PR(哪怕只是"看到了,排期中")。
- [ ] `CODE_OF_CONDUCT.md`、贡献者致谢(all-contributors 或 README 列表)。
- [ ] 轻量社区入口:**Discord 或 GitHub Discussions**(先用 Discussions,零维护成本)。
- [ ] 独特卖点话术:"**来和一个 AI 一起维护产品**"——对好奇 AI 协作开发的人极有吸引力,也是简历亮点。
- [ ] 上开源榜:提交到 `awesome-*` 列表、GitHub Trending 冲榜(靠上线日集中 star)、`good-first-issue` 聚合站(goodfirstissue.dev 等)。

---

## 5. 上线时间线(建议 2 周)

| 时段 | 动作 |
|---|---|
| D-7 ~ D-3 | 落地页/GIF/Demo 视频、埋点、对比图、社媒账号、good-first-issues、Why-contribute 段落 |
| D-2 | PH/HN/少数派 文案与配图定稿;预热一条 build-in-public 帖 |
| **D-Day** | PH + Show HN + Reddit + 中文渠道同步;全天守评论区回帖 |
| D+1 ~ D+7 | 复盘数据;发"上线复盘"帖(坦诚数据最吃香);处理涌入的 issue/PR |
| 之后 | 每周 build-in-public 更新 + 每月复盘,长期滚动 |

---

## 6. 关键指标(先定义漏斗,别只看 star)

- **拉新**:落地页 UV → demo 试用率 → 注册/安装转化率。
- **激活**:新用户当天是否创建 ≥3 个任务 / 用过一次专注模式(Aha moment)。
- **留存**:D1 / D7 / D30 回访。
- **口碑**:PH 排名与点赞、HN 分数与评论、GitHub star 增速。
- **开源健康度**:外部贡献者数、首个 PR 到合并中位时长、good-first-issue 认领率。

> 起步阶段最该盯的两个数:**demo→激活转化** 和 **首个外部 PR 的响应速度**。前者决定留存,后者决定开源能不能滚起来。

---

## 7. 低成本/indie 打法清单(即插即用)

- **build-in-public**:开发本来就在发生,顺手把 PR 变内容,几乎零边际成本。
- **免费产品目录**:AlternativeTo、Awesome-Selfhosted、Toolify、各类"AI 做的产品"合集。
- **蹭话题**:每次 AI 圈有"AI 能不能独立编程"的讨论,用真实上线产品做论据切入。
- **可玩 demo 前置**:所有链接直达免注册 demo,把"先体验"摩擦降到最低。
- **本地优先/隐私** 作为卖点:无需注册、断网可用、数据在本地——在隐私敏感人群里是加分项。

---

## 8. 需要 Jalen 决策 / 提供的(留到早上)

1. **主推哪条叙事**:AI-coded 元钩子 vs 纯效率工具?(建议:破圈用元钩子,产品页讲效率——两条都做,但确认主次)
2. **社区入口**:先开 GitHub Discussions(零成本)还是直接建 Discord?
3. **上线日期**:定一个 PH/HN 的 D-Day(建议避开节假日、选周二/周三)。
4. 是否愿意露脸/署名(build-in-public 里"人 + AI"搭档的故事比纯匿名更有传播力)。
5. 轻量分析工具选型(Plausible / Umami / 自建),以及是否接受埋点。

---

## 附:可立即执行、不需 Jalen 的准备项(我过夜/后续可代做)
- [ ] README 增补 "Why contribute" 段 + 一条命令起项目说明(需校对现有 dev 脚本)。
- [ ] `ARCHITECTURE.md` 一页架构图/说明。
- [x] 起草 8–12 个 `good first issue`(基于代码里真实的小改进点)→ 见 `good-first-issues.md`。
- [x] PH / Show HN / Reddit 文案初稿(中英)→ 见下方 §9。
- [x] 对比图与 Demo 脚本大纲(Demo 脚本 + 分镜 → 见 §10)。

---

## 9. 文案初稿(ready-to-use,claims 已对齐 README/实际功能)

> 事实基线(用于所有文案,避免过度承诺):四象限拖拽(Q1–Q4)、全屏番茄专注(Web Worker 计时,切标签不掉)、AI 一键分类(带启发式兜底)、EN/ZH 双语、PWA 可安装 + 离线壳、Windows/macOS 桌面版、**100% 由 AI(Claude)编写**、MIT、Live demo 在 Render(demo/访客登录可玩,非"完全免注册")。
> ⚠️ 发布前逐条复核:demo 链接是否可用、桌面版下载页是否就绪、"AI-coded" 表述是否要 Jalen 拍板(见 §8.1/§8.4)。

### 9.1 Product Hunt
- **Name**:Lumo Task
- **Tagline(≤60 字符,二选一)**:
  - `A focus task manager — coded 100% by AI`
  - `Eisenhower matrix + Pomodoro, built entirely by AI`
- **Description**:
  > Lumo Task helps you answer one question every morning: *what should I actually do next?* It combines an Eisenhower matrix (drag tasks across four quadrants), a full-screen Pomodoro focus mode, and one-click AI classification. Fully bilingual (EN/ZH), installable as a PWA, and available as a Windows/macOS desktop app.
  >
  > The twist: **every line of code is written by AI.** No human has hand-written any of it — each commit and PR is generated by Claude, following a strict engineering discipline (contract-first, tests as acceptance criteria, real code-review on every PR). Lumo Task is a live, long-running experiment in AI-driven product development. Open source (MIT).
- **First comment(maker,讲实验故事)**:
  > Hey PH 👋 I'm running an experiment: can an AI independently build *and maintain* a real, shipped product? Lumo Task is the result — 100% of the code is AI-written, and I keep a public dev log of every PR (the good bugs, the security catch in code-review, the refactors). Happy to answer anything about the workflow, the guardrails, cost, or where it breaks. Try the live demo, no install needed.

### 9.2 Show HN
- **Title**:`Show HN: Lumo Task – a focus task manager where 100% of the code is AI-written`
- **Body**:
  > Lumo Task is a full-stack task manager built around the Eisenhower matrix, a Pomodoro focus timer, and AI-assisted classification. It's a web app / PWA with Windows and macOS desktop builds.
  >
  > The reason I'm posting: it's a long-running experiment in AI-driven development. Every commit and PR is generated by Claude — no hand-written code — under a fixed discipline: contract-first, acceptance criteria as tests, local gates green, and a real code-review pass on every PR before merge. I keep a public dev log so you can see the actual diffs (including the messy parts).
  >
  > Stack: React + TS + Vite frontend, Hono + SQLite backend, JWT auth, Zod contracts, Vitest/Playwright tests, Electron desktop.
  >
  > Happy to go deep on the workflow, where AI struggles (naming, cross-file refactors, flaky tests), how review catches its mistakes, and running costs. Live demo and repo below.
- **准备好的追问预案**(帖内首评贴出要点):AI 怎么保证质量?→ 契约先行 + AC=测试 + 每 PR 实跑 code-review;数据在哪?→ 自托管 SQLite,本地/自建;为什么开源?→ 实验透明度 + 想看社区能不能和 AI 协作贡献。

### 9.3 首条 build-in-public 推文(X / 即刻)
> I've been running a quiet experiment: an AI that doesn't just write code, but *maintains* a shipped product.
>
> Meet Lumo Task — an Eisenhower-matrix + Pomodoro focus app. Every commit, every PR: written by AI. I just review and merge.
>
> Live demo + open source 👇 (thread on how it actually works)

（后续 2–3 条 thread:①工程铁律截图 ②一次 code-review 抓到越权/bug 的 diff ③月度数据:合了多少 PR、修了几个问题。）

### 9.4 Reddit r/SideProject（先给价值,弱广告）
- **Title**:`I let an AI build and maintain my entire side project — here's the workflow (and where it breaks)`
- **Body 要点**:先讲"为什么做这个实验" → 贴工程铁律(契约先行/TDD/code-review) → 诚实说 AI 哪里翻车(命名、跨文件重构、flaky) → 结尾一句话带产品 + demo 链接。**别开头就贴链接**(违版规)。

### 9.5 FAQ 话术(各渠道通用)
- **Q:真的一行人写的代码都没有?** A:是。代码/commit/PR 全部由 Claude 生成;人只做需求、review、合并决策与产品拍板。
- **Q:质量怎么保证?** A:固定工程铁律——契约先行、验收标准即测试、本地门禁全绿、每个 PR 实跑 code-review 并回写后才合。
- **Q:我的数据在哪?** A:后端是自托管 SQLite,可自建部署;不依赖第三方存任务数据。
- **Q:AI 分类要联网/Key 吗?** A:AI 一键分类走 LLM,但有**启发式兜底**,没 Key/断网也能用基础分类。
- **Q:为什么开源(MIT)?** A:实验要可验证 + 想看"人 + AI 协作贡献"能不能跑起来。欢迎 good-first-issue。
- **Q:AI 最容易翻车的地方?** A:命名、跨文件大重构、flaky 测试定位——这些正是 review 环节重点盯的。

---

## 10. Demo 脚本 & 分镜(60–90s,可复用为 PH/HN 头图 GIF + X thread 视频)

> 目标:一镜到底讲清**一个早晨的使用闭环**——「今天到底先做什么?」→ 排序 → 专注 → 完成。全程只演**真实已上线功能**(四象限拖拽 / 番茄专注 / AI 分类 / 完成庆祝 / 统计),不摆拍不存在的能力。
> 建议两版:**主 Demo(60–90s 带旁白/字幕)** 用于落地页 + Show HN;**无声 GIF(8–12s)** 截主 Demo 的高潮 3 步(加任务→拖象限→专注)做 PH/README 头图。
> 语言:先录 EN 主版(PH/HN),ZH 字幕另出一版(少数派/即刻)。分辨率按落地页头图比例(GIF 建议 ≤ 5 MB,压帧率到 12–15fps)。

### 10.1 主 Demo 分镜(逐镜)

| # | 时长 | 画面 | 旁白 / 字幕(EN) | 备注 |
|---|---|---|---|---|
| 1 | 0–5s | 冷启动到 **Today** 视图(建议已 seed 几条任务,避免空态) | “Every morning, same question: *what do I actually do first?*” | 用 demo/访客账号预置数据,别现场注册 |
| 2 | 5–12s | 快速敲进 2–3 条任务 | “Dump everything in — 30 seconds.” | 展示输入顺滑 + 中英混排也行 |
| 3 | 12–22s | 点 **AI 一键分类**,任务自动落到四象限 | “One click — AI sorts them by urgency × importance.” | 关键差异点,给个短暂停顿看结果 |
| 4 | 22–32s | **拖拽**一条任务跨象限(Q2→Q1),卡片 settle 动画 | “Disagree? Just drag. It’s *your* matrix.” | 体现掌控感,非黑箱 |
| 5 | 32–45s | 点 Q1 任务进 **全屏番茄专注**,计时启动;切一下标签页再切回,计时**没断** | “Pick one. Focus. The timer survives tab switches.” | Web Worker 计时是真卖点,值得演“切标签不掉” |
| 6 | 45–55s | 计时结束/手动完成,**Lumo 宠物庆祝**微动画 + 任务划入完成 | “Done. Lumo cheers. Small dopamine, on purpose.” | 情绪钩子,别停太久 |
| 7 | 55–70s | 切 **Stats**,展示完成曲线 + 可分享 PNG;一带而过桌面版/PWA 安装图标 | “Track streaks, share your week. Web, PWA, or desktop.” | 收尾展示广度,不逐个点开 |
| 8 | 70–85s | 定格 logo + 一行大字 + demo 链接 | **“100% of the code is written by AI. Live demo → …”** | 元钩子做**收尾定帧**(主叙事若 Jalen 拍板为效率工具,可把此行降为副标,见 §8.1) |

### 10.2 无声 GIF(8–12s,循环)
镜 2 → 镜 3 → 镜 4 三步接龙(加任务 → AI 分类 → 拖象限),末帧压一行字幕 `Sort your day in 10 seconds`。**不带**番茄/统计,保持短、可循环、体积小。

### 10.3 录制注意(避免翻车)
- **数据预置**:用 demo/访客账号提前建好任务,演示时只做“分类/拖拽/专注”动作,别现场注册/等 AI 冷启动。
- **AI 分类兜底**:若录制环境无 LLM Key,启发式兜底也能出象限结果——照常录,别演“等模型返回”的空窗。
- **只演已上线功能**:严格对齐 ROADMAP「Current State」清单(四象限 / 番茄 / AI 分类 / 习惯 / 统计 PNG / PWA / 桌面版)。不演路线图上还没做的(如年度 Wrapped、Web Push 提醒)。
- **claims 一致性**:结尾“100% AI-coded”表述与主叙事最终口径保持一致(§8.1 / §9 事实基线),demo 链接指向可用的访客登录页而非“完全免注册”。

### 10.4 复用
- 主 Demo → 落地页首屏、Show HN 帖内首评、B 站/YouTube 长解说的开场。
- GIF → PH 头图、README 顶部、X thread 第 1 条。
- 分镜 6/5 的单镜(专注不掉 + 宠物庆祝)可各截一条 5–8s 短视频,喂 §9.2 追问预案与 build-in-public thread。
