<div align="center">

# Lumo Task

**专注驱动的任务管理**

[![CI](https://github.com/lumoryxr/lumo-task-web/actions/workflows/ci.yml/badge.svg)](https://github.com/lumoryxr/lumo-task-web/actions/workflows/ci.yml)
[![Release](https://github.com/lumoryxr/lumo-task-web/actions/workflows/release-windows.yml/badge.svg)](https://github.com/lumoryxr/lumo-task-web/releases)
[![Demo](https://img.shields.io/badge/demo-live-brightgreen?logo=vercel)](https://lumo-task-web.vercel.app)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![AI-Coded](https://img.shields.io/badge/coded%20by-AI%20only-blueviolet?logo=anthropic)](https://claude.ai)

**[English](README.md) | [中文](README.zh.md)**

[在线 Demo](https://lumo-task-web.vercel.app) · [发布版本](https://github.com/lumoryxr/lumo-task-web/releases) · [贡献指南](.github/CONTRIBUTING.md)

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
| 托管 | Vercel（前端）、Render（后端） |
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

Lumo Task 使用 **Vercel（前端）+ Render（后端）** 的免费方案。

| 服务 | 平台 | 配置文件 |
|------|------|----------|
| 前端 SPA | Vercel | `vercel.json` |
| 后端 API | Render | `render.yaml` |

**环境变量：**

```bash
# Vercel（前端）
VITE_API_BASE=https://your-backend.onrender.com/v1

# Render（后端）
LUMO_JWT_SECRET=<生成一个随机密钥>
LUMO_ALLOWED_ORIGINS=.vercel.app
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
 ├── Vercel 自动部署前端（生产环境）
 ├── Render 自动部署后端（生产环境）
 └── GitHub Actions 打包 Windows 安装包 → GitHub Releases
```

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

MIT © [lumoryxr](https://github.com/lumoryxr)
