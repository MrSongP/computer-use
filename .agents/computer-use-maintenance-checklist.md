# Computer Use Maintenance Checklist

Use this checklist before claiming a `computer_use` change is complete.

## Capability Closure

- The changed capability still has a clear contract, handler, service, and bridge/runtime path.
- The changed capability can run through the real Windows path when that is relevant, not only through mocks.
- `doc/acceptance/capability-matrix.md` still names the right code anchors and primary tests.

## Host Adapter Closure

- Codex behavior remains aligned with the shared contract.
- Claude Code behavior remains aligned with the shared contract.
- Schema or contract changes are reflected in both adapters.
- Progressive-disclosure metadata still classifies every exposed tool as discovery, action, dialog, or lifecycle.
- Manifest, MCP, marketplace, and skill changes are reflected in README and the installation harness.
- No user name, drive, clone path, cache directory, or installed version is hard-coded.
- Claude Code paths use `${CLAUDE_PLUGIN_ROOT}` or another documented host substitution; Codex paths remain relative to the installed plugin or marketplace root.

## Trace And Lifecycle

- `trace-config`, evidence schema, and artifact writing still work for changed paths.
- `end_turn`, interrupt handling, and stdio lifecycle still reset state correctly.
- Interrupted turns call `resetTurn("interrupted")`.
- Old unfinished turns are reset before a new turn starts.
- Native-host reset disposes the resident host process.
- `get_window_state` still exposes capture degradation and `window.health.hung`.
- Temporary trace or repro artifacts are not left in the repository.

## Verification

Run the smallest checks that prove the change. For standard changes, start with:

```powershell
npm run typecheck
npm test
```

Add focused checks as needed:

```powershell
npm --prefix computer_use run test -- tests/integration/codex-adapter.test.ts
npm --prefix computer_use run test -- tests/integration/claude-code-adapter.test.ts
npm --prefix computer_use run test -- tests/integration/native-host-p5-smoke.test.ts
npm --prefix computer_use run test -- tests/integration/stdio-runtime.test.ts
```

## Long-Term Evidence Gates

- Discovery and launch changes preserve `list_apps`, `list_windows`, `get_window`, and `launch_app` evidence.
- Capture/UIA changes preserve `get_window_state`, UIA element actions, and native-host smoke evidence.
- Non-dialog action changes preserve real `ComputerUse.P5SmokeApp.cs` coverage for `activate_window`, `click`, `click_element`, `press_key`, `type_text`, `scroll`, `set_value`, `drag`, and `perform_secondary_action`.
- Dialog-helper changes preserve `tests/integration/common-dialog-helper.test.ts` coverage for `select_file_in_dialog`, `select_folder_in_dialog`, and `set_save_path_in_dialog`.
- Action changes preserve pointer, keyboard, text, activation, lifecycle, and trace evidence.
- Adapter changes preserve both Codex and Claude Code integration evidence.

## Documentation Boundary

- Human-facing project docs follow `doc/README.md`: architecture in `doc/architecture/`, evidence in `doc/acceptance/`, and test/maintenance methods in `doc/development/`.
- Agent-facing harnesses, checklists, and prompts stay in `.claude/` and `.agents/`.
- Public capability or workflow changes update the plugin skill and both mirrored agent harnesses in the same change.
- Test-strategy changes update `doc/development/testing.md`, both mirrored maintenance checklists, and repository policy tests.
- Temporary investigation notes and one-off phase/scaffold reports are not committed as long-term docs.
