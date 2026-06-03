# Plugin Installation Harness

这个文档只记录本项目长期有效的插件安装边界，避免以后又回到官方 compatibility client 或根目录脚本包装。

## 当前安装模型

- 插件根目录：`G:\Desktop\computer_use\computer_use`
- Codex manifest：`computer_use\.codex-plugin\plugin.json`
- MCP manifest：`computer_use\.mcp.json`
- skill：`computer_use\skills\computer-use\SKILL.md`
- repo-local marketplace：`.agents\plugins\marketplace.json`

`.agents\plugins\marketplace.json` 的 `source.path` 指向 `./computer_use`，也就是本仓库里的真实插件根目录。

## Codex 安装步骤

从仓库根目录执行：

```powershell
cd G:\Desktop\computer_use
codex plugin marketplace add G:\Desktop\computer_use
```

然后在 Codex App 的 **Plugins** 或 Codex CLI 的 `/plugins` 中：

1. 选择 `computer_use Local` / `computer-use-local` marketplace。
2. 安装 `computer-use`。
3. 开新线程验证 skill 与 MCP tools 是否加载。

新线程是必要边界；旧线程可能仍然看不到刚安装或刚更新的插件能力。

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
- 与改动相关的 adapter/integration test

如果只是文档或 skill 文本修改，至少跑一次 `npm run typecheck` 并确认 `SKILL.md` 没有把主路径带回旧 compatibility client。
