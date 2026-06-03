# Windows Native Interface Design

这份文档只保留长期有效的 Windows 实现边界，不再维护历史性的逐步实现叙述。

## 1. 长期设计原则

1. 上层依赖能力语义，不依赖底层 API 名称。
2. `core contract -> windows service -> native bridge/native host` 的方向不能反过来。
3. trace / lifecycle 与动作能力同等级维护，不能当作补丁功能。
4. bridge 可以替换，但 contract 与 adapter 暴露面要尽量稳定。

## 2. 当前稳定分层

### 2.1 Shared Core

- `src/core/contracts`
- `src/core/capabilities`
- `src/core/runtime`
- `src/core/dispatcher`
- `src/core/interrupt`
- `src/core/trace`

职责：

- 统一 contract
- method registry / dispatch
- runtime context
- lifecycle / interrupt
- trace config 与 evidence writer

### 2.2 Windows Services

- `src/windows/activation/window-activator.ts`
- `src/windows/discovery/window-discovery-service.ts`
- `src/windows/launch/app-launch-service.ts`
- `src/windows/capture/window-state-service.ts`
- `src/windows/uia/element-interaction-service.ts`
- `src/windows/input/*.ts`

职责：

- 接收 core contract
- 做参数归一化、执行编排和错误收敛
- 调用底层 bridge / native host primitive

### 2.3 Native Bridge / Native Host

- `src/windows/bridge/native-bridge.ts`
- `src/windows/bridge/create-native-bridge.ts`
- `src/windows/bridge/native-host-driver.ts`
- `native-host/ComputerUse.NativeHost/Program.cs`

当前主路线：

- 默认真实执行路径是 resident `.NET` native host。
- `powershell-driver.ts`、`ffi-driver.ts`、`napi-driver.ts` 仍保留，但不再作为文档主线。

## 3. 必须守住的语义

- `click` / `scroll` / `drag` 的坐标 contract 是窗口相对坐标。
- `press_key` / `type_text` 先激活窗口，再下沉到底层键盘输入。
- `get_window_state` 是 capture + window canonicalization 的入口，不只是截图。
- UIA 相关能力统一走 `ElementInteractionService`，不要把 pattern 分散到 adapter 或 handler。
- turn 生命周期统一走 `lifecycle-manager.ts` 与 `end-turn.ts`，不要在单个 capability 里私自清理状态。

## 4. 主要验证面

- 动作与桥接：
  - `tests/unit/keyboard-input-service.test.ts`
  - `tests/unit/text-input-service.test.ts`
  - `tests/unit/pointer-input-service.test.ts`
  - `tests/unit/native-bridge-factory.test.ts`
- capture / UIA / native host：
  - `tests/unit/window-state-service.test.ts`
  - `tests/unit/element-interaction-service.test.ts`
  - `tests/integration/native-host-p5-smoke.test.ts`
- lifecycle / trace：
  - `tests/unit/interrupt-files.test.ts`
  - `tests/unit/trace-config.test.ts`
  - `tests/integration/trace-evidence.test.ts`
  - `tests/integration/stdio-runtime.test.ts`
