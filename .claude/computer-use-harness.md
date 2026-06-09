# Computer Use Agent Harness

This file is the current operating contract for agents using or evaluating the `computer_use` plugin. It describes the plugin as it exists now, the expected capability boundaries, and the quality bar for tool inputs and outputs.

## Purpose

`computer_use` is a local Windows computer-use plugin for agent development. It gives an agent atomic desktop-control capabilities through MCP tools: discover apps and windows, capture window state, inspect accessibility nodes, activate windows, send pointer and keyboard input, complete standard file dialogs, and collect trace evidence for debugging.

The plugin is not an application-specific assistant. It does not teach an agent how to use WeChat, QQ, Word, Blender, a browser, or any other specific app. It provides reliable atoms and clear facts; the agent composes those atoms into a workflow for the current user task.

## Current Project Shape

- Plugin root: `computer_use/`
- Codex manifest: `computer_use/.codex-plugin/plugin.json`
- Claude Code manifest: `computer_use/.claude-plugin/plugin.json`
- MCP server declaration: `computer_use/.mcp.json`
- Main skill: `computer_use/skills/computer-use/SKILL.md`
- Runtime entry: `computer_use/src/index.ts`
- Claude adapter schemas: `computer_use/src/adapters/claude-code/tool-schema.ts`
- Native Windows host: `computer_use/native-host/ComputerUse.NativeHost/`
- Tests: `computer_use/tests/`

The project exposes the same core runtime through Codex and Claude Code adapters. The native Windows host is responsible for Win32, Windows Graphics Capture, UI Automation, input injection, common dialogs, and app/window discovery.

## Architecture Boundaries

- Dependency direction is `adapters -> core -> windows -> native host`.
- `core` owns capability contracts, handlers, dispatch, lifecycle, interrupt handling, runtime context, and trace infrastructure.
- `windows` owns semantic services for discovery, launch, capture, activation, input, UIA, dialogs, and native bridge access.
- `native-host/ComputerUse.NativeHost` owns Win32, WGC, UIA, COM, and low-level input primitives.
- Adapter schemas must stay aligned with shared core contracts. Do not let Codex and Claude Code drift into different tool semantics.
- New capabilities must land with contract, handler, Windows service or bridge support, and verification. Do not create standalone design docs as a substitute for tests.

## Capability Boundary

The plugin provides these categories of capabilities:

- Discovery: `list_apps`, `list_windows`, `get_window`, `launch_app`
- Capture: `get_window_state`
- Window focus: `activate_window`
- Pointer input: `click`, `drag`, `scroll`
- Keyboard/text input: `press_key`, `type_text`
- Accessibility actions: `click_element`, `set_value`, `perform_secondary_action`
- Standard dialog helpers: `select_file_in_dialog`, `select_folder_in_dialog`, `set_save_path_in_dialog`
- Turn/debug lifecycle: `end_turn`, trace metadata through tool calls

The plugin does not provide these things:

- App-specific workflows, recipes, or business logic.
- Final user-intent decisions such as whether a contact, file, dialog, or destination is correct.
- Semantic understanding of arbitrary screenshots beyond the structured facts it returns.
- A guarantee that UIA will work for every app, especially Chromium, Electron, CEF, games, canvas apps, or self-drawn UI.
- High-level waiting operations such as "wait until the screenshot looks right" as a separate product requirement. Repeated observation and stop conditions belong to the agent workflow unless the codebase explicitly adds a low-level primitive with precise semantics.
- Permission to perform external side effects without agent/user-level confirmation when the task requires it.

## Facts vs Agent Judgment

The tool should provide facts:

- What apps and windows are visible or discoverable.
- Which app/window id, title, bounds, visibility, focus, minimized state, and health were observed.
- Whether a launch was attempted, reused, refused, or needs tray/taskbar recovery.
- Whether a capture succeeded, degraded, omitted text, or used a fallback path.
- Screenshot dimensions, coordinate mapping, and clickable region metadata.
- UIA nodes, indexes, roles, names, values, bounds, patterns, and secondary actions when available.
- Whether an input action was dispatched, through which coordinate/window/element plan, and what immediate diagnostics were available.
- Trace artifact paths when trace is enabled.
- Explicit errors, codes, details, and recovery hints when a call fails.

The agent must decide:

- Which app and window satisfy the user request.
- Which UI element or coordinate is intended.
- Whether the current state is safe enough for a click, key press, upload, send, save, delete, or submit action.
- Whether a result proves completion.
- Whether to retry, refresh state, rehydrate a stale window, ask the user, or stop.
- How to compose app-specific workflows from atomic tools.

## Tool Quality Bar

Every tool must meet these expectations.

1. It performs its named atomic operation reliably.
   - `get_window_state` captures the requested window or returns a clear failure.
   - `click` executes the agent-provided coordinate accurately in the intended coordinate space.
   - `press_key` sends the requested key or chord to the intended target window.
   - `select_file_in_dialog` completes only the local standard file dialog, not the app's later upload/send action.

2. It returns explicit status.
   - A meaningful success result is better than `null`.
   - Failures include a code, error/details, and practical next-step guidance when possible.
   - Partial success and degraded capture states are reported explicitly.

3. It keeps the response low-noise and high-signal.
   - Return structured fields over prose.
   - Include enough metadata for the agent to continue without guessing.
   - Put large or optional evidence behind summaries, filters, trace paths, or artifacts.
   - Redact or summarize bulky screenshot bytes in JSON text while still returning image content through the host channel.

4. It preserves coordinate and lifecycle clarity.
   - Window objects must be reusable only when they came from `list_apps`, `list_windows`, `get_window`, or `get_window_state`.
   - `get_window_state` returns the canonical window object to carry forward.
   - Coordinate actions must state whether coordinates were window-relative or screenshot-relative.
   - Stale handles, minimized windows, hung windows, focus failures, and desktop-lock states must be visible to the agent.

