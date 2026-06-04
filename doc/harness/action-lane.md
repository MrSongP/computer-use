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
- `click` 只负责窗口相对坐标点击；需要语义化元素点击时一律使用 `click_element`。
- `PointerInputService` 会结合 `window.rect.left/top` 把窗口坐标解析成屏幕坐标，再下发到底层。
- `press_key` / `type_text` 会先确保目标窗口激活，再下沉到键盘 primitive。
- `scroll` / `drag` 共用 pointer primitive 和同一套 trace/evidence 结构。
- MCP 对外参数以本地 schema 为准：`scroll` 使用 `scroll_x` / `scroll_y`，元素操作使用 `element_index`，窗口对象必须来自 `list_apps`、`list_windows`、`get_window` 或 `get_window_state`。
- `get_window_state` 的 UIA 输出是结构化 `text` 节点树；不要按官方兼容客户端的字符串 tree 形态写新逻辑。

## click / native 职责边界

- `click` handler / adapter contract 只接受窗口相对 `x/y`，不接受 `element_index`。
- `click_element` / `set_value` / `perform_secondary_action` 才接受来自 `get_window_state` 的 `element_index`。
- action lane runtime 负责窗口激活、trace、以及把高层请求下沉到正确执行通道：
- `click` 走 `PointerInputService`。
- `click_element` 走 `ElementInteractionService`。
- native bridge / native host 不负责“判断该点哪里”：
  - `click` 只执行已经解算好的屏幕点击。
  - `click_element` 只执行 UIA `InvokePattern` / `SelectionItemPattern` 或元素自身的明确 fallback。
- 排查 click 不准时先分层：
  - 如果 `click_element` 的 `element_index` 选错，是上层选择问题。
  - 如果 `click` 的 `x/y` 相对窗口内容偏了，是上层选点或截图理解问题。
  - 如果 `x/y` 正确但系统实际落点错了，再看 `window.rect`、DPI、native bridge 和原生点击实现。

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
