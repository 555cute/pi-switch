# pi-switch

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](#)

类似 [CC Switch](https://github.com/farion1231/cc-switch) 的 **pi 专用桌面控制台**：管理模型供应商、Token 用量、技能与包，并增强对 pi 的配置级与运行时控制。

## 功能

| 模块 | 说明 |
|------|------|
| **概览** | 今日 / 全量用量、默认模型、Top tools & skills |
| **供应商** | 读写 `~/.pi/agent/models.json` / `auth.json`，切换默认模型 |
| **扩展** | Packages 与 Skills 统一管理，支持 package-level 覆盖 |
| **用量** | 解析会话 JSONL 汇总 token / cost / cache / 工具调用 |
| **设置** | 外观、窗口、缓存、快捷键、备份、进程控制、系统提示等 |

默认**只读解析** pi 数据；写入操作（供应商、备份、覆盖项等）可在 UI 中显式触发。

## 截图

> 应用采用 macOS 风格浅色界面：顶栏 Tab + 设置页左侧树形导航。

## 运行

### 桌面应用（推荐）

无边框 Electron 窗口 + 自定义标题栏：

```bash
npm install
npm run dev:desktop
```

会同时启动 API（`8787`）、Vite（`1420`）和 Electron 窗口。

### 浏览器预览（调试）

```bash
npm run dev
# http://127.0.0.1:1420
```

### Tauri（可选，需 MSVC / 系统工具链）

`src-tauri/` 保留完整 Rust 实现：

```bash
npm run tauri:dev
```

## 技术栈

- **Backend**: Node.js + TypeScript（`server/`）
- **Frontend**: React 19 + Vite + TypeScript
- **Desktop**: Electron（主路径）/ Tauri 2（可选）

## 数据路径

```
~/.pi/agent/models.json
~/.pi/agent/auth.json
~/.pi/agent/settings.json
~/.pi/agent/sessions/**
~/.pi/agent/skills/**
~/.agents/skills/**
~/.pi/agent/npm/**
~/.pi-switch/settings.json              # 本应用设置
~/.pi-switch/package-overrides.json     # 包/技能覆盖
~/.pi/agent/pi-switch/usage-events.jsonl # 可选 extension
```

Windows 下 pi-switch 配置默认在 `%APPDATA%\pi-switch\`。

## 可选实时埋点 extension

```bash
pi -e ./extensions/pi-switch-usage
```

## 安全

- UI 中 API Key 默认脱敏
- 推荐在 pi 配置里用 `$ENV_VAR` / `!command` 引用密钥
- **请勿**将本机 `auth.json` 或含真实密钥的文件提交到仓库
- 写入 `auth.json` 时会 pretty-print，请保持系统级文件权限

## 路线图

- [ ] Packages 页一键 `pi install` / `pi remove`
- [ ] Provider 连通性探测
- [ ] 用量 CSV 导出
- [ ] 托盘快速切换默认模型
- [ ] Electron Builder 正式打包分发
- [ ] 统一 Tauri invoke 与 HTTP API 双后端

## 贡献

Issue / PR 欢迎。开发前请先 `npm install` 并确认 `npm run dev` 可跑通。

## License

[MIT](./LICENSE) © 2026 555cute
