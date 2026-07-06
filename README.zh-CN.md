# computer_use

[English](./README.md)

`computer_use` 是一个面向 Codex 和 Claude Code 的本地 Windows computer-use 插件。它把窗口发现、窗口截图、UI Automation 文本树、鼠标/键盘输入、应用启动、turn lifecycle、中断处理和 trace evidence 统一到一套 TypeScript runtime 与 MCP server 里。插件根目录是 [`computer_use`](./computer_use/)，主要入口是 [`computer_use/.codex-plugin/plugin.json`](./computer_use/.codex-plugin/plugin.json)、[`computer_use/.mcp.json`](./computer_use/.mcp.json) 和 [`computer_use/skills/computer-use/SKILL.md`](./computer_use/skills/computer-use/SKILL.md)。

## 快速开始

要求：

- Windows 10 或 Windows 11
- Node.js 20+
- 安装到 Codex 时需要 Codex CLI；安装到 Claude Code 时需要 Claude Code CLI
- 编译 C# native host 需要 .NET SDK 8+

检查必需命令：

```powershell
node --version
npm --version
dotnet --info
claude --version
codex --version
```

如果 `dotnet --info` 没有列出 SDK，用 Windows Package Manager 安装 .NET SDK 8：

```powershell
winget install --id Microsoft.DotNet.SDK.8 --exact --accept-source-agreements --accept-package-agreements
```

如果安装后当前终端仍找不到 `dotnet`，安装器还会检查 `C:\Program Files\dotnet\dotnet.exe`。如果这个文件也不存在，请打开新终端，或确认 `C:\Program Files\dotnet` 已在 `PATH` 里。

从仓库根目录安装到 Codex：

```powershell
cd <path-to-cloned-repo>
npm run install:codex
```

安装到 Claude Code：

```powershell
cd <path-to-cloned-repo>
npm run install:claude
```

两个都安装：

```powershell
npm run install:all
```

npm 安装入口会安装 TypeScript 依赖、编译 runtime、编译 C# native host、运行 MCP smoke test、注册本地 marketplace、安装插件，并运行 Node 版 doctor。

## GitHub 分发与路径可移植性

本仓库是供其他用户从 GitHub 克隆和安装的正式插件源码，不依赖维护者本机目录。安装和运行逻辑不得写死用户名、盘符、仓库绝对路径、插件缓存目录或版本号。

- Codex 从已安装插件根目录解析 `.mcp.json` 中的相对路径。
- Claude Code 使用宿主提供的 `${CLAUDE_PLUGIN_ROOT}` 定位安装副本。
- 不要直接修改 Codex 或 Claude Code 的插件缓存；始终修改仓库源码后重新构建和安装。
- 维护者和自动化代理在修改代码前必须遵守根目录 [`AGENTS.md`](./AGENTS.md)。

## Trace / 调试记录

Codex 和 Claude Code 的发行插件默认开启 trace。每个宿主把记录写入自己当前安装副本下的：

```text
<plugin-root>/.artifacts/computer-use-trace/
  <sessionId>/<turnId>/<actionId>/
```

每次操作通常包含 `request.json`、`response.json` 或 `error.json`、`evidence.json`，以及与操作相关的截图、激活计划、指针反馈或 UIA 证据。该记录描述工具调用，不包含模型隐藏思维过程。

不同用户、宿主、安装方式和插件版本对应的 `<plugin-root>` 都可能不同。需要固定到其他位置时设置 `COMPUTER_USE_TRACE_DIR`，不要依赖文档中的某个本机绝对路径。

## Native Host 编译

只编译 C# Windows native host：

```powershell
npm run build:native
```

同时编译 TypeScript 和 C#：

```powershell
npm run build:all
```

如果已经完成编译，只想把当前产物一键安装：

```powershell
npm run install:codex:compiled
npm run install:claude:compiled
```

