# computer_use

中文 | [English](#english)

`computer_use` 是一个本地 Windows computer-use 插件项目。它把窗口发现、窗口截图、UIA 文本树、鼠标/键盘输入、窗口激活、生命周期和 trace 统一到一个 TypeScript runtime 中，并通过 Codex 插件 manifest 与 MCP server 暴露给 Codex 使用。

这个仓库不是官方 OpenAI `computer-use` 客户端的调包包装。项目插件根目录是 [`computer_use`](./computer_use/)，真实入口是 [`computer_use/.codex-plugin/plugin.json`](./computer_use/.codex-plugin/plugin.json)、[`computer_use/.mcp.json`](./computer_use/.mcp.json) 和 [`computer_use/skills/computer-use/SKILL.md`](./computer_use/skills/computer-use/SKILL.md)。

## 能力

- `list_apps`、`list_windows`、`get_window`、`launch_app`
- `get_window_state`，包含截图和结构化 UIA 节点树
- `click`、`click_element`、`press_key`、`type_text`、`scroll`、`set_value`、`drag`、`perform_secondary_action`、`activate_window`
- `end_turn`、turn lifecycle、interrupt 和 trace evidence
- Codex adapter、Claude Code MCP adapter、native-host Windows bridge

## 安装到 Codex

从仓库根目录注册本地 marketplace：

```powershell
cd G:\Desktop\computer_use
codex plugin marketplace add G:\Desktop\computer_use
```

然后在 Codex 中安装：

1. 打开 Codex App 的 **Plugins**，或在 Codex CLI 中输入 `/plugins`。
2. 切到 `computer_use Local` / `computer-use-local` marketplace。
3. 安装 `computer-use`。
4. 开一个新线程，让 Codex 重新加载插件 skill 和 MCP tools。
5. 在新线程中直接描述 Windows 自动化任务，或明确要求使用 `@computer-use` / `computer-use`。

本地 marketplace 文件在 [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json)，指向 [`./computer_use`](./computer_use/) 插件目录。更新插件后，重启 Codex 或重新安装插件，再从新线程验证。

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

`computer_use` is a local Windows computer-use plugin project. It unifies window discovery, window snapshots, UIA text trees, mouse/keyboard input, window activation, turn lifecycle, and trace evidence in a TypeScript runtime, then exposes that runtime to Codex through a plugin manifest and MCP server.

This repository is not a thin wrapper around the official OpenAI `computer-use` client. The plugin root is [`computer_use`](./computer_use/), and the real entrypoints are [`computer_use/.codex-plugin/plugin.json`](./computer_use/.codex-plugin/plugin.json), [`computer_use/.mcp.json`](./computer_use/.mcp.json), and [`computer_use/skills/computer-use/SKILL.md`](./computer_use/skills/computer-use/SKILL.md).

## Capabilities

- `list_apps`, `list_windows`, `get_window`, `launch_app`
- `get_window_state` with screenshots and a structured UIA node tree
- `click`, `click_element`, `press_key`, `type_text`, `scroll`, `set_value`, `drag`, `perform_secondary_action`, `activate_window`
- `end_turn`, turn lifecycle, interrupts, and trace evidence
- Codex adapter, Claude Code MCP adapter, and a Windows native-host bridge

## Install In Codex

Register the local marketplace from the repository root:

```powershell
cd G:\Desktop\computer_use
codex plugin marketplace add G:\Desktop\computer_use
```

Then install it in Codex:

1. Open **Plugins** in the Codex app, or type `/plugins` in Codex CLI.
2. Select the `computer_use Local` / `computer-use-local` marketplace.
3. Install `computer-use`.
4. Start a new thread so Codex reloads the plugin skill and MCP tools.
5. Ask for the Windows automation task directly, or explicitly mention `@computer-use` / `computer-use`.

The local marketplace file is [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json), and it points to the [`./computer_use`](./computer_use/) plugin directory. After changing the plugin, restart Codex or reinstall the plugin, then verify from a new thread.

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
