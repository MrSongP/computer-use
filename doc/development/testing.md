# Testing Strategy

This document owns the repository test architecture, commands, fixture responsibilities, and executable policy gates.

## Test Layers

| Layer | Purpose | Primary location |
| --- | --- | --- |
| Contract | Keep documentation, manifests, adapters, versions, paths, and public inventories aligned | `computer_use/tests/contract/` |
| Unit | Prove validation, normalization, services, lifecycle, and bridge behavior in isolation | `computer_use/tests/unit/` |
| Integration | Prove handlers, adapters, stdio, trace, dialogs, and cross-layer behavior | `computer_use/tests/integration/` |
| Real Windows smoke | Exercise WGC, UIA, activation, and native input against a controlled WinForms application | `native-host-p5-smoke.test.ts` |
| Install/doctor | Prove packaged manifests, startup paths, installation, and host discovery | `scripts/` plus doctor commands |

Mocks are appropriate for deterministic contract and service tests. They are not sufficient evidence for Windows input or capture behavior.

## Real Windows Fixture

`computer_use/tests/fixtures/ComputerUse.P5SmokeApp.cs` is the controlled native action fixture.

The smoke test must exercise these non-dialog actions through the real native host:

- `activate_window`
- `click`
- `click_element`
- `press_key`
- `type_text`
- `scroll`
- `set_value`
- `drag`
- `perform_secondary_action`

The fixture exposes observable status changes for each action. UIA indexes must be reacquired from the latest text-bearing snapshot before every indexed action.

WGC is verified in a nested check. Restricted or sandboxed desktop sessions may skip only the WGC assertion; they must not silently skip the independent action checks.

## Standard Dialog Helpers

`select_file_in_dialog`, `select_folder_in_dialog`, and `set_save_path_in_dialog` operate on separate modal dialog handles rather than the main fixture window.

`computer_use/tests/integration/common-dialog-helper.test.ts` owns:

- file/folder/parent-path validation;
- the composed activation, text, and keyboard workflow;
- result shape and `dialogClosed` semantics;
- coverage for all three helpers.

## Policy As Code

Repository contract tests enforce rules that can be determined mechanically:

- `.agents/` and `.claude/` mirror equality;
- public capability presence in canonical documentation;
- Codex and Claude Code capability parity;
- action-smoke and dialog-helper coverage gates;
- portable manifest paths;
- package/manifest version alignment;
- native target-framework alignment;
- canonical Markdown structure and valid local links.

Rules requiring interpretation remain in agent or contributor contracts. Examples include destination verification, action-time confirmation, judging whether an application task succeeded, and deciding whether UI state is safe.

Windows 10/11 and multi-machine compatibility require an environment matrix; a single local test run cannot prove them.

## Commands

Standard change:

```powershell
npm run typecheck
npm test
```

Native-host change:

```powershell
npm run build:all
npm test
```

Focused checks:

```powershell
npm --prefix computer_use run test -- tests/contract/repository-policy.contract.test.ts
npm --prefix computer_use run test -- tests/integration/common-dialog-helper.test.ts
npm --prefix computer_use run test -- tests/integration/native-host-p5-smoke.test.ts
npm --prefix computer_use run test -- tests/integration/codex-adapter.test.ts
npm --prefix computer_use run test -- tests/integration/claude-code-adapter.test.ts
npm --prefix computer_use run test -- tests/integration/stdio-runtime.test.ts
```

Install-surface change:

```powershell
claude plugin validate .\computer_use
npm run typecheck
npm test
npm run install:codex:compiled
npm run install:claude:compiled
npm run doctor:codex
npm run doctor:claude
```

Use non-compiled installers when build outputs are not fresh.

## Adding Or Changing A Capability

1. Update the shared contract and handler.
2. Update the Windows service/bridge/native payload when applicable.
3. Keep Codex and Claude Code schemas aligned.
4. Add the smallest unit or integration regression test.
5. Add real fixture coverage for a non-dialog action.
6. Update dialog-helper coverage for a dialog action.
7. Update the capability matrix and affected agent contracts.
8. Run targeted tests, then the standard suite.
9. Search for stale names, dead links, fixed paths, and generated artifacts.

## Completion Evidence

Before claiming completion:

- read fresh test output;
- ensure no expected test was skipped unexpectedly;
- confirm `git diff --check` passes;
- confirm no trace, screenshot, build, cache, or temporary fixture output is present;
- record any environment checks that could not run.
