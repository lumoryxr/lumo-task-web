<div align="center">

# Lumo Task

**专注驱动的任务管理**

[![CI](https://github.com/lumoryxr/lumo-task-web/actions/workflows/ci.yml/badge.svg)](https://github.com/lumoryxr/lumo-task-web/actions/workflows/ci.yml)
[![Release](https://github.com/lumoryxr/lumo-task-web/actions/workflows/release-desktop.yml/badge.svg)](https://github.com/lumoryxr/lumo-task-web/releases)
[![Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://task.lumoryxr.com/?ref=readme)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![AI-Coded](https://img.shields.io/badge/coded%20by-AI%20only-blueviolet?logo=anthropic)](https://claude.ai)

**[English](README.md) | [中文](README.zh.md)**

[在线 Demo](https://task.lumoryxr.com/?ref=readme) · [发布版本](https://github.com/lumoryxr/lumo-task-web/releases) · [贡献指南](.github/CONTRIBUTING.md)

</div>

---

Lumo Task 是一款全栈任务管理应用，以艾森豪威尔矩阵、番茄钟专注计时器和 AI 辅助分类为核心——支持 Web、PWA 以及 Windows 桌面端。

> **100% 由 AI 编写。** 本项目所有代码、提交和 PR 均由 [Claude (Anthropic)](https://claude.ai) 生成。这是一项关于 AI 驱动软件开发的长期实验。

---

## 功能亮点

| 功能 | 说明 |
|------|------|
| 今日视图 | 推荐任务卡片 + 当日已完成时间轴 |
| 艾森豪威尔矩阵 | 四象限（Q1–Q4）拖拽排列，理清轻重缓急 |
| 专注 / 番茄钟 | 全屏专注模式，Web Worker 计时器，切换标签页不中断 |
| AI 智能分类 | 一键 LLM 分类，带启发式回退 |
| 习惯打卡 | 每日打卡对话框 + 已打卡徽章 |
| 新手引导 | 5 步引导流程，帮助新用户快速上手 |
| 日历周视图 | 拖拽任务到日历以设置截止日期 |
| 统计与导出 | 统计页面，支持导出可分享的 PNG |
| 双语支持 | 完整中英文界面，运行时切换 |
| 主题配色 | 4 种强调色，可按用户配置 |
| PWA | 可安装，支持离线 shell |
| 移动端布局 | 底部标签栏，适配小屏幕 |
| 桌面端 | Electron 打包的 Windows 安装包 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18、TypeScript 5、Vite 5 |
| 状态管理 | Zustand |
| 路由 | React Router 6 |
| 样式 | Tailwind CSS（设计 token） |
| 后端框架 | Hono（Node.js） |
| 数据库 | SQLite |
| 鉴权 | JWT（jose）、bcryptjs |
| 校验 | Zod |
| 测试 | Vitest + React Testing Library、Node `--test`、Playwright |
| 桌面端 | Electron |
| 托管 | Render（前端 + 后端） |
| CI/CD | GitHub Actions |

---

## 快速开始

**前提条件：** Node.js 22+

```bash
git clone https://github.com/lumoryxr/lumo-task-web.git
cd lumo-task-web

# 同时启动前端和后端
make dev-full
```

Web 应用运行在 `http://localhost:5173`，API 运行在 `http://localhost:3000`。

### 可用的 Make 命令

| 命令 | 说明 |
|------|------|
| `make dev` | 仅前端（`http://localhost:5173`） |
| `make dev-full` | 前端 + 后端 |
| `make backend-migrate` | 初始化 SQLite 数据库 |
| `make backend-seed` | 注入演示数据 |
| `make ci` | 类型检查 + lint + 构建（本地 CI） |

### Windows 桌面端

从 [Releases](https://github.com/lumoryxr/lumo-task-web/releases) 下载最新的 `Lumo Task Setup x.x.x.exe` 并运行安装程序。

> 若 Windows SmartScreen 弹出提示，点击「更多信息」→「仍要运行」即可。

#### 云同步（本地优先，默认关闭）

桌面端是**本地优先**的：所有数据存在本地 SQLite 文件中，完全离线可用。云同步需手动开启。

**开启方式（终端用户）：**

1. 打开 **设置 → 数据与同步**。
2. 点击 **开启云同步**。
3. 用你的**云账号邮箱 + 密码**登录。

就这样——**不需要填任何 URL、token 或配置文件**。应用会登录云后端，把返回的 token **加密存储**（AES-256-GCM），先做一次全量对账，之后后台自动同步（约每 30 秒一次），也可点**立即同步**。冲突按 last-write-wins（HLC 时间戳）解决。只同步你自己的数据——服务端按账号过滤。

> 云同步**仅桌面端**。Web 版直接连它的云数据库，因此没有同步开关。

**每台安装的密钥自动生成** —— `LUMO_JWT_SECRET`、`LUMO_ENCRYPTION_KEY` 在首次启动时生成并持久化到应用的 userData 目录，用户无需配置。

**连哪个后端：** 桌面版按以下顺序解析云端地址（`web-app/electron/cloudEndpoint.cjs`）：

1. **用户在设置 → 数据与同步里保存的自定义服务器**（供自托管用户）。
2. **打包前烤入的 `LUMO_CLOUD_API_BASE`**。
3. **内置的生产默认值：**

   ```
   https://task.lumoryxr.com
   ```

这三者都是本地、由机器所有者控制的来源——地址**绝不通过 HTTP API 接受**（请求体传入的地址在共享云上是 SSRF 漏洞）。用户填入的地址在保存前会校验为 `https` origin（本地可用 `http://localhost`）且不带路径，保存后应用会重启以重新连接。

若要改打包默认值，在**打包前**设置该环境变量：

```bash
LUMO_CLOUD_API_BASE=https://your-backend.example.com make package-win
```

要让同步真正成功，那个后端必须已部署且可达（提供 `/v1/auth/signin` 与 `/v1/sync/pull|push`）、有自己的 Turso 库 + 密钥，且用户在其上有账号。Windows 安装包由 **Package Windows** / **Release (Windows)** 这两个 GitHub Actions 流水线在 Windows runner 上构建（`workflow_dispatch` 手动触发）；二者都不设 `LUMO_CLOUD_API_BASE`，因此使用上面 `main.cjs` 的默认值。

---

## 项目结构

```
lumo-task-web/
├── web-app/          # React 前端（Vite、TypeScript、Zustand）
│   └── src/
│       ├── components/   # UI 组件 + __tests__/
│       ├── pages/        # 路由级页面
│       ├── store/        # Zustand store
│       ├── api/          # HTTP 客户端（client.ts）
│       ├── types/        # 共享 TypeScript 类型
│       └── i18n/         # 中英文字符串（strings.ts）
├── backend/          # Hono REST API（Node.js、SQLite、JWT）
│   └── src/
│       ├── routes/       # tasks、auth、users、health
│       ├── middleware/   # JWT 鉴权、CORS、错误处理
│       └── lib/          # errors、jwt、validation
├── docs/             # PRD、工程原则、路线图
├── .github/          # CI 工作流、issue 模板、贡献指南
├── CLAUDE.md         # 工程标准（请勿修改）
├── ARCHITECTURE.md   # 架构概览
└── CHANGELOG.md      # 发布历史
```

---

## 部署

Lumo Task 使用 **Render（前端 + 后端）** 的免费方案，前后端统一在同一个
`render.yaml` 蓝图中定义。

| 服务 | 平台 | 配置文件 |
|------|------|----------|
| 前端 SPA | Render（静态站点） | `render.yaml` |
| 后端 API | Render（Web 服务） | `render.yaml` |

**环境变量：**

```bash
# Render（前端静态站点）
VITE_API_BASE=https://your-backend.onrender.com/v1

# Render（后端 Web 服务）
LUMO_JWT_SECRET=<生成一个随机密钥>
LUMO_ALLOWED_ORIGINS=https://your-frontend.onrender.com
NODE_VERSION=22
```

---

## CI/CD 流水线

```
提交 Pull Request
 └── GitHub Actions CI
      ├── TypeScript 类型检查（前端 + 后端）
      ├── ESLint
      ├── Vite 构建验证
      ├── 后端编译（tsc + esbuild）
      └── npm audit 安全扫描

合并到 main
 ├── Render 自动部署前端（生产环境）
 ├── Render 自动部署后端（生产环境）
 └── GitHub Actions 打包 Windows 安装包 → GitHub Releases
```

---

## 参与贡献

**为什么来这里贡献？** 这是极少数「你不手写代码，而是**指挥 AI 写代码**再提 PR」的开源项目。它是一场人 + AI 协作开发的真实实验，技术栈现代（React 18 / TS / Hono / Zod 契约），CI 严格，每个 PR 都会真跑一遍 code-review。练手扎实、简历上一行别人没有的经历，还能近距离看 AI 驱动开发能走多远。

**5 分钟提交你的第一个 PR：**

1. Fork 仓库并跑起来：`make dev-full`（见[快速开始](#快速开始)）。
2. 挑一个带 [`good-first-issue`](https://github.com/lumoryxr/lumo-task-web/issues?q=is%3Aissue+is%3Aopen+label%3Agood-first-issue) 或 [`help-wanted`](https://github.com/lumoryxr/lumo-task-web/issues?q=is%3Aissue+is%3Aopen+label%3Ahelp-wanted) 标签的 issue。
3. 用任意 AI（Claude、GPT、Gemini……）生成改动，遵循 [`CLAUDE.md`](CLAUDE.md) 的工程标准与 [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) 的流程（契约先行、验收标准即测试、本地门禁全绿）。
4. 提交 PR，并在描述里**注明你用了哪个 AI**。

我们力争在 48 小时内对每个新 PR 做出首次回应。分支命名、提交规范、本地门禁怎么跑见 [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)，架构心智模型见 [`ARCHITECTURE.md`](ARCHITECTURE.md)。

---

## 关于本项目

**本项目 100% 由 AI 编写和维护。**

所有代码、文档和配置均由 [Claude (Anthropic)](https://claude.ai) 生成并通过 Pull Request 提交。这是一项关于 AI 驱动软件开发的长期实验——探索 AI 能否独立承担一个完整产品从 0 到 1 再到持续迭代的全生命周期。

**贡献规则：**

| | |
|---|---|
| AI 提交 Pull Request | 欢迎 |
| AI 审查 / 修复 CI 错误 | 欢迎 |
| AI 添加功能 / 修复 Bug | 欢迎 |
| 人工直接修改代码 | 不允许 |
| 人工绕过 PR 直接 push | 不允许 |

如果你想参与：请用任意 AI（Claude、GPT、Gemini……）生成代码，以 Pull Request 的形式提交，并在 PR 描述中注明使用了哪个 AI。

---

## License

[Apache License 2.0](LICENSE) © [lumoryxr](https://github.com/lumoryxr)

个人与商业均可免费使用。再分发或二次开发时必须保留署名——保留 `LICENSE` 与
`NOTICE` 文件并注明来源（详见 [`NOTICE`](NOTICE)）。
