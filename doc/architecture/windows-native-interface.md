# Windows Native Interface

This document owns the stable boundary between shared capability semantics and the Windows implementation. Read the [architecture overview](overview.md) first.

## Design Principles

1. Upper layers depend on capability semantics, not low-level Windows API names.
2. Dependency direction is `core contract -> Windows service -> native bridge -> native host`.
3. Trace and lifecycle behavior remain first-class runtime infrastructure.
4. Bridge implementations may change without changing adapter-facing contracts.

## Stable Layers

### Shared Core

Key paths:

- `computer_use/src/core/capabilities/`
- `computer_use/src/core/runtime/`
- `computer_use/src/core/dispatcher/`
- `computer_use/src/core/interrupt/`
- `computer_use/src/core/trace/`

The core owns validation, handlers, dispatch, lifecycle, interrupt handling, and trace evidence.

### Windows Services

Key paths:

- `computer_use/src/windows/activation/window-activator.ts`
- `computer_use/src/windows/discovery/window-discovery-service.ts`
- `computer_use/src/windows/launch/app-launch-service.ts`
- `computer_use/src/windows/capture/window-state-service.ts`
- `computer_use/src/windows/uia/element-interaction-service.ts`
- `computer_use/src/windows/input/`
- `computer_use/src/windows/dialogs/common-dialog-service.ts`

Windows services normalize requests, coordinate platform operations, and converge errors and diagnostics.

### Native Bridge And Host

Key paths:

- `computer_use/src/windows/bridge/native-bridge.ts`
- `computer_use/src/windows/bridge/create-native-bridge.ts`
- `computer_use/src/windows/bridge/native-host-driver.ts`
- `computer_use/native-host/ComputerUse.NativeHost/`

The turn-scoped .NET host is the primary real Windows path. Compatibility bridges may remain, but they are not the reference implementation for full behavior.

## Required Semantics

- `click`, `scroll`, and `drag` use window-relative coordinates unless the capability explicitly accepts screenshot-relative metadata.
- Screenshot-space mapping never bypasses native `WindowFromPoint` target validation.
- `press_key`, `type_text`, pointer actions, and UIA actions activate the target window before input.
- `get_window_state` returns the canonical window object for subsequent calls.
- Capture exposes degradation and health, including `wgc_failed`, UIA degradation, and `window.health.hung`.
- UIA actions go through `ElementInteractionService`.
- Standard dialog helpers validate local paths before interacting with the dialog.
- Interrupted and stale turns reset through `LifecycleManager`.
- Native-host reset and idle disposal terminate the resident host process.

## Native Host Build Contract

The C# target framework, TypeScript launch path, and real Windows smoke test must agree on `net8.0-windows10.0.19041.0`. Repository contract tests enforce this alignment.

After a build exists, normal restart is limited to launching `dotnet ComputerUse.NativeHost.dll` and completing the ping handshake. A stale host process after task completion is a cleanup defect, not an accepted optimization.

## Verification

The canonical verification layers and commands are documented in [testing](../development/testing.md).

Windows implementation changes normally require:

- targeted service or bridge unit tests;
- `tests/integration/native-host-p5-smoke.test.ts` for real action/capture behavior;
- lifecycle and trace tests when resource ownership or evidence changes;
- `npm run build:all` when native-host source changes.
