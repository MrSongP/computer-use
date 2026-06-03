# Phase Acceptance Matrix

这份表保留项目分阶段完成的长期口径，方便以后判断“改动有没有破坏原来的收口条件”。

| 阶段 | 现在代表什么 | 当前长期证据 |
| --- | --- | --- |
| `P0` | 文档、安装入口和验收口径被冻结在 README + 外层 `doc/` harness 中 | `README.md`、`.agents/plugins/marketplace.json`、`capability-matrix.md`、`phase-acceptance-matrix.md`、`final-done-checklist.md`、`harness/plugin-installation.md` |
| `P1` | trace/debug 是共享基础设施，不是 capability 私货 | `src/core/trace/*`、`tests/unit/trace-config.test.ts`、`tests/integration/trace-evidence.test.ts` |
| `P2` | action lane、interrupt、stdio lifecycle 已成主干能力 | `src/core/interrupt/*`、`src/core/transport/stdio-server.ts`、`tests/integration/action-lane.test.ts`、`tests/integration/stdio-runtime.test.ts` |
| `P3` | resident native host 是默认真实桥 | `src/windows/bridge/native-host-driver.ts`、`native-host/ComputerUse.NativeHost/Program.cs`、`tests/unit/native-bridge-factory.test.ts` |
| `P4` | discovery / launch 已经闭环 | `src/windows/discovery/*`、`src/windows/launch/*`、相关 unit + adapter tests |
| `P5` | capture / UIA / pointer 扩展能力已闭环 | `src/windows/capture/*`、`src/windows/uia/*`、`tests/integration/native-host-p5-smoke.test.ts` |
| `P6` | Codex adapter 端到端可用 | `src/adapters/codex/*`、`tests/integration/codex-adapter.test.ts` |
| `P7` | Claude Code adapter 与双宿主收口完成 | `src/adapters/claude-code/*`、`tests/integration/claude-code-adapter.test.ts` |

## 维护规则

1. 如果某次改动破坏了上表里的长期证据，就不能宣称该阶段仍保持完成。
2. 如果以后真的新增阶段，继续追加到这张表，不再重建另一套阶段文档。
3. 阶段汇报优先引用测试与代码锚点，不再依赖旧的逐能力分析材料。