5. It does not hide policy decisions.
   - `launch_app` defaults to reuse-or-launch and reports duplicate/tray recovery situations.
   - `force_new` is only for explicit user requests.
   - Dialog helpers do not imply permission to send, upload, publish, or submit after the dialog closes.

## Input Design

Inputs should be strict, predictable, and easy for an agent to construct.

- Use a previously returned `window` object for any window-scoped action.
- Use `id` plus optional `app` only for `get_window` rehydration.
- Use filters on `list_apps` instead of pulling a noisy full process list when the target is known.
- Require coordinates for coordinate tools and element indexes for UIA tools; do not overload one tool with the other's targeting mode.
- Use snake_case parameters matching the local contract, such as `scroll_x`, `scroll_y`, `element_index`, `include_screenshot`, and `include_text`.
- Reject unknown keys so documentation drift is caught early.
- Keep text input literal in `type_text`; use `press_key` for control keys and chords.

## Output Design

Outputs should let the agent answer four questions without guessing:

1. Did the tool do what it was asked to do?
2. What facts changed or were observed?
3. Is the returned state canonical enough for the next call?
4. If not, what exact recovery path is available?

Recommended output shape:

- `ok` or an equivalent unambiguous success/failure indicator at the adapter boundary.
- `code` for known failure classes.
- `result` object on success, never an unexplained `null` for meaningful operations.
- `diagnostics` for truncation, filters, fallback drivers, timeout reasons, and schema/runtime metadata.
- `window` for canonical target references after capture or rehydration.
- `capture` for screenshot/text availability, degraded reasons, omitted text, and recommended fallbacks.
- `trace` only for debug evidence, with absolute paths when trace is enabled.
- `followUpActions` or guidance when the next safe step is known.

## Current Tool Expectations

| Tool | Input expectation | Output expectation |
| --- | --- | --- |
| `list_apps` | Optional filters: `name_contains`, `id_contains`, `id_includes`, `running_only`, `has_windows`, `limit` | App identities, running state, windows, diagnostics, runtime metadata |
| `list_windows` | Empty object | Targetable top-level windows |
| `get_window` | `id`, optional `app` | Current canonical window or explicit stale/missing error |
| `launch_app` | `app`, optional `launch_mode`, optional `observe_timeout_ms` | Launch/reuse/refusal report, observed windows, recovery guidance |
| `get_window_state` | `window`, optional screenshot/text/filter settings | Screenshot/image content, structured UIA nodes, canonical `window`, capture diagnostics |
| `activate_window` | `window` | Focus/restoration report with foreground evidence |
| `click` | `window`, `x`, `y`, optional coordinate/button fields | Pointer dispatch report, hit/coordinate diagnostics, activation evidence |
| `drag` | `window`, start/end coordinates, optional button/duration/steps | Drag dispatch report and diagnostics |
| `scroll` | `window`, `x`, `y`, `scroll_x` or `scroll_y` | Wheel dispatch report and diagnostics |
| `press_key` | `window`, `key` | Key dispatch report and activation evidence |
| `type_text` | `window`, literal `text` | Text dispatch report and activation evidence |
| `click_element` | `window`, `element_index` from latest text snapshot | UIA primary action report |
| `set_value` | `window`, `element_index`, `value` | UIA ValuePattern report |
| `perform_secondary_action` | `window`, `element_index`, `action` | Named UIA secondary action report |
| `select_file_in_dialog` | Dialog `window`, local file `path` | Dialog completion report; no upload/send implication |
| `select_folder_in_dialog` | Dialog `window`, local folder `path` | Dialog completion report; no publish implication |
| `set_save_path_in_dialog` | Dialog `window`, save `path` | Dialog completion report; no external publish implication |
| `end_turn` | Empty object | Lifecycle state flushed |

## Action Lane Semantics

- Coordinate actions use window-relative coordinates by default.
- `click` accepts coordinates only. Use `click_element` for indexed accessibility actions.
- `scroll` uses `scroll_x` and `scroll_y`.
- Element actions use `element_index` from the latest `get_window_state({ include_text: true })` result.
- `get_window_state` returns structured `text` nodes, not a preformatted tree string.
- A successful action result proves only the dispatch facts the tool can directly observe: activation plan, coordinate resolution, input event dispatch, UIA pattern invocation, or local dialog closure.
- A successful action result does not prove an app-level business result such as message sent, file uploaded, page scrolled to the intended content, or modal accepted. Verify those with a fresh state capture or other evidence.
- Trace can return lightweight state-diff summaries, while full before/after evidence should stay in trace artifacts to keep normal responses compact.

## Trace

Trace is a debugging and evidence tool. It is useful for reproducing tool behavior, inspecting screenshots, checking raw JSON, and reviewing action plans. Trace is not the normal way for an agent to understand the UI when direct image content and structured text are already returned.

Trace output should answer: what input was sent, what window was targeted, what capture or action plan was used, what native host returned, and what artifact paths prove it.

## Agent Workflow Contract

Agents using this plugin should follow this loop:

1. Discover the app/window with `list_apps` or `list_windows`.
2. Rehydrate or select a canonical window with `get_window` when needed.
3. Capture with `get_window_state` only as often as needed for the next decision.
4. Choose the next atomic action from the returned facts.
5. Execute batched input when the target is stable.
6. Capture again to verify progress or completion.
7. Stop on explicit failure, locked desktop, stale state that cannot be recovered, unsafe side effects, or ambiguous destination.

The agent may use shell, filesystem, tests, logs, and other host tools for non-UI work. The plugin owns Windows UI automation; it should not replace faster or more reliable non-UI inspection.
