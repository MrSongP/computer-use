# computer_use Project Overview

`computer_use` is a local Windows computer-use plugin for Codex and Claude Code. It exposes atomic desktop automation tools through a TypeScript runtime, an MCP server, and a turn-scoped Windows native host.

The plugin is built for agents. It provides facts and actions for Windows UI automation; agents remain responsible for choosing the correct app, interpreting task intent, verifying destinations, and deciding when a workflow is complete.

## Current Capability Surface

The runtime exposes these capabilities:

- Discovery and launch: `list_apps`, `list_windows`, `get_window`, `launch_app`
- Window state capture: `get_window_state`
- Window focus: `activate_window`
- Pointer input: `click`, `drag`, `scroll`
- Keyboard and text input: `press_key`, `type_text`
- UI Automation actions: `click_element`, `set_value`, `perform_secondary_action`
- Standard Windows dialog helpers: `select_file_in_dialog`, `select_folder_in_dialog`, `set_save_path_in_dialog`
- Turn lifecycle and debug evidence: `end_turn`, interrupt handling, trace evidence

`launch_app` uses a reuse-or-launch policy by default. When an existing session is detected, it returns guidance for restoring the app through `windows.shell.taskbar`; only an explicit `force_new` request should create a new instance.

`get_window_state` returns the canonical window object for follow-up calls, screenshot metadata, coordinate mapping, visible/clickable region metadata, optional structured UIA text, capture diagnostics, and trace artifact paths when trace is enabled.

Dialog helpers complete only local standard Windows dialogs. They do not send, upload, publish, or submit anything inside the destination app.

## Implementation Layout

- `computer_use/.codex-plugin/plugin.json` packages the Codex plugin.
- `computer_use/.claude-plugin/plugin.json` packages the Claude Code plugin.
- `computer_use/.mcp.json` declares the local MCP stdio server.
- `computer_use/skills/computer-use/SKILL.md` describes the agent workflow for using the plugin.
- `computer_use/src/core/` contains contracts, capability handlers, dispatch, lifecycle, interrupt handling, runtime context, and trace infrastructure.
- `computer_use/src/windows/` contains Windows services for discovery, launch, capture, activation, input, UIA, dialogs, and native-host bridging.
- `computer_use/src/adapters/` maps the shared runtime into Codex and Claude Code surfaces.
- `computer_use/native-host/ComputerUse.NativeHost/` contains the turn-scoped .NET Windows host.
- `computer_use/tests/` contains unit, integration, adapter, stdio, trace, and native-host smoke tests.

## Installation Entry Points

Install into Codex:

```powershell
cd <path-to-cloned-repo>
npm run install:codex
```

Install into Claude Code:

```powershell
cd <path-to-cloned-repo>
npm run install:claude
```

Install both:

```powershell
npm run install:all
```

The installer builds the TypeScript runtime, builds the C# native host, runs the MCP smoke test, registers the local marketplace, installs the plugin, and runs the relevant doctor check.

## Development Checks

Run the default checks from the repository root:

```powershell
npm run typecheck
npm test
```

Useful focused checks:

```powershell
npm --prefix computer_use run test -- tests/integration/codex-adapter.test.ts
npm --prefix computer_use run test -- tests/integration/claude-code-adapter.test.ts
npm --prefix computer_use run test -- tests/integration/stdio-runtime.test.ts
npm --prefix computer_use run test -- tests/integration/native-host-p5-smoke.test.ts
npm run doctor:codex
npm run doctor:claude
```

## Documentation Map

- Documentation index: `doc/README.md`
- Capability matrix: `doc/acceptance/capability-matrix.md`
- Windows native interface: `doc/windows_native_interface/windows-native-interface-design.md`
- Agent harness: `.claude/computer-use-harness.md` and `.agents/computer-use-harness.md`
- Maintenance checklist: `.claude/computer-use-maintenance-checklist.md` and `.agents/computer-use-maintenance-checklist.md`
- Installation harness: `.claude/computer-use-installation-harness.md` and `.agents/computer-use-installation-harness.md`
- Plugin test agent: `.claude/agent/computer-use-plugin-test-agent.md`

## Documentation Boundary

`doc/` contains project documentation for humans. Agent-specific operating contracts live in `.claude/` and `.agents/`. Temporary investigation notes, trace artifacts, and one-off repro evidence should not be committed as long-term documentation.
