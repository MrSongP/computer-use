# computer_use Repository Contract

## Product Status

This repository is the source of a production-oriented Windows plugin distributed through GitHub for both Codex and Claude Code. It is not a demo, a single-machine fixture, or a throwaway local integration.

All changes must remain installable by an unrelated user who clones the repository into an arbitrary directory, uses an arbitrary Windows account name and drive, and installs a future plugin version.

## Required Reading Before Editing

Before modifying any source code, manifest, installer, or test, read:

1. This `AGENTS.md`.
2. `README.zh-CN.md` and `README.md` for supported installation and user-facing behavior.
3. `doc/README.md` for the canonical documentation map and ownership boundaries.
4. `doc/architecture/overview.md` for architecture and capability boundaries.
5. `.agents/computer-use-harness.md` for tool semantics and lifecycle rules.
6. `.agents/computer-use-maintenance-checklist.md` for completion requirements.

Then read the documents required by the change area:

| Change area | Additional required reading |
| --- | --- |
| Plugin manifests, installation, marketplace, MCP startup, or trace location | `.agents/computer-use-installation-harness.md`, `computer_use/.mcp.json`, `computer_use/.codex-plugin/plugin.json`, `computer_use/.claude-plugin/plugin.json`, and `scripts/install-plugin.mjs` |
| Capability contract, handler, adapter schema, or result shape | `doc/acceptance/capability-matrix.md`, the relevant file under `computer_use/src/core/contracts/`, the relevant capability contract/handler, and its tests |
| Windows capture, input, UIA, activation, discovery, or native host | `doc/architecture/windows-native-interface.md`, the relevant TypeScript Windows service, native-host implementation, and tests |
| Agent workflow or tool-use guidance | `computer_use/skills/computer-use/SKILL.md` and both mirrored harnesses under `.agents/` and `.claude/` |
| Trace/evidence behavior | `computer_use/README.md` Trace / Debug section, `computer_use/src/core/trace/`, and trace integration tests |
| Test strategy, fixture coverage, or quality gates | `doc/development/testing.md`, both mirrored maintenance checklists, and the relevant contract/integration tests |

Do not edit from an issue description alone when the repository contains a contract or test for that behavior.

## Portability Rules