native-host 编译器会通过 .NET SDK 8+ 使用 `dotnet build`，并会依次检查 `PATH`、`COMPUTER_USE_DOTNET_PATH` 和 Windows 标准安装位置里的 `dotnet.exe`。

当前 .NET build 目标框架是 `net8.0-windows10.0.19041.0`，用于启用 `Windows.Graphics.Capture` 所需的 Windows SDK C#/WinRT projections。如果修改 native host 的目标框架，需要同步更新 `computer_use/src/windows/bridge/native-host-driver.ts` 里的 native-host 启动路径常量。

## 能力

- Discovery：`list_apps`、`list_windows`、`get_window`、`launch_app`
- Action：`get_window_state`（包含截图和结构化 UIA 节点）、`click`、`click_element`、`press_key`、`type_text`、`scroll`、`set_value`、`drag`、`perform_secondary_action`、`activate_window`
- Dialog：`select_file_in_dialog`、`select_folder_in_dialog`、`set_save_path_in_dialog`
- Lifecycle：`end_turn`、turn lifecycle、物理 Escape 中断和 trace evidence
- Codex adapter、Claude Code MCP adapter、Windows native-host bridge

MCP tool descriptor 会携带渐进式披露元数据：兼容宿主仍看到完整工具清单；支持分阶段展示的宿主或 wrapper 可以先展示 Discovery，选定 canonical window 后展示 Action，只在确认标准 Windows dialog 后展示 Dialog helpers。`get_window_state` 属于 Action lane，是输入动作前的观察/截图步骤。

`launch_app` 默认会拦截重复冷启动。如果检测到已有会话，hook 会返回去 `windows.shell.taskbar` 恢复现有窗口的指引；只有显式 `force_new` 才会绕过。

Windows native host 是按 turn/任务作用域管理的资源。正常完成、adapter close/shutdown、宿主 stdio 断开、进程清理钩子，以及短暂 native-host idle timeout 都会释放 Computer Use 资源；host 会按需重启，因为完成编译后的启动成本相对桌面操作很轻。

## 开发

```powershell
cd <path-to-cloned-repo>
npm run typecheck
npm test
```

常用专项验证：

```powershell
npm --prefix computer_use run test -- tests/integration/codex-adapter.test.ts
npm --prefix computer_use run test -- tests/integration/claude-code-adapter.test.ts
npm --prefix computer_use run test -- tests/integration/stdio-runtime.test.ts
npm --prefix computer_use run test -- tests/integration/native-host-p5-smoke.test.ts
npm run doctor:codex
npm run doctor:claude
```

`computer_use/` 里的 `npm run codex:helper` 只用于本地 JSON-RPC helper 调试，不是 Codex 插件安装后的常规入口。

## 文档

- 仓库维护契约：[AGENTS.md](./AGENTS.md)
- 文档入口：[doc/README.md](./doc/README.md)
- 架构总览：[doc/architecture/overview.md](./doc/architecture/overview.md)
- Windows native interface：[doc/architecture/windows-native-interface.md](./doc/architecture/windows-native-interface.md)
- 能力矩阵：[doc/acceptance/capability-matrix.md](./doc/acceptance/capability-matrix.md)
- 测试策略：[doc/development/testing.md](./doc/development/testing.md)
- 手工插件测试：[doc/development/manual-testing.md](./doc/development/manual-testing.md)
- Agent harness：[.claude/computer-use-harness.md](./.claude/computer-use-harness.md) 和 [.agents/computer-use-harness.md](./.agents/computer-use-harness.md)

## Windows 兼容说明

- Windows 10 和 Windows 11 都是目标支持环境。
- native-host 编译通过 .NET SDK 8+ 执行，并会自动检查 Windows 标准 `dotnet.exe` 安装路径。
- 任务栏目标优先使用 Win10/Win11 主任务栏，找不到时会退到 `Shell_SecondaryTrayWnd`，兼容 secondary taskbar 布局。
- Windows UI 自动化会影响真实桌面状态，执行 action 工具前请保持目标窗口明确。
