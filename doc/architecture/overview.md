# Architecture Overview

`computer_use` is a distributable Windows computer-use plugin for Codex and Claude Code. It exposes atomic desktop automation capabilities through one shared TypeScript runtime, host adapters, and a turn-scoped .NET native host.

This document owns the system-level architecture. Public capability status and evidence belong in the [capability matrix](../acceptance/capability-matrix.md); test strategy belongs in [testing](../development/testing.md); installation instructions belong in the repository [README](../../README.md).

## System Context

The plugin gives an agent observable facts and atomic actions:

- discover applications and windows;
- capture screenshots and structured UI Automation state;
- activate windows and inject pointer, keyboard, and text input;
- invoke UIA patterns and complete standard Windows dialogs;
- manage turn lifecycle, interruption, and trace evidence.

The agent—not the plugin—owns application-specific workflow composition, destination verification, user-intent decisions, and completion judgment.

## Dependency Direction

The supported dependency direction is:

```text
host adapter -> shared core -> Windows services -> native bridge -> .NET native host
```

### Host Adapters

Code: `computer_use/src/adapters/`

Responsibilities:

- expose the shared capability registry to Codex and Claude Code;
- translate host request/response envelopes;
- keep both hosts on the same public semantics;
- close or reset active turns when their transport ends.

Adapters must not invent host-specific capability behavior.

### Shared Core

Code: `computer_use/src/core/`

Responsibilities:

- public contracts and capability handlers;
- method registration and dispatch;
- runtime context and lifecycle coordination;
- interrupt handling;
- trace configuration and evidence writing.

Shared semantics start here. A public behavior change is incomplete until contracts, handlers, adapters, documentation, and tests agree.

### Windows Services

Code: `computer_use/src/windows/`

Responsibilities:

- window discovery and application launch;
- activation and focus recovery;
- screenshot/UIA capture orchestration;
- pointer, keyboard, text, and dialog semantics;
- native bridge selection and diagnostics.

These services translate capability meaning into platform operations without leaking Win32 details upward.

### Native Bridge And Host

Code:

- `computer_use/src/windows/bridge/`
- `computer_use/native-host/ComputerUse.NativeHost/`

The .NET host owns Win32, Windows Graphics Capture, UI Automation, COM/WinRT initialization, physical Escape handling, and low-level input injection. It is the supported path for full Windows behavior.

## Runtime Lifecycle

The native host is a turn-scoped execution resource, not a permanently resident service.

Resources are released through:

1. explicit `end_turn`, adapter close, or MCP shutdown;
2. host transport disconnect and process cleanup hooks;
3. native bridge idle disposal.

Interrupted turns and stale unfinished turns converge on lifecycle reset. Reset must dispose the native-host process so queued work and turn-owned Windows resources cannot leak into another turn.

`COMPUTER_USE_NATIVE_HOST_IDLE_TIMEOUT_MS` controls idle disposal. The default is five seconds; `0` is diagnostic-only.

## Capability Boundaries

The canonical public inventory is the [capability matrix](../acceptance/capability-matrix.md).

The MCP tool catalog uses progressive-disclosure metadata rather than host-specific hiding. Every tool remains callable for Codex and Claude Code compatibility, while each descriptor carries a lane, phase, order, title, and MCP annotations:

- Discovery: `list_apps`, `list_windows`, `get_window`, `launch_app`
- Action: `get_window_state`, `activate_window`, `click`, `drag`, `scroll`, `press_key`, `type_text`, `click_element`, `set_value`, `perform_secondary_action`
- Dialog: `select_file_in_dialog`, `select_folder_in_dialog`, `set_save_path_in_dialog`
- Lifecycle: `end_turn`

Agents and progressive clients should start with discovery, use action tools only after selecting a canonical window and current state supports the target, and reserve dialog helpers for verified standard Windows dialogs. `get_window_state` is the first action-lane tool because it observes the selected window before mutating input actions. The default MCP response remains a complete tool list because host support for `tools/list` pagination and list-change refresh is not uniform.

Important invariants:

- `get_window_state` is both observation and window canonicalization.
- UIA element indexes are valid only for the latest text-bearing snapshot.
- Window-relative coordinates are the default for pointer actions.
- Screenshot-relative coordinates require snapshot metadata and change mapping only.
- `screenshotWindowRegion` is geometric metadata, not proof of clickability.
- Native pointer hit-testing remains authoritative.
- Dialog helpers complete local dialogs only; they do not upload, publish, send, or submit.

## Repository Layout

| Path | Responsibility |
| --- | --- |
| `computer_use/.codex-plugin/` | Codex plugin manifest |
| `computer_use/.claude-plugin/` | Claude Code plugin manifest |
| `computer_use/.mcp.json` | MCP stdio server declaration |
| `computer_use/skills/` | Installed agent instructions |
| `computer_use/src/core/` | Shared contracts, handlers, runtime, lifecycle, trace |
| `computer_use/src/adapters/` | Codex and Claude Code host surfaces |
| `computer_use/src/windows/` | Windows semantic services and native bridge |
| `computer_use/native-host/` | .NET Windows implementation |
| `computer_use/tests/` | Contract, unit, integration, adapter, trace, and real Windows smoke tests |
| `scripts/` | Build, install, smoke, and doctor entrypoints |

## Architectural Non-Goals

The core plugin does not provide:

- application-specific recipes or business logic;
- semantic interpretation of arbitrary screenshots;
- a guarantee that UIA works in self-drawn, Chromium, game, or canvas surfaces;
- permission to perform external side effects;
- high-level visual waiting without a precise low-level contract.

These boundaries prevent app-specific heuristics from contaminating shared capability semantics.
