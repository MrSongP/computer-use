# Plugin Installation Harness

这个文档记录本项目长期有效的插件安装边界，避免以后又回到官方 compatibility client 或 PowerShell-only 安装路径。

## 当前安装模型

- 插件根目录：`D:\Desktop\computer-use\computer_use`
- Claude user settings：`%USERPROFILE%\.claude\settings.json`
- Claude marketplace：`D:\Desktop\computer-use\.claude-plugin\marketplace.json`
- Codex manifest：`computer_use\.codex-plugin\plugin.json`
- Claude manifest：`computer_use\.claude-plugin\plugin.json`
- MCP manifest：`computer_use\.mcp.json`
- skill：`computer_use\skills\computer-use\SKILL.md`
- repo-local marketplace：`.agents\plugins\marketplace.json`
- 推荐安装入口：根目录 `npm run install:codex`、`npm run install:claude`
- 兼容安装入口：`scripts\install-claude-code.ps1`、`scripts\install-codex.ps1`

当前 `launch_app` 的长期语义也要一起记住：默认不是“每次都冷启动”，也不是 runtime 直接帮你恢复各种程序界面；它会在检测到已有实例时通过 hook 拒绝重复启动，并把“去 `windows.shell.taskbar` 截图/点击已有图标恢复”的 guidance 返回给模型。只有显式要求新实例时才应走 `force_new`。

`.agents\plugins\marketplace.json` 的 `source.path` 指向 `./computer_use`，也就是本仓库里的真实插件根目录。

## 推荐安装步骤

安装前依赖：

- Windows 10 或 Windows 11
- Node.js 20+
- 安装到 Codex 时需要 Codex CLI；安装到 Claude Code 时需要 Claude Code CLI
- 编译 C# native host 需要 .NET SDK 8+
- 只有不用 `dotnet build`、退回 Windows .NET Framework `csc.exe` fallback 时，才需要 Windows 10/11 SDK 提供 `Windows.winmd`

依赖检查：

```powershell
node --version
npm --version
dotnet --info
claude --version
codex --version
```

安装 .NET SDK 8：

```powershell
winget install --id Microsoft.DotNet.SDK.8 --exact --accept-source-agreements --accept-package-agreements
```

从仓库根目录执行：

```powershell
cd D:\Desktop\computer-use
npm run install:codex
npm run install:claude
```

`npm run install:codex` 会完成：

1. `npm --prefix computer_use install`
2. `npm --prefix computer_use run build`
3. `npm run build:native`
4. `node .\scripts\smoke-claude-mcp.mjs`
5. `codex plugin marketplace add D:\Desktop\computer-use`
6. `codex plugin add computer-use@computer-use-local`
7. Node 版 Codex doctor

`npm run install:claude` 会完成：

1. `npm --prefix computer_use install`
2. `npm --prefix computer_use run build`
3. `npm run build:native`
4. `claude plugin validate D:\Desktop\computer-use`
5. `claude plugin validate D:\Desktop\computer-use\computer_use`
6. `node .\scripts\smoke-claude-mcp.mjs`
7. `claude plugin marketplace add D:\Desktop\computer-use`
8. `claude plugin install computer-use@computer-use-local --scope user`
9. 合并 `mcp__plugin_computer-use_computer-use` 到 `~/.claude/settings.json`
10. Node 版 Claude doctor

当前 Claude Code 会话需要执行 `/reload-plugins` 或直接开新会话。Codex 也建议开新线程，让插件 skill 和 MCP tools 重新加载。

## Native Host 编译

只编译 C# native host：

```powershell
npm run build:native
```

编译 TypeScript + C#：

```powershell
npm run build:all
```

如果已经编译完成，只想重新安装当前产物：

```powershell
npm run install:codex:compiled
npm run install:claude:compiled
```

native-host 编译顺序：

1. 优先使用 `dotnet build`。
2. 如果没有 .NET SDK，则退回 Windows .NET Framework `csc.exe`。
3. `Windows.winmd` 会从本机 Windows Kits 目录动态扫描，避免 Win10/Win11 SDK 版本写死。

如果 fallback 编译提示缺少 `Windows.winmd`，安装 Windows 10/11 SDK，或设置 `COMPUTER_USE_WINDOWS_WINMD_PATH` 到本机实际 `Windows.winmd` 文件。

## PowerShell 兼容入口

旧入口仍保留：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-claude-code.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\install-codex.ps1
```

这些脚本会尽量沿用当前正在运行的 PowerShell host 调用子脚本，避免 PowerShell 7 与 Windows PowerShell 5.1 混用。但新开发和文档应优先使用 npm/Node 入口。

## 不再保留的入口

根目录 `scripts\computer-use-client.mjs` 不再需要，也不应恢复为常规入口。原因：

- 它只查找用户目录下官方 bundled `computer-use` plugin cache。
- 它导出的是官方 compatibility client 的 setup 函数，不会经过本项目的 `.codex-plugin`、`.mcp.json`、TypeScript contracts 或 native-host adapter。
- 安装给 Codex 后，Codex 应通过插件 manifest 和 MCP server 加载能力，不需要这个 wrapper。

如果未来确实要做官方客户端兼容验证，应在独立测试 harness 中显式命名，不要放回根目录默认脚本，也不要让 `SKILL.md` 重新以它为主路径。

## 更新后验证

修改 manifest、skill、MCP schema 或 marketplace 后，至少验证：

- `rg -n "computer-use-client" computer_use\skills computer_use\src`
- 检查 `computer_use\skills\computer-use\SKILL.md` 没有恢复官方客户端 import、bootstrap 或旧 JS 会话主路径。
- `npm run typecheck`
- `node .\scripts\smoke-claude-mcp.mjs`
- `npm run doctor:codex`
- `npm run doctor:claude`
- 与改动相关的 adapter/integration test

如果改动了 Claude Code 权限模型，还要额外确认：

- `%USERPROFILE%\.claude\settings.json` 仍包含 `mcp__plugin_computer-use_computer-use`
- 任意工作目录启动的 Claude Code 会话不会再对 `computer-use` MCP 工具逐步弹 `Yes`

如果只是文档或 skill 文本修改，至少跑一次 `npm run typecheck` 并确认 `SKILL.md` 没有把主路径带回旧 compatibility client。
