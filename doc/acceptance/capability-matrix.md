# Capability Matrix

This matrix records the supported capability surface, implementation anchors, and primary verification evidence.

## Capability Table

| Capability | 状态 | 代码锚点 | 主要验证 |
| --- | --- | --- | --- |
| `list_apps` | `done` | `src/core/capabilities/discovery/list-apps` + `src/windows/discovery/window-discovery-service.ts` | `tests/unit/window-discovery-service.test.ts`、`tests/integration/claude-code-adapter.test.ts` |
| `list_windows` | `done` | `src/core/capabilities/discovery/list-windows` + `src/windows/discovery/window-discovery-service.ts` | `tests/unit/window-discovery-service.test.ts`、`tests/integration/codex-adapter.test.ts` |
| `get_window` | `done` | `src/core/capabilities/discovery/get-window` + `src/windows/discovery/window-discovery-service.ts` | `tests/unit/get-window-contract.test.ts`、adapter/integration tests |
| `launch_app` | `done` | `src/core/capabilities/discovery/launch-app` + `src/core/hooks/launch-app` + `src/windows/launch/app-launch-service.ts` | `tests/unit/app-launch-service.test.ts`（覆盖 hook rejection / taskbar guidance / `force_new`） |
| `get_window_state` | `done` | `src/core/capabilities/capture/get-window-state` + `src/windows/capture/window-state-service.ts` | `tests/unit/window-state-service.test.ts`、`tests/unit/native-host-driver.test.ts`、`tests/integration/native-host-p5-smoke.test.ts` |
| `click` | `done` | `src/core/capabilities/actions/click` + `src/windows/input/pointer-input-service.ts` | `tests/unit/pointer-input-service.test.ts`、`tests/integration/action-lane.test.ts` |
| `click_element` | `done` | `src/core/capabilities/actions/click-element` + `src/windows/uia/element-interaction-service.ts` | `tests/unit/element-interaction-service.test.ts`、`tests/integration/native-host-p5-smoke.test.ts` |
| `press_key` | `done` | `src/core/capabilities/actions/press-key` + `src/windows/input/keyboard-input-service.ts` | `tests/unit/key-parser.test.ts`、`tests/unit/keyboard-input-service.test.ts` |
| `type_text` | `done` | `src/core/capabilities/actions/type-text` + `src/windows/input/text-input-service.ts` | `tests/unit/text-input-service.test.ts` |
| `scroll` | `done` | `src/core/capabilities/actions/scroll` + `src/windows/input/pointer-input-service.ts` | `tests/unit/pointer-input-service.test.ts` |
| `set_value` | `done` | `src/core/capabilities/actions/set-value` + `src/windows/uia/element-interaction-service.ts` | `tests/unit/element-interaction-service.test.ts`、`tests/integration/native-host-p5-smoke.test.ts` |
| `drag` | `done` | `src/core/capabilities/actions/drag` + `src/windows/input/pointer-input-service.ts` | `tests/unit/pointer-input-service.test.ts` |
| `perform_secondary_action` | `done` | `src/core/capabilities/actions/perform-secondary-action` + `src/windows/uia/element-interaction-service.ts` | `tests/unit/element-interaction-service.test.ts`、`tests/integration/native-host-p5-smoke.test.ts` |
| `activate_window` | `done` | `src/core/capabilities/actions/activate-window` + `src/windows/activation/window-activator.ts` | `tests/integration/action-lane.test.ts` |
| `end_turn` | `done` | `src/core/interrupt/end-turn.ts` + `src/core/runtime/lifecycle-manager.ts` + `src/windows/bridge/native-host-driver.ts` | `tests/unit/interrupt-files.test.ts`、`tests/unit/native-host-driver.test.ts`、`tests/integration/stdio-runtime.test.ts` |

## Maintenance Rules

- `done` means the contract, handler, service, bridge/runtime path, host exposure, and test evidence exist.
- For implementation detail, start from the code anchors and tests in this table.
- If capability behavior changes, update the relevant code anchor or verification entry here.
