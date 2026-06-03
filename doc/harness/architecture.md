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
- 如果文档和代码冲突，以代码与测试为准，然后回写本目录下的 harness 文档。
- 如果插件安装入口变化，先改 `.agents/plugins/marketplace.json`、manifest 和 README，再同步 `harness/plugin-installation.md`。
