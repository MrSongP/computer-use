# Computer Use 智能体 Harness

本文件是使用或评估 `computer_use` 插件的智能体当前的操作约定。它描述了插件的现状、预期的能力边界，以及工具输入输出的质量要求。

## 目的

`computer_use` 是一个面向智能体开发的本地 Windows 电脑使用插件。它通过 MCP 工具为智能体提供原子化的桌面控制能力：发现应用与窗口、捕获窗口状态、检查可访问性节点、激活窗口、发送指针与键盘输入、完成标准文件对话框，以及收集用于调试的追踪证据。

该插件不是某个特定应用的助手。它不会教智能体如何使用Word、Blender、浏览器或任何其他具体应用。它提供可靠的原子操作和清晰的事实，由智能体将这些原子操作组合为当前用户任务的工作流。

## 当前项目形态

- 插件根目录：`computer_use/`
- Codex 清单文件：`computer_use/.codex-plugin/plugin.json`
- Claude Code 清单文件：`computer_use/.claude-plugin/plugin.json`
- MCP 服务器声明：`computer_use/.mcp.json`
- 主技能：`computer_use/skills/computer-use/SKILL.md`
- 运行时入口：`computer_use/src/index.ts`
- Claude 适配器 schema：`computer_use/src/adapters/claude-code/tool-schema.ts`
- 原生 Windows 宿主：`computer_use/native-host/ComputerUse.NativeHost/`
- 测试：`computer_use/tests/`

该项目通过 Codex 与 Claude Code 适配器暴露同一套核心运行时。原生 Windows 宿主负责 Win32、Windows Graphics Capture、UI Automation、输入注入、常用对话框，以及应用/窗口的发现。

## 架构边界

- 依赖方向是 `adapters -> core -> windows -> native host`。
- `core` 负责 capability contract、handler、dispatch、lifecycle、interrupt、runtime context 和 trace 基础设施。
- `windows` 负责 discovery、launch、capture、activation、input、UIA、dialog 与 native bridge 访问等语义服务。
- `native-host/ComputerUse.NativeHost` 负责 Win32、WGC、UIA、COM 和底层输入原语。
- adapter schema 必须与共享 core contract 对齐，不能让 Codex 和 Claude Code 漂成两套语义。
- 新能力必须同时落 contract、handler、Windows service 或 bridge 支持，以及验证；不要用独立设计文档替代测试。

## 能力边界

插件提供以下几类能力：

- 发现类：`list_apps`、`list_windows`、`get_window`、`launch_app`
- 捕获类：`get_window_state`
- 窗口焦点类：`activate_window`
- 指针输入类：`click`、`drag`、`scroll`
- 键盘/文本输入类：`press_key`、`type_text`
- 可访问性动作类：`click_element`、`set_value`、`perform_secondary_action`
- 标准对话框辅助类：`select_file_in_dialog`、`select_folder_in_dialog`、`set_save_path_in_dialog`
- 回合/调试生命周期类：`end_turn`、通过工具调用传递的追踪元数据

插件不提供以下能力：

- 针对特定应用的工作流、配方或业务逻辑。
- 终局性用户意图判断，例如联系人、文件、对话框或目标位置是否正确。
- 对任意截图超出结构化事实之外的语义理解。
- UIA 对所有应用都有效的保证，特别是 Chromium、Electron、CEF、游戏、Canvas 应用或自绘界面。
- 高级等待操作（例如「等待直到截图看起来正确」）作为独立的产品需求。除非代码库显式新增了具有精确语义的底层原语，否则重复观察与停止条件属于智能体工作流的职责。
- 在任务需要时，未经智能体/用户层面确认执行外部副作用的权限。

## 事实与智能体判断的划分

工具应当提供事实：

- 哪些应用与窗口可见或可被发现。
- 观察到的应用/窗口 id、标题、边界、可见性、焦点、最小化状态与健康度。
- 启动是尝试了、重用了、被拒绝了，还是需要从托盘/任务栏恢复。
- 捕获是成功了、降级了、省略了文本，还是使用了回退路径。
- 截图尺寸、坐标映射以及可点击区域元数据。
- UIA 节点、索引、角色、名称、值、边界、模式（pattern）以及可用的二级动作。
- 输入动作是否被派发、通过何种坐标/窗口/元素计划执行，以及可获得的即时诊断信息。
- 启用追踪时的追踪产物路径。
- 调用失败时的显式错误、错误码、详细信息与恢复提示。

