# computer_use Doc Harness

外层 `doc/` 是这个项目唯一保留的长期中文文档入口。README 负责快速安装和上手，`doc/` 负责接手边界、验收口径和 harness 约束。

## 阅读顺序

1. `../README.md`
2. `computer-use.md`
3. `acceptance/capability-matrix.md`
4. `acceptance/phase-acceptance-matrix.md`
5. `acceptance/final-done-checklist.md`
6. `windows_native_interface/windows-native-interface-design.md`
7. `scaffold_status/current-scaffold-status-and-next-steps.md`
8. `harness/architecture.md`
9. `harness/action-lane.md`
10. `harness/plugin-installation.md`
11. `harness/wgc-capture-bug.md` — WGC 抓帧降级 GDI 的根因与修复方向（持续参考）

## 保留原则

- 这里只保留长期约束、接手入口、验收口径和关键实现边界。
- 过去按 capability 拆开的 `investigation` / `implementation-guide` 文档已经移除。
- 细节优先回到代码和测试查看，不再维护一组容易过时的逐能力设计副本。
- 临时排障材料不再留在仓库里；需要复盘时，优先看测试、trace schema 和外部保存的证据目录。
- 插件安装说明必须跟 `.codex-plugin/plugin.json`、`.mcp.json` 和 `.agents/plugins/marketplace.json` 同步。

## 代码主入口

- 项目实现根：`D:\Desktop\computer-use\computer_use`
- Codex plugin manifest：`D:\Desktop\computer-use\computer_use\.codex-plugin\plugin.json`
- 本地 marketplace：`D:\Desktop\computer-use\.agents\plugins\marketplace.json`
- 共享核心：`D:\Desktop\computer-use\computer_use\src\core`
- Windows 实现：`D:\Desktop\computer-use\computer_use\src\windows`
- 双宿主适配：`D:\Desktop\computer-use\computer_use\src\adapters`
- native host：`D:\Desktop\computer-use\computer_use\native-host\ComputerUse.NativeHost`
- 测试：`D:\Desktop\computer-use\computer_use\tests`
