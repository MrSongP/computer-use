# Architecture Harness

## 当前分层

1. plugin packaging
   - `.codex-plugin/plugin.json` 描述 Codex 插件包。
   - `.claude-plugin/plugin.json` 描述 Claude Code 插件包。
   - `.mcp.json` 声明本地 MCP stdio server。
   - `skills/computer-use/SKILL.md` 是 Codex 使用 Windows 自动化能力前必须读的 workflow 约束。
2. `src/core/`
   - 定义 contracts、dispatcher、runtime、interrupt、trace 和 capability registry。
3. `src/windows/`
   - 实现 Windows 语义服务、bridge、capture、discovery、launch、UIA。
4. `src/adapters/`
   - 把 Codex / Claude Code 宿主协议映射到共享 runtime。
5. `native-host/ComputerUse.NativeHost`
   - 驻留式 native host，承载 Win32 / WGC / UIA / COM 相关底层能力。
6. `tests/`
   - 用 unit / integration / adapter / native-host smoke 证明行为。

## 执行方向

- 依赖方向固定为 `adapters -> core -> windows -> native host`。
- `core` 不直接依赖宿主适配层。
- `windows` 暴露语义服务，不把宿主协议细节漏进实现层。
- `native host` 是默认真实桥，`ffi-driver.ts` / `napi-driver.ts` 当前保留为兼容入口。
- Codex 安装路径固定走 `.agents/plugins/marketplace.json -> computer_use/.codex-plugin/plugin.json -> computer_use/.mcp.json`。
- 根目录 `scripts/computer-use-client.mjs` 不是架构层级的一部分，已不再保留。

## 关键文件

- 插件包装：
  - `.codex-plugin/plugin.json`
  - `.claude-plugin/plugin.json`
  - `.mcp.json`
  - `skills/computer-use/SKILL.md`
- registry 与 dispatch：
  - `src/core/runtime/capability-registry.ts`
  - `src/core/dispatcher/dispatch.ts`
  - `src/core/dispatcher/method-registry.ts`
- 生命周期与中断：
  - `src/core/runtime/lifecycle-manager.ts`
  - `src/core/interrupt/end-turn.ts`
  - `src/core/interrupt/interrupt-files.ts`
  - `src/core/transport/stdio-server.ts`
- trace：
  - `src/core/trace/trace-config.ts`
  - `src/core/trace/tracer.ts`
  - `src/core/trace/artifact-writer.ts`
- Windows 语义服务：
  - `src/windows/activation/window-activator.ts`
  - `src/windows/discovery/window-discovery-service.ts`
  - `src/windows/launch/app-launch-service.ts`
  - `src/windows/capture/window-state-service.ts`
  - `src/windows/uia/element-interaction-service.ts`
  - `src/windows/input/*.ts`

## 维护规则

- 新能力先落 contract / handler / service / verification，不再补独立设计文档目录。
- 能写进测试的约束不要只写在文档里。
- 写需求文档或问题复盘时，默认提炼为通用的 Codex agent / Computer Use 使用体验需求；具体应用、联系人、文件或单次操作只能作为代表性案例和复现证据，不应把需求边界收窄到某一个应用。
- 如果文档和代码冲突，以代码与测试为准，然后回写本目录下的 harness 文档。
- 如果插件安装入口变化，先改 `.agents/plugins/marketplace.json`、manifest 和 README，再同步 `harness/plugin-installation.md`。

## 宿主协作原则

- `launch_app` 默认是 reuse-or-launch policy：如果 hook 检测到目标应用已经在后台、最小化或托盘中运行，禁止重复冷启动。宿主应转向 `windows.shell.taskbar`，通过 `get_window_state` 截图并点击任务栏/通知区域图标恢复现有会话；只有用户明确要求新实例时才使用 `force_new`。
- 对外工具响应不能用无信息的 `null` 表达关键状态。`launch_app` 成功时必须返回结构化成功原因、有效策略和 launch mode；失败时必须返回明确 `code`、`details` 和可执行 guidance，让宿主不需要猜测。
- 使用本插件不代表宿主只能使用本插件。宿主可以并且应该结合自身可用工具完成任务，例如用 shell / bash / PowerShell 搜索可执行文件、检查文件是否存在、读取日志或做非 UI 层面的验证；本插件只负责 Windows UI 自动化语义，不应阻止更快、更可靠的普通工具链。