智能体必须做出判断：

- 哪个应用和窗口满足用户请求。
- 哪个 UI 元素或坐标是目标。
- 当前状态是否足以安全地执行点击、按键、上传、发送、保存、删除或提交动作。
- 结果是否证明任务已完成。
- 是重试、刷新状态、重新水化（rehydrate）一个过期的窗口、询问用户，还是停止。
- 如何从原子工具组合出针对特定应用的工作流。

## 工具质量基线

每个工具都必须满足以下期望。

1. **可靠地执行其所命名的原子操作。**
   - `get_window_state` 捕获所请求的窗口，或返回明确的失败。
   - `click` 在指定的坐标空间中准确地执行智能体所提供的坐标。
   - `press_key` 将所请求的按键或组合键发送到目标窗口。
   - `select_file_in_dialog` 仅完成本地标准文件对话框，不涉及应用后续的上传/发送动作。

2. **返回明确的状态。**
   - 有意义的成功结果优于 `null`。
   - 失败时应包含错误码、错误/详细信息，并在可能时给出可操作的下一步指引。
   - 部分成功和降级的捕获状态必须显式报告。

3. **保持响应低噪声、高信噪比。**
   - 以结构化字段代替散文式描述。
   - 提供足够的元数据，使智能体无需猜测即可继续。
   - 将大体积或可选证据放在摘要、过滤器、追踪路径或产物之后。
   - 在 JSON 文本中隐去或摘要大体积的截图字节，同时仍通过宿主通道返回图片内容。

4. **保持坐标与生命周期的清晰性。**
   - 窗口对象只有在来自 `list_apps`、`list_windows`、`get_window` 或 `get_window_state` 时才可复用。
   - `get_window_state` 返回应被继续传递的规范窗口对象。
   - 坐标动作必须明确指出坐标是窗口相对还是截图相对。
   - 过期的句柄、最小化窗口、无响应窗口、焦点失败以及桌面锁定状态必须对智能体可见。

5. **不隐藏策略决策。**
   - `launch_app` 默认采用「重用或启动」策略，并报告重复/托盘恢复情形。
   - `force_new` 仅在用户明确请求时使用。
   - 对话框辅助类工具并不意味着在对话框关闭后拥有发送、上传、发布或提交的权限。

## 输入设计

输入应当严格、可预测，并便于智能体构造。

- 任何窗口作用域的动作都应使用先前返回的 `window` 对象。
- 仅在 `get_window` 重新水化时使用 `id` 与可选的 `app`。
- 当目标已知时，应在 `list_apps` 上使用过滤器，而不是拉取一份噪声巨大的完整进程列表。
- 坐标工具要求坐标，UIA 工具要求元素索引；不要让一个工具同时承载两种目标定位方式。
- 使用与本地约定一致的 snake_case 参数，例如 `scroll_x`、`scroll_y`、`element_index`、`include_screenshot`、`include_text`。
- 拒绝未知键，以便尽早发现文档漂移。
- `type_text` 中的文本输入保持字面量；控制键和组合键使用 `press_key`。

## 输出设计

输出应让智能体在无需猜测的情况下回答四个问题：

1. 工具是否完成了它被要求做的事？
2. 哪些事实发生了变化或被观察到？
3. 返回的状态是否足以规范地支撑下一次调用？
4. 如果不能，规范的恢复路径是什么？

推荐的输出形态：

- 在适配器边界上提供 `ok` 或等价的、明确无误的成功/失败指示。
- 使用 `code` 表示已知的失败类别。
- 成功时提供 `result` 对象；对于有意义的操作，绝不返回毫无说明的 `null`。
- 使用 `diagnostics` 表达截断、过滤器、回退驱动、超时原因以及 schema/运行时元数据。
- 在捕获或重新水化后，使用 `window` 提供规范的目标引用。
- 使用 `capture` 表示截图/文本的可用性、降级原因、被省略的文本以及推荐回退方式。
- 仅在调试证据需要时使用 `trace`，启用时给出绝对路径。
- 当下一步安全动作已知时，提供 `followUpActions` 或相应指引。

## 当前工具期望

