# 当前框架状态与下一步

## 1. 当前结论

这个仓库已经从“scaffold 阶段”进入“维护现有完整实现”的阶段。

- `computer_use/` 是实际实现根。
- `src/core`、`src/windows`、`src/adapters`、`native-host` 的分层已经稳定。
- discovery、capture、UIA、action、lifecycle、双宿主 adapter 都已落地。
- 文档侧不再维护一批逐 capability 设计稿，而是依赖当前这套 harness 文档 + 代码 + 测试。

## 2. 当前实现骨架

- 共享核心：
  - `src/core/contracts`
  - `src/core/capabilities`
  - `src/core/runtime`
  - `src/core/dispatcher`
  - `src/core/trace`
  - `src/core/interrupt`
- Windows 实现：
  - `src/windows/activation`
  - `src/windows/discovery`
  - `src/windows/launch`
  - `src/windows/capture`
  - `src/windows/uia`
  - `src/windows/input`
  - `src/windows/bridge`
- 宿主适配：
  - `src/adapters/codex`
  - `src/adapters/claude-code`
- native host：
  - `native-host/ComputerUse.NativeHost/Program.cs`

## 3. 现在真正要做的“下一步”

以后再接这个仓库，优先级不再是“把缺失大功能补完”，而是下面几类维护工作：

1. 修具体 capability 的行为或兼容性问题。
2. 改 adapter / schema 时保持双宿主对齐。
3. 调整 native host 行为时，确保 trace、lifecycle 和测试证据不被破坏。
4. 清理临时材料，保持 `doc/` 只承载长期 harness。

## 4. 推荐验证顺序

最小验证：

- `npm run typecheck`
- `npm test`

按改动范围补充：

- 动作链：`tests/unit/*input-service.test.ts`、`tests/integration/action-lane.test.ts`
- trace / lifecycle：`tests/unit/trace-config.test.ts`、`tests/integration/trace-evidence.test.ts`、`tests/integration/stdio-runtime.test.ts`
- adapter：`tests/integration/codex-adapter.test.ts`、`tests/integration/claude-code-adapter.test.ts`
- capture / UIA / native host：`tests/integration/native-host-p5-smoke.test.ts`
