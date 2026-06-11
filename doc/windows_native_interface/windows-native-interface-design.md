# Windows Native Interface Design

This document records the stable Windows implementation boundaries for `computer_use`.

## Design Principles

1. Upper layers depend on capability semantics, not low-level Windows API names.
2. Dependency direction is `core contract -> windows service -> native bridge/native host`.
3. Trace and lifecycle behavior are maintained as first-class runtime infrastructure.
4. Bridge implementations may change, but contracts and adapter-facing schemas should stay stable unless the capability itself changes.

## Stable Layers

### Shared Core

- `src/core/capabilities`
- `src/core/runtime`
- `src/core/dispatcher`
- `src/core/interrupt`
- `src/core/trace`

Responsibilities:

- capability contracts and handlers
- method registry and dispatch
- runtime context
- lifecycle and interrupt handling
- trace config and evidence writing

### Windows Services

- `src/windows/activation/window-activator.ts`
- `src/windows/discovery/window-discovery-service.ts`
- `src/windows/launch/app-launch-service.ts`
- `src/windows/capture/window-state-service.ts`
- `src/windows/uia/element-interaction-service.ts`
- `src/windows/input/*.ts`
- `src/windows/dialogs/common-dialog-service.ts`

Responsibilities:

- accept core capability requests
- normalize parameters
- coordinate execution
- converge errors and diagnostics
- call native bridge primitives

### Native Bridge And Native Host

- `src/windows/bridge/native-bridge.ts`
- `src/windows/bridge/create-native-bridge.ts`
- `src/windows/bridge/native-host-driver.ts`
- `native-host/ComputerUse.NativeHost/Program.cs`

The turn-scoped .NET native host is the primary real Windows execution path. Compatibility bridge files may remain in the tree, but the native host is the project-supported path for full Windows behavior.

## Required Semantics

- `click`, `scroll`, and `drag` use window-relative coordinates unless a tool explicitly accepts screenshot-relative coordinates with snapshot metadata.
- `press_key` and `type_text` activate the target window before sending input.
- `get_window_state` is both capture and window canonicalization. It is not only a screenshot function.
- `get_window_state` exposes capture degradation and window health, including `wgc_failed` and `window.health.hung`.
- UIA capabilities go through `ElementInteractionService`.
- Turn lifecycle goes through `lifecycle-manager.ts` and `end-turn.ts`.
- Interrupted turns and unfinished old turns are reset through `LifecycleManager.resetTurn`.
- Native-host reset disposes the resident host process so queued work does not leak into a later turn.
- The native host is turn-scoped rather than performance-resident. Explicit lifecycle calls, stdio/input close handling, process cleanup hooks, and the native bridge idle timeout all converge on releasing Computer Use resources.
- After a built host exists, normal restart cost is limited to launching `dotnet ComputerUse.NativeHost.dll` and completing the ping handshake, so stale host processes must be treated as lifecycle cleanup failures instead of accepted steady state.
- `COMPUTER_USE_NATIVE_HOST_IDLE_TIMEOUT_MS` controls the native bridge idle release window. The default is 5 seconds; `0` is reserved for diagnostics that intentionally disable idle disposal.

## Verification Surface

Action and bridge tests:

- `tests/unit/keyboard-input-service.test.ts`
- `tests/unit/text-input-service.test.ts`
- `tests/unit/pointer-input-service.test.ts`
- `tests/unit/native-bridge-factory.test.ts`

Capture, UIA, and native-host tests:

- `tests/unit/window-state-service.test.ts`
- `tests/unit/element-interaction-service.test.ts`
- `tests/integration/native-host-p5-smoke.test.ts`

Lifecycle and trace tests:

- `tests/unit/interrupt-files.test.ts`
- `tests/unit/native-host-driver.test.ts`
- `tests/unit/trace-config.test.ts`
- `tests/integration/trace-evidence.test.ts`
- `tests/integration/stdio-runtime.test.ts`
