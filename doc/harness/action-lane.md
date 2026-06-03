# Action Lane Harness

## 覆盖能力

- `activate_window`
- `click`
- `press_key`
- `type_text`
- `scroll`
- `drag`

## 主链路

1. handler 在 `src/core/capabilities/actions/*/handler.ts` 收窄请求。
2. runtime 从 `ExecutionContext` 解析 trace、lifecycle 和 Windows 依赖。
3. 语义服务在 `src/windows/input/` 与 `src/windows/activation/` 完成窗口激活、参数归一化和 primitive lowering。
4. native bridge / native host 执行真实输入。
5. trace 在 `src/core/trace/` 记录 request / response / evidence。

## 当前关键语义

- 坐标输入一律以窗口相对坐标为 contract 语义。
- `PointerInputService` 会结合 `window.rect.left/top` 把窗口坐标解析成屏幕坐标，再下发到底层。
- `press_key` / `type_text` 会先确保目标窗口激活，再下沉到键盘 primitive。
- `scroll` / `drag` 共用 pointer primitive 和同一套 trace/evidence 结构。
- MCP 对外参数以本地 schema 为准：`scroll` 使用 `scroll_x` / `scroll_y`，元素操作使用 `element_index`，窗口对象必须来自 `list_apps`、`list_windows`、`get_window` 或 `get_window_state`。
- `get_window_state` 的 UIA 输出是结构化 `text` 节点树；不要按官方兼容客户端的字符串 tree 形态写新逻辑。

## 代码锚点

- 合同与 handler：
  - `src/core/capabilities/actions/activate-window`
  - `src/core/capabilities/actions/click`
  - `src/core/capabilities/actions/press-key`
  - `src/core/capabilities/actions/type-text`
  - `src/core/capabilities/actions/scroll`
  - `src/core/capabilities/actions/drag`
- 语义服务：
  - `src/windows/activation/window-activator.ts`
  - `src/windows/input/keyboard-input-service.ts`
  - `src/windows/input/text-input-service.ts`
  - `src/windows/input/pointer-input-service.ts`
  - `src/windows/input/pointer-primitives.ts`
- 回归测试：
  - `tests/unit/key-parser.test.ts`
  - `tests/unit/keyboard-input-service.test.ts`
  - `tests/unit/text-input-service.test.ts`
  - `tests/unit/pointer-input-service.test.ts`
  - `tests/integration/action-lane.test.ts`

## 修改这条链路前先确认

- 坐标语义有没有变化。
- trace 证据字段是否还能稳定复用。
- adapter 层 schema 是否仍和共享 contract 对齐。
- `skills/computer-use/SKILL.md` 是否仍准确描述 action lane 的窗口选择、快照、批量输入和验证流程。
