# Final Done Checklist

以后再改这个项目，至少要重新回答下面这些问题，回答不全就不算“改完了”。

## 1. 能力闭环

- [ ] 改动涉及的 capability 仍然有清晰 contract、handler、service 和 bridge/runtime 路径。
- [ ] 改动涉及的 capability 仍然能通过真实 Windows 路径执行，不只是 mock。
- [ ] `doc/acceptance/capability-matrix.md` 里对应条目仍然准确。

## 2. 双宿主闭环

- [ ] Codex 路径没有被改坏。
- [ ] Claude Code 路径没有被改坏。
- [ ] 如果 schema / contract 改了，两套 adapter 都同步了。
- [ ] 如果插件安装路径改了，`.agents/plugins/marketplace.json`、`.codex-plugin/plugin.json`、`.mcp.json`、README 和 `doc/harness/plugin-installation.md` 都同步了。

## 3. trace / lifecycle

- [ ] `trace-config`、evidence schema 和 artifact writer 仍可复用。
- [ ] `end_turn`、interrupt 和 stdio lifecycle 没被破坏。
- [ ] interrupted turn 仍会 `resetTurn("interrupted")`，未结束的旧 turn 仍会在新 turn 开始前 reset。
- [ ] native-host reset 仍会 dispose resident host process，不把 queued work 带进下一轮。
- [ ] `get_window_state` 仍会暴露 WGC fallback 诊断（`wgc_failed`）和窗口未响应状态（`window.health.hung`）。
- [ ] 临时排障证据没有遗留在仓库里。

## 4. 关键验证

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] 必要时补跑：
  - `tests/integration/codex-adapter.test.ts`
  - `tests/integration/claude-code-adapter.test.ts`
  - `tests/integration/native-host-p5-smoke.test.ts`
  - `tests/integration/stdio-runtime.test.ts`

## 5. 文档同步

- [ ] 保留文档仍然只指向外层 `doc/` harness。
- [ ] 没有重新引入分散的 capability 设计文档目录。
- [ ] 如果长期边界变化，至少同步路线图、矩阵或 harness 文档中的一处入口说明。
- [ ] README 仍包含中英文说明和 Codex 插件安装步骤。
