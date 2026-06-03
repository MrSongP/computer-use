# computer-use 插件高保真复现实现路线图

这个文件保留为项目主 handoff 文档。它不再承担逐 capability 的长篇设计说明，只保留接手顺序、当前完成状态、安装入口和未来修改时必须先看的边界。

## 1. 当前状态

- 截至 2026-06-03，`computer_use` 的共享核心、Windows 实现、native host、Codex adapter 和 Claude Code adapter 都已经落地。
- 所有主能力已经具备实现与测试覆盖：
  - discovery / launch：`list_apps`、`list_windows`、`get_window`、`launch_app`
  - capture / UIA：`get_window_state`、`click_element`、`set_value`、`perform_secondary_action`
  - action / lifecycle：`activate_window`、`click`、`press_key`、`type_text`、`scroll`、`drag`、`end_turn`
- trace/debug 已经收敛为共享能力，可通过 env、runtime config 或 request meta 开关。
- 插件根目录是 `G:\Desktop\computer_use\computer_use`，不是根目录 `scripts` 下的官方兼容客户端包装。
- Codex 安装入口是 repo-local marketplace：`G:\Desktop\computer_use\.agents\plugins\marketplace.json`。

## 2. 安装与使用入口

从仓库根目录注册本地 marketplace：

```powershell
cd G:\Desktop\computer_use
codex plugin marketplace add G:\Desktop\computer_use
```

然后在 Codex App 的 **Plugins** 或 Codex CLI 的 `/plugins` 里选择 `computer_use Local` / `computer-use-local`，安装 `computer-use`。安装或重新安装后必须开新线程验证 skill 与 MCP tools 是否加载。

安装后的正常入口：

- skill：`computer_use\skills\computer-use\SKILL.md`
- MCP manifest：`computer_use\.mcp.json`
- MCP entrypoint：`computer_use\src\adapters\claude-code\mcp-entrypoint.ts`
- Codex manifest：`computer_use\.codex-plugin\plugin.json`

`scripts\computer-use-client.mjs` 不再需要。它只会把执行路径带回官方缓存里的 compatibility client，不能代表这个项目的 TypeScript runtime、native-host bridge、MCP schema 或测试证据。

## 3. 接手顺序

1. 先读仓库根 [`README.md`](../README.md)
2. 再读：
   - `acceptance/capability-matrix.md`
   - `acceptance/phase-acceptance-matrix.md`
   - `acceptance/final-done-checklist.md`
3. 然后读：
   - `windows_native_interface/windows-native-interface-design.md`
   - `scaffold_status/current-scaffold-status-and-next-steps.md`
   - `harness/architecture.md`
   - `harness/action-lane.md`
   - `harness/plugin-installation.md`
4. 最后再进代码：
   - `computer_use/src/core`
   - `computer_use/src/windows`
   - `computer_use/src/adapters`
   - `computer_use/native-host/ComputerUse.NativeHost`

## 4. 未来修改的基本原则

- 不再新增逐 capability 的 `investigation` / `implementation-guide` 文档目录。
- 文档只保留长期边界、验收口径和接手入口；具体细节优先写进代码和测试。
- 改 capability 时，同时更新 capability matrix / phase matrix / final checklist 中对应条目。
- 临时 trace、repro、bug 证据不要长期留在仓库里。
- 改插件 manifest、MCP schema、安装路径或 skill 时，必须同步 README 与 `harness/plugin-installation.md`。

## 5. 验证入口

项目实现根：`G:\Desktop\computer_use\computer_use`

常用验证命令：

- `npm run typecheck`
- `npm test`
- `npx tsx --test tests/integration/codex-adapter.test.ts`
- `npx tsx --test tests/integration/claude-code-adapter.test.ts`
- `npx tsx --test tests/integration/native-host-p5-smoke.test.ts`
- `npx tsx --test tests/integration/stdio-runtime.test.ts`

## 6. 为什么文档被收缩

这个仓库之前积累了大量阶段性 reverse-analysis 文档，但很多内容已经被代码与测试取代，继续并行维护只会制造过期信息。现在外层 `doc/` 保留的是：

- 接手入口
- 安装入口
- 能力与阶段验收口径
- 长期架构边界
- 当前实现状态

其余短生命周期材料已经移除。