| 工具 | 输入期望 | 输出期望 |
| --- | --- | --- |
| `list_apps` | 可选过滤器：`name_contains`、`id_contains`、`id_includes`、`running_only`、`has_windows`、`limit` | 应用标识、运行状态、窗口、诊断信息、运行时元数据 |
| `list_windows` | 空对象 | 可作为目标的最顶层窗口 |
| `get_window` | `id`，可选 `app` | 当前规范窗口或明确的过期/缺失错误 |
| `launch_app` | `app`，可选 `launch_mode`，可选 `observe_timeout_ms` | 启动/重用/拒绝报告、观察到的窗口、恢复指引 |
| `get_window_state` | `window`，可选截图/文本/过滤器设置 | 截图/图片内容、结构化 UIA 节点、规范的 `window`、捕获诊断 |
| `activate_window` | `window` | 包含前台证据的焦点/恢复报告 |
| `click` | `window`、`x`、`y`，可选坐标/按钮字段 | 指针派发报告、命中/坐标诊断、激活证据 |
| `drag` | `window`、起止坐标，可选按钮/时长/步数 | 拖拽派发报告与诊断 |
| `scroll` | `window`、`x`、`y`、`scroll_x` 或 `scroll_y` | 滚轮派发报告与诊断 |
| `press_key` | `window`、`key` | 按键派发报告与激活证据 |
| `type_text` | `window`、字面量 `text` | 文本派发报告与激活证据 |
| `click_element` | `window`、来自最新文本快照的 `element_index` | UIA 主动作报告 |
| `set_value` | `window`、`element_index`、`value` | UIA ValuePattern 报告 |
| `perform_secondary_action` | `window`、`element_index`、`action` | 命名的 UIA 二级动作报告 |
| `select_file_in_dialog` | 对话框 `window`、本地文件 `path` | 对话框完成报告；不暗示上传/发送 |
| `select_folder_in_dialog` | 对话框 `window`、本地文件夹 `path` | 对话框完成报告；不暗示发布 |
| `set_save_path_in_dialog` | 对话框 `window`、保存 `path` | 对话框完成报告；不暗示外部发布 |
| `end_turn` | 空对象 | 生命周期状态已刷新 |

## Action Lane 语义

- 坐标动作默认使用窗口相对坐标。
- `click` 只接受坐标。需要索引化可访问性动作时使用 `click_element`。
- `scroll` 使用 `scroll_x` 和 `scroll_y`。
- 元素动作使用最新 `get_window_state({ include_text: true })` 返回的 `element_index`。
- `get_window_state` 返回结构化 `text` 节点，不是预格式化的树字符串。
- action 成功结果只证明工具能直接观察到的派发事实：激活计划、坐标解算、输入事件派发、UIA pattern 调用或本地对话框关闭。
- action 成功结果不证明应用层业务结果，例如消息已发送、文件已上传、页面已滚到目标内容或弹窗已接受。应用层结果需要新的状态捕获或其他证据验证。
- trace 可以返回轻量 `stateDiff` 摘要，完整 before/after 证据应保留在 trace artifacts 中，避免普通响应膨胀。

## 追踪

追踪是一种调试与取证工具。它对复现工具行为、检查截图、查看原始 JSON 以及审阅动作计划很有用。当直接图片内容与结构化文本已经返回时，追踪并不是智能体理解 UI 的常规手段。

追踪输出应回答：发送了什么输入、目标窗口是哪个、使用了什么捕获或动作计划、原生宿主返回了什么、以及哪些产物路径可以证明这一切。

## 智能体工作流约定

使用本插件的智能体应遵循以下循环：

1. 使用 `list_apps` 或 `list_windows` 发现应用/窗口。
2. 必要时使用 `get_window` 重新水化或选择规范窗口。
3. 仅在支持下一步决策所必需的频率下使用 `get_window_state` 进行捕获。
4. 根据返回的事实选择下一个原子动作。
5. 在目标稳定时批量执行输入。
6. 再次捕获以验证进展或完成情况。
7. 在显式失败、桌面被锁、状态过期且无法恢复、副作用不安全，或目标存在歧义时停止。

智能体可以使用 shell、文件系统、测试、日志以及其他宿主工具处理非 UI 工作。本插件负责 Windows UI 自动化，不应取代更快或更可靠的非 UI 检查方式。
