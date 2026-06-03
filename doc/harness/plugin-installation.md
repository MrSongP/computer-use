# Plugin Installation Harness

这个文档只记录本项目长期有效的插件安装边界，避免以后又回到官方 compatibility client 或根目录脚本包装。

## 当前安装模型

- 插件根目录：`G:\Desktop\computer_use\computer_use`
- Claude marketplace：`G:\Desktop\computer_use\.claude-plugin\marketplace.json`
- Codex manifest：`computer_use\.codex-plugin\plugin.json`
- Claude manifest：`computer_use\.claude-plugin\plugin.json`
- MCP manifest：`computer_use\.mcp.json`
- skill：`computer_use\skills\computer-use\SKILL.md`
- repo-local marketplace：`.agents\plugins\marketplace.json`
- 宿主安装脚本：`scripts\install-claude-code.ps1`、`scripts\install-codex.ps1`

`.agents\plugins\marketplace.json` 的 `source.path` 指向 `./computer_use`，也就是本仓库里的真实插件根目录。

## Claude Code 安装步骤

从仓库根目录执行：

```powershell
cd G:\Desktop\computer_use
powershell -ExecutionPolicy Bypass -File .\scripts\install-claude-code.ps1
```

这个脚本会完成：

1. `npm run build`
2. `claude plugin validate G:\Desktop\computer_use`
3. `claude plugin validate G:\Desktop\computer_use\computer_use`
4. `node .\scripts\smoke-claude-mcp.mjs`
5. `claude plugin marketplace add G:\Desktop\computer_use`
6. `claude plugin install computer-use@computer-use-local --scope user`

当前 Claude Code 会话需要执行 `/reload-plugins` 或直接开新会话，旧会话不会自动注入新工具。

## Codex 安装步骤

从仓库根目录执行：

```powershell
cd G:\Desktop\computer_use
powershell -ExecutionPolicy Bypass -File .\scripts\install-codex.ps1
```

这个脚本会完成：

1. `npm run build`
2. `node .\scripts\smoke-claude-mcp.mjs`
3. `codex plugin marketplace add G:\Desktop\computer_use`
4. `codex plugin add computer-use@computer-use-local`

Codex 这边的正常验证边界仍然是新线程；旧线程可能仍然看不到刚安装或刚更新的插件能力。

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
- `powershell -ExecutionPolicy Bypass -File .\scripts\doctor-computer-use.ps1 -Target Claude`
- `powershell -ExecutionPolicy Bypass -File .\scripts\doctor-computer-use.ps1 -Target Codex`
- 与改动相关的 adapter/integration test

如果只是文档或 skill 文本修改，至少跑一次 `npm run typecheck` 并确认 `SKILL.md` 没有把主路径带回旧 compatibility client。
