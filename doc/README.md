# computer_use Documentation

`doc/` is the human-facing documentation area for the `computer_use` project. It explains what the project is, what it supports, where the implementation lives, and which verification evidence proves the current capability surface.

Agent execution rules, maintenance harnesses, and test-agent prompts live outside `doc/`:

- `.claude/computer-use-harness.md`
- `.claude/computer-use-maintenance-checklist.md`
- `.claude/computer-use-installation-harness.md`
- `.claude/agent/computer-use-plugin-test-agent.md`
- `.agents/computer-use-harness.md`
- `.agents/computer-use-maintenance-checklist.md`
- `.agents/computer-use-installation-harness.md`

## Reading Order

1. Repository README: `../README.md`
2. Project overview: `computer-use.md`
3. Capability matrix: `acceptance/capability-matrix.md`
4. Windows native interface: `windows_native_interface/windows-native-interface-design.md`

## Documentation Scope

Keep `doc/` focused on stable project documentation:

- project purpose and supported capabilities
- installation and development entrypoints
- implementation layout
- acceptance evidence
- Windows native design boundaries

Do not put agent harnesses, task checklists, temporary investigation notes, trace artifacts, or phase-scaffold notes in `doc/`. Put agent-facing operating rules in `.claude/` and `.agents/`, and put behavior guarantees in tests whenever possible.

## Code Anchors

- Plugin root: `D:\Desktop\computer-use\computer_use`
- Codex manifest: `D:\Desktop\computer-use\computer_use\.codex-plugin\plugin.json`
- Claude Code manifest: `D:\Desktop\computer-use\computer_use\.claude-plugin\plugin.json`
- MCP manifest: `D:\Desktop\computer-use\computer_use\.mcp.json`
- Codex marketplace: `D:\Desktop\computer-use\.agents\plugins\marketplace.json`
- Shared core: `D:\Desktop\computer-use\computer_use\src\core`
- Windows implementation: `D:\Desktop\computer-use\computer_use\src\windows`
- Host adapters: `D:\Desktop\computer-use\computer_use\src\adapters`
- Native host: `D:\Desktop\computer-use\computer_use\native-host\ComputerUse.NativeHost`
- Tests: `D:\Desktop\computer-use\computer_use\tests`
