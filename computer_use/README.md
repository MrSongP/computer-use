# computer-use-ts

[简体中文](../README.zh-CN.md) | [English](../README.md)

This directory is the actual plugin root for the local Windows computer-use implementation. The shared TypeScript core owns contracts, dispatch, lifecycle, and trace; the Windows layer owns capture, UIA, input, launch, and the native-host bridge; Codex and Claude Code use the same runtime through adapters.

## Plugin Files

- [`.codex-plugin/plugin.json`](./.codex-plugin/plugin.json)
- [`.claude-plugin/plugin.json`](./.claude-plugin/plugin.json)
- [`.mcp.json`](./.mcp.json)
- [`skills/computer-use/SKILL.md`](./skills/computer-use/SKILL.md)

## Install

Required tools:

- Windows 10 or Windows 11
- Node.js 20+
- .NET SDK 8+ for `native-host/ComputerUse.NativeHost`
- Codex CLI for Codex installs, or Claude Code CLI for Claude installs

Prefer the repository-root npm commands:

```powershell
cd <path-to-cloned-repo>
npm run install:codex
npm run install:claude
```

The npm installer builds TypeScript, builds the C# native host, runs the MCP smoke test, registers the local marketplace, installs the plugin, and runs a Node-based doctor check.

## Native Host

```powershell
npm run build:native
npm run install:codex:compiled
```

`build:native` compiles `native-host/ComputerUse.NativeHost`. It prefers .NET SDK 8+ and falls back to .NET Framework `csc.exe` with dynamically discovered Windows SDK references. If `dotnet --info` does not list an SDK, install .NET SDK 8 with `winget install --id Microsoft.DotNet.SDK.8 --exact --accept-source-agreements --accept-package-agreements`.

The native host targets `net8.0-windows10.0.19041.0` for Windows SDK C#/WinRT projections, including `Windows.Graphics.Capture`. If the target framework changes, update the matching launch-path constant in `src/windows/bridge/native-host-driver.ts`.

## Capabilities

- Discovery / launch: `list_apps`, `list_windows`, `get_window`, `launch_app`
- Capture / UIA: `get_window_state`, `click_element`, `set_value`, `perform_secondary_action`
- Action / lifecycle: `activate_window`, `click`, `press_key`, `type_text`, `scroll`, `drag`, `select_file_in_dialog`, `select_folder_in_dialog`, `set_save_path_in_dialog`, `end_turn`
- Trace/debug: environment, runtime config, and request meta switches

## Scripts

- `npm run build`
- `npm run build:native`
- `npm run build:all`
- `npm run install:codex`
- `npm run install:claude`
- `npm run typecheck`
- `npm test`

`npm run codex:helper` is only for adapter smoke tests or manual local JSON-RPC helper debugging.

## Runtime Notes

- On Windows, `createWindowsRuntime()` defaults to the native-host bridge. The .NET native host is released on lifecycle close/reset and after a short idle window rather than kept alive as a performance-resident service.
- Tests use a mock bridge by default to avoid accidental real desktop input.
- The native-host smoke test validates capture plus every non-dialog action against a Windows Forms fixture; dialog helpers have focused integration coverage for their filesystem and keystroke contract.
- `get_window_state` exposes capture degradation diagnostics. When WGC fails and the native host falls back to GDI, the response carries `screenshot.degradedReason: "wgc_failed"`, `screenshot.gdiFallbackAt`, and `capture.degradedReasons`.
- `get_window_state.window.health` exposes Win32 responsiveness status, including `hung` and `isResponding`, so callers can stop input when a target app is not responding.
- Interrupted turns and stale unfinished turns are force-cleaned through the lifecycle manager. Native-host resets dispose the resident host process before the next turn continues.
- `.mcp.json` exposes the Codex MCP stdio server through `node ./dist/src/adapters/codex/mcp-entrypoint.js`.

## Trace / Debug

- The packaged Codex and Claude Code plugins enable trace by default.
- Each installed plugin writes to its own `<plugin-root>/.artifacts/computer-use-trace/` directory. Claude Code resolves its root through the host-provided `${CLAUDE_PLUGIN_ROOT}` variable; Codex resolves `cwd: "."` relative to the installed plugin. No user name, drive letter, cache directory, or plugin version is hard-coded.
- The reusable runtime API still defaults trace to off when it is created outside the packaged plugin manifests.
- Runtime config: `createWindowsRuntime({ trace: { enabled: true, outputDir: "..." } })`
- Environment variables: `COMPUTER_USE_TRACE=1` and optional `COMPUTER_USE_TRACE_DIR=...`
- Request-level override: `meta.computerUseTrace = { enabled: true, outputDir: "..." }`
- Evidence is written under `sessionId/turnId/actionId/` with `request.json`, `response.json` or `error.json`, and `evidence.json`.
- Aggregate summaries can be generated with `npm run trace:summary -- D:\path\to\computer-use-trace`.
