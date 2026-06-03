# computer-use-ts

中文 | [English](#english)

`computer-use-ts` 是这个仓库里的本地 Windows computer-use 插件实现。它不是官方客户端的调包路径，而是一个 TypeScript runtime：共享 core 负责 contracts、dispatcher、lifecycle 和 trace，Windows 层负责 capture / UIA / input / launch，Codex 与 Claude Code 通过 adapter 使用同一套能力。

## 插件安装

这个目录本身就是插件根目录，关键文件是：

- [`.codex-plugin/plugin.json`](./.codex-plugin/plugin.json)
- [`.claude-plugin/plugin.json`](./.claude-plugin/plugin.json)
- [`.mcp.json`](./.mcp.json)
- [`skills/computer-use/SKILL.md`](./skills/computer-use/SKILL.md)

Claude Code 和 Codex 分开安装，分别使用仓库根目录下的宿主脚本：

```powershell
cd G:\Desktop\computer_use
powershell -ExecutionPolicy Bypass -File .\scripts\install-claude-code.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\install-codex.ps1
```

- `install-claude-code.ps1` 负责 Claude Code marketplace 注册、插件重装和 doctor。
- `install-codex.ps1` 负责 Codex marketplace 注册、插件重装和 doctor。
- `install-claude-code.ps1` 会先 `npm run build`、做 Claude manifest 校验，并跑 MCP smoke test。
- `install-codex.ps1` 会先 `npm run build`，并跑共享 MCP smoke test。

## 能力

- discovery / launch：`list_apps`、`list_windows`、`get_window`、`launch_app`
- capture / UIA：`get_window_state`、`click_element`、`set_value`、`perform_secondary_action`
- action / lifecycle：`activate_window`、`click`、`press_key`、`type_text`、`scroll`、`drag`、`end_turn`
- trace/debug：env、runtime config 和 request meta 三种开关

## 脚本

- `npm run build`
- `npm run codex:helper`
- `npm run typecheck`
- `npm test`
- `powershell -ExecutionPolicy Bypass -File ..\scripts\doctor-computer-use.ps1 -Target Claude`
- `powershell -ExecutionPolicy Bypass -File ..\scripts\doctor-computer-use.ps1 -Target Codex`

`npm run codex:helper` 只用于 adapter smoke test 或手动调试本地 JSON-RPC helper。Codex 安装插件后不需要根目录的 `scripts/computer-use-client.mjs`，该兼容脚本已移除。

## Runtime Notes

- Windows 上 `createWindowsRuntime()` 默认使用 resident native-host bridge。
- 测试默认使用 mock bridge，避免无意输入真实桌面。
- native-host smoke test 会用 Windows Forms fixture 验证截图与 UIA pattern action。
- `.mcp.json` 通过 `node ./dist/src/adapters/claude-code/mcp-entrypoint.js` 暴露 MCP stdio server。

## Trace / Debug

- Trace 默认关闭。
- Runtime config：`createWindowsRuntime({ trace: { enabled: true, outputDir: "..." } })`
- 环境变量：`COMPUTER_USE_TRACE=1` 和可选 `COMPUTER_USE_TRACE_DIR=...`
- Request-level override：`meta.computerUseTrace = { enabled: true, outputDir: "..." }`
- Evidence 写入 `sessionId/turnId/actionId/`，包含 `request.json`、`response.json` 或 `error.json`、`evidence.json`。

## 文档

- [`../README.md`](../README.md)
- [`../doc/README.md`](../doc/README.md)
- [`../doc/computer-use.md`](../doc/computer-use.md)
- [`../doc/harness/architecture.md`](../doc/harness/architecture.md)
- [`../doc/harness/action-lane.md`](../doc/harness/action-lane.md)
- [`../doc/harness/plugin-installation.md`](../doc/harness/plugin-installation.md)

---

## English

`computer-use-ts` is the local Windows computer-use plugin implementation in this repository. It is not a wrapper around the official client. It is a TypeScript runtime: the shared core owns contracts, dispatch, lifecycle, and trace; the Windows layer owns capture, UIA, input, and launch; Codex and Claude Code use the same capabilities through adapters.

## Plugin Installation

This directory is the plugin root. Key files:

- [`.codex-plugin/plugin.json`](./.codex-plugin/plugin.json)
- [`.claude-plugin/plugin.json`](./.claude-plugin/plugin.json)
- [`.mcp.json`](./.mcp.json)
- [`skills/computer-use/SKILL.md`](./skills/computer-use/SKILL.md)

Claude Code and Codex install separately through the repository-root host scripts:

```powershell
cd G:\Desktop\computer_use
powershell -ExecutionPolicy Bypass -File .\scripts\install-claude-code.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\install-codex.ps1
```

- `install-claude-code.ps1` handles the Claude Code marketplace, reinstall, and doctor flow.
- `install-codex.ps1` handles the Codex marketplace, reinstall, and doctor flow.
- `install-claude-code.ps1` builds the runtime first, validates the Claude manifests, and runs the MCP smoke test.
- `install-codex.ps1` builds the runtime first and runs the shared MCP smoke test.

## Capabilities

- Discovery / launch: `list_apps`, `list_windows`, `get_window`, `launch_app`
- Capture / UIA: `get_window_state`, `click_element`, `set_value`, `perform_secondary_action`
- Action / lifecycle: `activate_window`, `click`, `press_key`, `type_text`, `scroll`, `drag`, `end_turn`
- Trace/debug: environment, runtime config, and request meta switches

## Scripts

- `npm run build`
- `npm run codex:helper`
- `npm run typecheck`
- `npm test`
- `powershell -ExecutionPolicy Bypass -File ..\scripts\doctor-computer-use.ps1 -Target Claude`
- `powershell -ExecutionPolicy Bypass -File ..\scripts\doctor-computer-use.ps1 -Target Codex`

`npm run codex:helper` is only for adapter smoke tests or manual local JSON-RPC helper debugging. After installing the Codex plugin, the root `scripts/computer-use-client.mjs` compatibility script is not needed and has been removed.

## Runtime Notes

- On Windows, `createWindowsRuntime()` defaults to the resident native-host bridge.
- Tests use a mock bridge by default to avoid accidental real desktop input.
- The native-host smoke test validates screenshots and UIA pattern actions against a Windows Forms fixture.
- `.mcp.json` exposes the MCP stdio server through `node ./dist/src/adapters/claude-code/mcp-entrypoint.js`.

## Trace / Debug

- Trace defaults to off.
- Runtime config: `createWindowsRuntime({ trace: { enabled: true, outputDir: "..." } })`
- Environment variables: `COMPUTER_USE_TRACE=1` and optional `COMPUTER_USE_TRACE_DIR=...`
- Request-level override: `meta.computerUseTrace = { enabled: true, outputDir: "..." }`
- Evidence is written under `sessionId/turnId/actionId/` with `request.json`, `response.json` or `error.json`, and `evidence.json`.

## Documentation

- [`../README.md`](../README.md)
- [`../doc/README.md`](../doc/README.md)
- [`../doc/computer-use.md`](../doc/computer-use.md)
- [`../doc/harness/architecture.md`](../doc/harness/architecture.md)
- [`../doc/harness/action-lane.md`](../doc/harness/action-lane.md)
- [`../doc/harness/plugin-installation.md`](../doc/harness/plugin-installation.md)
