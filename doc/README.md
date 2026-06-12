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
5. Frame change gate requirements / 帧变化门控需求: `frame-change-gate-requirements.md`

## Documentation Scope

Keep `doc/` focused on stable project documentation:

- project purpose and supported capabilities
- installation and development entrypoints
- implementation layout
- acceptance evidence
- Windows native design boundaries
- frame caching and visual change gate requirements / 帧缓存与视觉变化门控需求

Do not put agent harnesses, task checklists, temporary investigation notes, trace artifacts, or phase-scaffold notes in `doc/`. Put agent-facing operating rules in `.claude/` and `.agents/`, and put behavior guarantees in tests whenever possible.

## Code Anchors

- Plugin root: `computer_use`
- Codex manifest: `computer_use\.codex-plugin\plugin.json`
- Claude Code manifest: `computer_use\.claude-plugin\plugin.json`
- MCP manifest: `computer_use\.mcp.json`
- Codex marketplace: `.agents\plugins\marketplace.json`
- Shared core: `computer_use\src\core`
- Windows implementation: `computer_use\src\windows`
- Host adapters: `computer_use\src\adapters`
- Native host: `computer_use\native-host\ComputerUse.NativeHost`
- Tests: `computer_use\tests`
