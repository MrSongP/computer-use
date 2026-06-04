# computer_use

中文 | [English](#english)

`computer_use` 是一个本地 Windows computer-use 插件项目。它把窗口发现、窗口截图、UIA 文本树、鼠标/键盘输入、窗口激活、生命周期和 trace 统一到一个 TypeScript runtime 中，并通过插件 manifest 与 MCP server 暴露给 Codex 和 Claude Code 使用。

这个仓库不是官方 OpenAI `computer-use` 客户端的调包包装。项目插件根目录是 [`computer_use`](./computer_use/)，真实入口是 [`computer_use/.codex-plugin/plugin.json`](./computer_use/.codex-plugin/plugin.json)、[`computer_use/.mcp.json`](./computer_use/.mcp.json) 和 [`computer_use/skills/computer-use/SKILL.md`](./computer_use/skills/computer-use/SKILL.md)。

## 能力

- `list_apps`、`list_windows`、`get_window`、`launch_app`
- `launch_app` 默认会拦截重复冷启动：如果发现已有实例，就通过 hook 拒绝这次启动，并返回去任务栏/托盘恢复现有会话的指引；只有显式要求时才 `force_new`
- `list_apps` 里会额外暴露 `windows.shell.taskbar`，供模型截图和点击任务栏/通知区域
- `get_window_state`，包含截图和结构化 UIA 节点树
- `click`、`click_element`、`press_key`、`type_text`、`scroll`、`set_value`、`drag`、`perform_secondary_action`、`activate_window`
- `end_turn`、turn lifecycle、interrupt 和 trace evidence
- Codex adapter、Claude Code MCP adapter、native-host Windows bridge

## 安装到 Claude Code

从仓库根目录执行一键安装脚本：

```powershell
cd G:\Desktop\computer_use
powershell -ExecutionPolicy Bypass -File .\install-claude-code.ps1
```

也兼容旧入口 `.\scripts\install-claude-code.ps1`。

这个脚本会完成：

1. `npm run build`
2. `claude plugin validate` 校验 root marketplace 与插件 manifest
3. `node .\scripts\smoke-claude-mcp.mjs` 验证 MCP 握手与工具注册
4. `claude plugin marketplace add G:\Desktop\computer_use`
5. `claude plugin install computer-use@computer-use-local --scope user`

安装完成后，在当前 Claude Code 会话里执行 `/reload-plugins`，或者直接开一个新会话。

安装脚本还会自动把 `mcp__plugin_computer-use_computer-use` 合并写入用户级 `~/.claude/settings.json`，这样 Claude Code 会把整个 `computer-use` MCP server 视为已允许，避免 `launch_app`、`click`、`type_text` 这类调用每一步都弹 `Yes`。这是用户级配置，所以不依赖你从哪个目录启动 Claude Code。

安装脚本现在会先按 UTF-8 预检并备份 `~/.claude/settings.json`，如果后续安装链路失败，会自动恢复原始 settings 和插件安装状态，避免“插件已经重装了但脚本整体报错”的半成功状态。

Claude Code 的 marketplace manifest 在 [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json)，它会把 [`./computer_use`](./computer_use/) 作为真实插件目录安装。

## 安装到 Codex

从仓库根目录执行一键安装脚本：

```powershell
cd G:\Desktop\computer_use
powershell -ExecutionPolicy Bypass -File .\scripts\install-codex.ps1
```

这个脚本会完成：

1. `npm run build`
2. `node .\scripts\smoke-claude-mcp.mjs` 验证共享 MCP 入口
3. `codex plugin marketplace add G:\Desktop\computer_use`
4. `codex plugin add computer-use@computer-use-local`

安装完成后，开一个新线程，让 Codex 重新加载插件 skill 和 MCP tools，然后直接描述 Windows 自动化任务，或明确要求使用 `@computer-use` / `computer-use`。

Codex 的 marketplace 文件在 [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json)，指向 [`./computer_use`](./computer_use/) 插件目录。

## 开发与验证

```powershell
cd G:\Desktop\computer_use\computer_use
npm install
npm run typecheck
npm test
```

常用专项验证：

```powershell
npx tsx --test tests/integration/codex-adapter.test.ts
npx tsx --test tests/integration/claude-code-adapter.test.ts
npx tsx --test tests/integration/stdio-runtime.test.ts
npx tsx --test tests/integration/native-host-p5-smoke.test.ts
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-computer-use.ps1 -Target Claude
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-computer-use.ps1 -Target Codex
```

`npm run codex:helper` 只用于开发调试本地 JSON-RPC helper，不是 Codex 安装插件后的常规使用入口。

## 文档

- 项目 handoff：[doc/computer-use.md](./doc/computer-use.md)
- 文档入口：[doc/README.md](./doc/README.md)
- 架构 harness：[doc/harness/architecture.md](./doc/harness/architecture.md)
- action lane harness：[doc/harness/action-lane.md](./doc/harness/action-lane.md)
- 插件安装 harness：[doc/harness/plugin-installation.md](./doc/harness/plugin-installation.md)
- 能力矩阵：[doc/acceptance/capability-matrix.md](./doc/acceptance/capability-matrix.md)

## 维护边界

- 以本地 TypeScript contracts 和 MCP schema 为准，不以官方 `computer-use` 调包示例为准。
- 不再维护根目录 `scripts/computer-use-client.mjs` 兼容脚本。
- 文档只保留长期入口、安装路径、验收口径和 harness；具体 capability 细节优先看代码和测试。
- Windows UI 自动化可能影响真实桌面状态，执行前要确认目标窗口和用户意图。

---

## English

`computer_use` is a local Windows computer-use plugin project. It unifies window discovery, window snapshots, UIA text trees, mouse/keyboard input, window activation, turn lifecycle, and trace evidence in a TypeScript runtime, then exposes that runtime to Codex and Claude Code through plugin manifests and an MCP server.

This repository is not a thin wrapper around the official OpenAI `computer-use` client. The plugin root is [`computer_use`](./computer_use/), and the real entrypoints are [`computer_use/.codex-plugin/plugin.json`](./computer_use/.codex-plugin/plugin.json), [`computer_use/.mcp.json`](./computer_use/.mcp.json), and [`computer_use/skills/computer-use/SKILL.md`](./computer_use/skills/computer-use/SKILL.md).

## Capabilities

- `list_apps`, `list_windows`, `get_window`, `launch_app`
- `launch_app` blocks duplicate cold-launches by default: if an existing session is detected, the hook rejects the launch and returns guidance to restore the app from the taskbar or tray; only an explicit `force_new` bypasses that behavior
- `list_apps` also exposes `windows.shell.taskbar` so the model has an official shell target for taskbar and notification-area inspection/clicking
- `get_window_state` with screenshots and a structured UIA node tree
- `click`, `click_element`, `press_key`, `type_text`, `scroll`, `set_value`, `drag`, `perform_secondary_action`, `activate_window`
- `end_turn`, turn lifecycle, interrupts, and trace evidence
- Codex adapter, Claude Code MCP adapter, and a Windows native-host bridge

## Install In Claude Code

Run the dedicated Claude Code installer from the repository root:

```powershell
cd G:\Desktop\computer_use
powershell -ExecutionPolicy Bypass -File .\install-claude-code.ps1
```

The legacy `.\scripts\install-claude-code.ps1` entrypoint still works.

It builds the runtime, validates the Claude marketplace and plugin manifests, runs an MCP smoke test, registers the local marketplace, and installs `computer-use@computer-use-local`.

After the installer finishes, run `/reload-plugins` in the current Claude Code session or start a new session.

The installer also merges `mcp__plugin_computer-use_computer-use` into your user-level `~/.claude/settings.json`, so Claude Code treats the entire `computer-use` MCP server as allowed and can call `launch_app`, `click`, `type_text`, and related tools without a per-step approval prompt. Because this is a user-level setting, it does not depend on which working directory you launch Claude Code from.

Before changing that file, the installer now preflights it as UTF-8 and creates a backup. If a later step fails, it automatically restores the previous settings file and plugin install state.

The Claude Code marketplace manifest lives at [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) and points at the real plugin root under [`./computer_use`](./computer_use/).

## Install In Codex

Run the dedicated Codex installer from the repository root:

```powershell
cd G:\Desktop\computer_use
powershell -ExecutionPolicy Bypass -File .\scripts\install-codex.ps1
```

It builds the runtime, runs the shared MCP smoke test, registers the local marketplace, and installs `computer-use@computer-use-local`.

After the installer finishes, start a new thread so Codex reloads the plugin skill and MCP tools.

The local Codex marketplace file is [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json), and it points to the [`./computer_use`](./computer_use/) plugin directory.

## Development And Verification

```powershell
cd G:\Desktop\computer_use\computer_use
npm install
npm run typecheck
npm test
```

Focused checks:

```powershell
npx tsx --test tests/integration/codex-adapter.test.ts
npx tsx --test tests/integration/claude-code-adapter.test.ts
npx tsx --test tests/integration/stdio-runtime.test.ts
npx tsx --test tests/integration/native-host-p5-smoke.test.ts
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-computer-use.ps1 -Target Claude
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-computer-use.ps1 -Target Codex
```

`npm run codex:helper` is only a local JSON-RPC helper harness for development. It is not the normal entrypoint after installing the Codex plugin.

## Documentation

- Project handoff: [doc/computer-use.md](./doc/computer-use.md)
- Documentation index: [doc/README.md](./doc/README.md)
- Architecture harness: [doc/harness/architecture.md](./doc/harness/architecture.md)
- Action lane harness: [doc/harness/action-lane.md](./doc/harness/action-lane.md)
- Plugin installation harness: [doc/harness/plugin-installation.md](./doc/harness/plugin-installation.md)
- Capability matrix: [doc/acceptance/capability-matrix.md](./doc/acceptance/capability-matrix.md)

## Maintenance Boundaries

- Trust the local TypeScript contracts and MCP schemas over official `computer-use` client examples.
- The root `scripts/computer-use-client.mjs` compatibility script is no longer maintained.
- Keep docs focused on durable entrypoints, installation, acceptance criteria, and harness notes; capability details belong in code and tests.
- Windows UI automation can affect the real desktop state, so confirm the target window and user intent before taking action.