- Never hard-code a developer user name, home directory, drive letter, clone directory, temporary directory, plugin cache directory, or installed plugin version.
- Never depend on this repository being located at the maintainer's current checkout path or any other example path.
- Never use a version-specific Claude cache path.
- For Claude Code plugin files, use host substitutions such as `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, and `${CLAUDE_PROJECT_DIR}` according to their documented meanings.
- For Codex plugin files, use paths relative to the installed plugin or marketplace root. Marketplace paths must remain `./`-prefixed and relative to the marketplace root.
- Resolve user overrides with standard environment variables or explicit configuration; do not infer machine-specific locations.
- Treat the source tree as the only editable source of truth. Do not patch files directly inside Codex or Claude plugin caches. Rebuild and reinstall from the repository.
- Keep Codex and Claude Code behavior aligned. A manifest or startup change is incomplete until both hosts have been considered and verified.
- Generated trace evidence belongs under the active installed plugin root at `.artifacts/computer-use-trace/` unless the user explicitly sets `COMPUTER_USE_TRACE_DIR`.
- Trace paths and install paths may change after upgrades. Code and documentation must describe them symbolically, not by one machine's observed absolute path.

## Contract And Compatibility Rules

- Shared semantics live in core contracts and handlers; adapters must not invent divergent behavior.
- Tool schemas, TypeScript contracts, native-host payloads, documentation, skills, and tests must be updated together when a public field changes.
- Geometric screenshot metadata must not be named or documented as proof of clickability.
- `coordinateSpace: "screenshot"` changes coordinate mapping only; it does not bypass native pointer hit-testing.
- Preserve lifecycle cleanup across `end_turn`, adapter close/shutdown, interruption, stale turns, and native-host idle disposal.
- Do not add a dependency unless the task explicitly requires it and existing platform/runtime facilities are insufficient.

## Change Protocol

1. Inspect `git status` and preserve unrelated user changes.
2. Identify the public contract and the smallest verification that proves the requested behavior.
3. Add or update a regression test before behavior-changing implementation when coverage is missing.
4. Implement the smallest coherent change across all affected hosts and layers.
5. Use the documentation sync matrix below to update every affected user-facing, maintainer-facing, and agent-facing surface in the same change.
6. Search for stale field names, old paths, fixed versions, and contradictory guidance.
7. Run the required verification and inspect its output before claiming completion.

A change is incomplete if it updates only `README*.md` or `doc/` while leaving affected agent contracts under `.agents/`, `.claude/`, or `computer_use/skills/` stale. When a rule can be checked mechanically, add or update a contract test so future contributors cannot silently omit the same synchronization work.

## Verification

For a standard TypeScript change:

```powershell
npm run typecheck
npm test
```

For native-host changes:

```powershell
npm run build:all
npm test
```

For manifest, installer, marketplace, or cross-host startup changes:

```powershell
claude plugin validate .\computer_use
npm run typecheck
npm test
npm run install:codex:compiled
npm run install:claude:compiled
npm run doctor:codex
npm run doctor:claude
```

Use the non-compiled installer variants when build outputs are not already fresh. After installation changes, verify the installed manifests or launch the installed MCP server; do not rely only on source-tree tests.

Before finishing, search for forbidden machine-specific paths and stale public names, then run `git diff --check`.

## Documentation Ownership And Synchronization

Each documentation surface has one primary responsibility:

| Surface | Primary responsibility |
| --- | --- |
| `README.md`, `README.zh-CN.md` | User-facing product summary, prerequisites, quick install, and links to canonical detail |
| `computer_use/README.md` | Plugin-root packaging, runtime, trace, and plugin-local developer entrypoints |
| `doc/architecture/` | Stable system structure, dependency direction, lifecycle, and Windows implementation boundaries |
| `doc/acceptance/capability-matrix.md` | Supported public capability inventory, code anchors, and primary verification evidence |
| `doc/development/testing.md` | Test layers, real Windows fixture coverage, commands, and limits of executable policy |
| `AGENTS.md` | Repository-wide contributor contract and change protocol |
| `.agents/computer-use-harness.md` and `.claude/computer-use-harness.md` | Mirrored agent semantics and workflow contract |
| `.agents/computer-use-maintenance-checklist.md` and `.claude/computer-use-maintenance-checklist.md` | Mirrored completion and evidence gates |
| `.agents/computer-use-installation-harness.md` and `.claude/computer-use-installation-harness.md` | Mirrored install, marketplace, and startup maintenance contract |
| `computer_use/skills/computer-use/SKILL.md` | Installed agent operating instructions and safety policy |

Apply these synchronization triggers:

| Change | Required documentation and tests |
| --- | --- |
| Public capability, field, result, or semantic change | Capability matrix, both agent harnesses, plugin skill, adapter schemas, and contract/integration tests |
| Action or native Windows behavior | Architecture docs, testing strategy, capability evidence, and the real smoke fixture when applicable |
| Agent workflow or safety guidance | Plugin skill plus both mirrored harnesses; add a contract test for mechanically enforceable rules |
| Test strategy or completion gate | `doc/development/testing.md`, both mirrored maintenance checklists, and repository policy tests |
| Install, manifest, marketplace, startup, or trace-root behavior | Both root READMEs, plugin README, both installation harnesses, manifests/scripts, and install tests |

- Keep `.agents/` and `.claude/` mirror documents byte-for-byte synchronized where both exist.
- Do not duplicate detailed architecture, test strategy, or capability tables into README files; link to the canonical document.
- Remove or repair dead links in the same change that moves or renames documentation.
- Do not commit trace output, screenshots, temporary repro directories, build output, plugin caches, or generated `.artifacts/`.
- Examples must use placeholders such as `<path-to-cloned-repo>` or symbolic plugin roots.

## Commit Messages

When creating commits, use an intent-first message and include useful decision trailers:

```text
<why the change was needed>

Constraint: <external constraint>
Rejected: <alternative> | <reason>
Confidence: <low|medium|high>
Scope-risk: <narrow|moderate|broad>
Tested: <verification performed>
Not-tested: <known gap>
```
