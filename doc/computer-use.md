# computer-use 插件高保真复现实现路线图

这个文件保留为项目主 handoff 文档。它不再承担逐 capability 的长篇设计说明，只保留接手顺序、当前完成状态、安装入口和未来修改时必须先看的边界。

## 1. 当前状态

- 截至 2026-06-03，`computer_use` 的共享核心、Windows 实现、native host、Codex adapter 和 Claude Code adapter 都已经落地。
- 所有主能力已经具备实现与测试覆盖：
  - discovery / launch：`list_apps`、`list_windows`、`get_window`、`launch_app`
  - capture / UIA：`get_window_state`、`click_element`、`set_value`、`perform_secondary_action`
  - action / lifecycle：`activate_window`、`click`、`press_key`、`type_text`、`scroll`、`drag`、`end_turn`
- trace/debug 已经收敛为共享能力，可通过 env、runtime config 或 request meta 开关。
- `launch_app` 现在默认是 policy hook：发现已有实例时会拒绝重复冷启动，并返回“转去任务栏/托盘恢复现有会话”的 guidance；只有显式要求时才应该 `force_new`。成功时返回结构化 launch report，不再返回无信息的 `null`，并会短暂观察匹配窗口、返回 `observedWindows` 与 `followUpActions`。
- `get_window_state` 会返回截图坐标映射和可见点击区域；trace 开启时直接回传截图/响应 artifact 绝对路径。`click` 默认仍使用 window-relative 坐标，也支持显式 `coordinateSpace: "screenshot"`。
- 标准 Windows file/folder/save dialogs 可以通过 `select_file_in_dialog`、`select_folder_in_dialog`、`set_save_path_in_dialog` 完成本地路径选择；这些 helper 不会执行目标 app 的发送、上传或发布动作。
- 风险 IM/Chromium app 的内容窗口仍避免 UIA traversal，但 native common dialog 会按窗口 class/title allowlist 放行。
- `list_apps` 会额外暴露 `windows.shell.taskbar`，作为 taskbar/notification area 的正式截图与点击目标；结果也带 `runtime.schemaVersion` / driver capability 信息，并保留 launcher、exe、process、taskbar label 等身份线索，方便把 `QQ` 这类友好入口和真实运行进程合并理解。当前用户会话里只有后台进程、没有可见窗口或 AppsFolder 入口的程序，也会作为 `executable_path` app 返回，并用 `isRunning: true`、`windows: []`、`processIds` 表达后台运行状态。
- 使用插件时仍可结合宿主的 shell/bash/文件搜索等工具定位 exe、验证文件和排查环境；插件不是唯一可用工具集。
- WGC smoke 在沙箱/受限 session 中不可用时不代表机器不支持 WGC；需要在沙箱外重新跑 native-host P5 smoke 再下结论。
- 插件根目录是 `D:\Desktop\computer-use\computer_use`，不是根目录 `scripts` 下的官方兼容客户端包装。
- Claude Code 安装入口是 repo-local marketplace：`D:\Desktop\computer-use\.claude-plugin\marketplace.json`。
- Claude Code 的用户级权限入口是：`%USERPROFILE%\.claude\settings.json`。安装脚本会把 `mcp__plugin_computer-use_computer-use` 合并进去，避免 `computer-use` MCP 工具每一步都要求点 `Yes`。
- Codex 安装入口是 repo-local marketplace：`D:\Desktop\computer-use\.agents\plugins\marketplace.json`。

## 2. 安装与使用入口

Claude Code 与 Codex 分开安装。

Claude Code：

```powershell
cd D:\Desktop\computer-use
npm run install:claude
```

Codex：

```powershell
cd D:\Desktop\computer-use
npm run install:codex
```

`npm run install:claude` 会安装 TypeScript 依赖、编译 runtime、编译 C# native host、验证 Claude marketplace 和 plugin manifest、运行 MCP smoke test、注册 Claude marketplace、重装 `computer-use@computer-use-local`，并提示你在当前会话执行 `/reload-plugins` 或开新会话。

安装器还会自动更新用户级 `~/.claude/settings.json`，把 `mcp__plugin_computer-use_computer-use` 加入 allowlist，所以不依赖 Claude Code 从哪个目录启动。

`npm run install:codex` 会注册 Codex marketplace、重装 `computer-use@computer-use-local`，并提示你开新线程验证 skill 与 MCP tools 是否加载。

安装后的正常入口：

- skill：`computer_use\skills\computer-use\SKILL.md`
- MCP manifest：`computer_use\.mcp.json`
- MCP entrypoint：`computer_use\dist\src\adapters\claude-code\mcp-entrypoint.js`
- Codex manifest：`computer_use\.codex-plugin\plugin.json`
- Claude manifest：`computer_use\.claude-plugin\plugin.json`

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

项目实现根：`D:\Desktop\computer-use\computer_use`

常用验证命令：

- `npm run typecheck`
- `npm test`
- `npx tsx --test tests/integration/codex-adapter.test.ts`
- `npx tsx --test tests/integration/claude-code-adapter.test.ts`
- `npx tsx --test tests/integration/native-host-p5-smoke.test.ts`
- `npx tsx --test tests/integration/stdio-runtime.test.ts`
- `node .\scripts\smoke-claude-mcp.mjs`
- `npm run doctor:claude`
- `npm run doctor:codex`

## 6. 为什么文档被收缩

这个仓库之前积累了大量阶段性 reverse-analysis 文档，但很多内容已经被代码与测试取代，继续并行维护只会制造过期信息。现在外层 `doc/` 保留的是：

- 接手入口
- 安装入口
- 能力与阶段验收口径
- 长期架构边界
- 当前实现状态

其余短生命周期材料已经移除。
