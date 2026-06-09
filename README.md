# computer_use

[简体中文](./README.zh-CN.md)

`computer_use` is a local Windows computer-use plugin for Codex and Claude Code. It exposes window discovery, screenshots, UI Automation text trees, mouse and keyboard input, app launch, turn lifecycle, interrupt handling, and trace evidence through one TypeScript runtime and an MCP server. The plugin root is [`computer_use`](./computer_use/), with entrypoints in [`computer_use/.codex-plugin/plugin.json`](./computer_use/.codex-plugin/plugin.json), [`computer_use/.mcp.json`](./computer_use/.mcp.json), and [`computer_use/skills/computer-use/SKILL.md`](./computer_use/skills/computer-use/SKILL.md).

## Quick Start

Requirements:

- Windows 10 or Windows 11
- Node.js 20+
- Codex CLI for Codex installs, or Claude Code CLI for Claude installs
- .NET SDK 8+ for the C# native host build

Check the required command-line tools:

```powershell
node --version
npm --version
dotnet --info
claude --version
codex --version
```

Install .NET SDK 8 with Windows Package Manager when `dotnet --info` does not list an SDK:

```powershell
winget install --id Microsoft.DotNet.SDK.8 --exact --accept-source-agreements --accept-package-agreements
```

If `dotnet` is not available in the current terminal after installation, the installer also checks `C:\Program Files\dotnet\dotnet.exe`. If that file is missing, open a new terminal after installing the SDK or add `C:\Program Files\dotnet` to `PATH`.

Install into Codex from the repository root:

```powershell
cd D:\Desktop\computer-use
npm run install:codex
```

Install into Claude Code:

```powershell
cd D:\Desktop\computer-use
npm run install:claude
```

Install both:

```powershell
npm run install:all
```

The npm installer installs TypeScript dependencies, builds the runtime, builds the C# native host, runs an MCP smoke test, registers the local marketplace, installs the plugin, and runs a Node-based doctor check.

## Native Host Build

Build only the C# Windows native host:

```powershell
npm run build:native
```

Build TypeScript plus C#:

```powershell
npm run build:all
```

If you already built everything and only want to reinstall the current compiled artifacts:

```powershell
npm run install:codex:compiled
npm run install:claude:compiled
```

The native-host builder uses `dotnet build` through .NET SDK 8+. It checks `PATH`, `COMPUTER_USE_DOTNET_PATH`, and the standard Windows install locations for `dotnet.exe`.

The .NET build targets `net8.0-windows10.0.19041.0` so the native host can consume the Windows SDK C#/WinRT projections used by `Windows.Graphics.Capture`. Keep the TypeScript native-host launch path in sync with that target framework when changing the project file.

## Capabilities

- `list_apps`, `list_windows`, `get_window`, `launch_app`
- `get_window_state` with direct MCP image content for screenshots and structured UIA nodes
- `click`, `click_element`, `press_key`, `type_text`, `scroll`, `set_value`, `drag`, `perform_secondary_action`, `activate_window`
- `end_turn`, turn lifecycle, physical Escape interrupt handling, and trace evidence
- Codex adapter, Claude Code MCP adapter, and Windows native-host bridge

`launch_app` blocks duplicate cold launches by default. If an existing session is detected, the hook returns guidance to restore the app from `windows.shell.taskbar`; only an explicit `force_new` bypasses this behavior.

## Development

```powershell
cd D:\Desktop\computer-use
npm run typecheck
npm test
```

Focused checks:

```powershell
npm --prefix computer_use run test -- tests/integration/codex-adapter.test.ts
npm --prefix computer_use run test -- tests/integration/claude-code-adapter.test.ts
npm --prefix computer_use run test -- tests/integration/stdio-runtime.test.ts
npm --prefix computer_use run test -- tests/integration/native-host-p5-smoke.test.ts
npm run doctor:codex
npm run doctor:claude
```

`npm run codex:helper` inside `computer_use/` is only a local JSON-RPC helper harness for development. It is not the normal entrypoint after installing the Codex plugin.

## Documentation

- Project handoff: [doc/computer-use.md](./doc/computer-use.md)
- Documentation index: [doc/README.md](./doc/README.md)
- Architecture harness: [doc/harness/architecture.md](./doc/harness/architecture.md)
- Action lane harness: [doc/harness/action-lane.md](./doc/harness/action-lane.md)
- Plugin installation harness: [doc/harness/plugin-installation.md](./doc/harness/plugin-installation.md)
- Capability matrix: [doc/acceptance/capability-matrix.md](./doc/acceptance/capability-matrix.md)

## Windows Notes

- Windows 10 and Windows 11 are both supported targets.
- The native-host builder runs through .NET SDK 8+ and automatically checks the standard Windows `dotnet.exe` install path.
- The taskbar target supports the primary Win10/Win11 taskbar and falls back to `Shell_SecondaryTrayWnd` for secondary-taskbar layouts.
- Windows UI automation can affect the real desktop state, so keep target windows clear before running action tools.
