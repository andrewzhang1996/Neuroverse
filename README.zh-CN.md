<div align="center">

# Neuroverse

**完全本地运行的开源 Agent SKILL + 3D 宇宙神经网络可观测界面**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js >= 20](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Zero Runtime Deps](https://img.shields.io/badge/Server%20Deps-Zero-brightgreen)](#核心特性)

[English](./README.md) | **简体中文**

</div>

---

**Neuroverse** 将本地 AI Agent 的运行拓扑与生命周期实时映射为**《星际穿越》×《Universe Sandbox（宇宙沙盘）》× 生物神经突触 × 克制排版**风格的动态 3D 可交互星图。

无论你使用的是 **Claude Code**、**Codex**、**Antigravity**、**DeepSeek Harness**、**Doubao Work** 还是任何自研本地智能体，只需接入轻量级 [`SKILL.md`](./SKILL.md)，Agent 就会以极低 Token 消耗维护本地语义 JSON 状态文件，前端通过 `fs.watch + SSE` 毫秒级同步渲染。

---

## 核心特性

- **跨工具通用协议（Universal Agent SKILL）**：不绑定任何特定 SDK。只要 Agent 能执行本地命令或写文件，即可驱动三维状态星图。
- **状态与渲染彻底解耦（极省 Token）**：
  - **Agent 侧**：仅按单节点小文件（`~/.neuroverse/state/nodes/<id>.json`）维护纯语义状态（`running` / `tool_calling` / `waiting` / `completed` / `idle` / `error`、模型、任务、调用工具链、执行结果），零并发写冲突，永不触碰坐标或样式代码。
  - **前端侧**：内置声明式 `definitions.json`（状态驱动的 3D 发光、脉冲与详情字段契约），通过本地 `fs.watch + SSE` 毫秒级同步渲染。
- **Universe Sandbox × 3D 神经网络交互**：
  - 三层核心天体/神经元拓扑：**`Harness（宿主恒星）→ Session（环绕主神经元）→ Subagent（树突卫星节点）`** 及跨节点 **`Collaborates（动态突触桥）`**。
  - 自定义 GLSL 恒星等离子体与大气日冕着色器 + ACES Filmic HDR 物理泛光（`UnrealBloomPass`）：活跃节点白炽脉冲闪烁、突触光子流穿梭；已完成节点自然冷却为静谧暗星。
  - 点击任意节点平滑飞行并**锁定跟随（Camera Tethering）**，配合屏幕空间高精度瞄准框（Reticle）与右侧高可读性遥测详情抽屉（Node Inspector）。

---

## 快速开始

> **环境要求**：Node.js `>= 20`

```bash
# 1. 安装前端构建依赖并构建本地静态产物
npm install
npm run build

# 2. 启动本地可视化服务（默认 http://127.0.0.1:4399，零运行时第三方依赖）
npm start

# 3. （可选）在另一个终端运行多 Harness 并发神经网络演示
npm run demo
```

开发模式（Vite HMR + 实时本地 API）：

```bash
npm run dev
```

---

## 作为 Agent SKILL 安装

将本仓库克隆或软链接到对应工具的 `skills` 目录即可：

```bash
# Claude Code
ln -s /path/to/Neuroverse ~/.claude/skills/neuroverse

# Codex
ln -s /path/to/Neuroverse ~/.codex/skills/neuroverse

# Antigravity (全局或项目级 .agents/skills/)
ln -s /path/to/Neuroverse ~/.gemini/config/skills/neuroverse
```

---

## 常用 CLI 命令

```bash
# 后台守护进程启动服务
node scripts/neuroverse.mjs serve --daemon

# 查看服务健康状态
node scripts/neuroverse.mjs status

# 运行内置模拟场景
npm run demo           # 多 Harness 生命周期演示
npm run demo:stream    # 持续流式动态演示
npm run demo:massive   # 160+ 节点大规模星图压测演示
```

---

## 文档导航

- [SKILL.md](./SKILL.md) — 给 Agent 阅读的最小化上报指令与 CLI 手册
- [references/schema.md](./references/schema.md) — `neuroverse/v1` JSON 状态文件与字段协议
- [references/default-definitions.json](./references/default-definitions.json) — 内置节点/突触类型与 3D 状态视觉预设表
- [docs/01-architecture.md](./docs/01-architecture.md) — 系统目录结构、无依赖状态存储、CLI 与 SSE 服务规范
- [docs/02-visual-and-aesthetic-spec.md](./docs/02-visual-and-aesthetic-spec.md) — 视觉审美准则、GLSL 着色器源码、天体轨道数学与 HUD 规范
- [docs/03-mvp-implementation-plan.md](./docs/03-mvp-implementation-plan.md) — 分步实施与测试验收蓝图（M1–M7）

---

## 参与贡献与开源协议

欢迎提交 Issue 与 Pull Request！请在贡献前阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [行为准则](./CODE_OF_CONDUCT.md)。

本项目基于 [MIT License](./LICENSE) 开源。
