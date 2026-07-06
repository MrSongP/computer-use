# Manual Plugin Testing

This guide owns representative real-application testing and issue classification. It replaces the former Claude-specific test-agent prompt with a host-neutral process.

## Goal

Use `computer_use` on realistic, safe Windows tasks to determine whether the plugin provides the atomic facts and controls needed by an agent.

The goal is not to judge whether a particular application is pleasant to automate. Separate shared plugin defects from application-specific behavior and agent workflow mistakes.

## Scope

Exercise the currently supported discovery, action, dialog, lifecycle, and trace capabilities listed in the [capability matrix](../acceptance/capability-matrix.md). Action coverage includes state observation with `get_window_state`, activation, pointer, keyboard, text, and UIA controls.

Do not demand:

- app-specific workflows from the shared plugin;
- vague high-level waiting without precise input/output/timeout semantics;
- semantic screenshot understanding from a low-level tool;
- external side effects that were not authorized and verified.

## Method

1. Read the relevant agent harness and installed skill.
2. Verify tool availability with a lightweight discovery call.
3. Choose a concrete, reversible application task.
4. Use plugin tools for Windows UI actions.
5. Use shell, filesystem, tests, or logs only for non-UI facts.
6. Capture state before and after important actions.
7. Stop before irreversible or external effects unless explicitly authorized.
8. Classify findings before proposing product changes.

## Evidence

For each finding, record:

- task goal;
- application and window;
- tool calls involved;
- expected and actual behavior;
- returned fields, screenshots, trace paths, errors, or a reproducible sequence;
- classification;
- requirement and acceptance test only when the plugin should change.

## Classification

### Shared Plugin Defect

Examples:

- success or failure is ambiguous;
- coordinate spaces are unclear;
- stale/minimized/focus failures lack recovery data;
- UIA timeout, truncation, or omission is hidden;
- unknown input is silently ignored;
- enabled trace lacks expected evidence;
- a dialog helper crosses its stated local-dialog boundary.

### Agent Workflow Defect

Examples:

- acting on stale coordinates;
- failing to inspect returned diagnostics;
- guessing a window or destination;
- treating dispatch success as application-level completion;
- skipping a required confirmation.

### Application-Specific Limitation

Examples:

- a Chromium or canvas surface exposes little UIA;
- a graphics application requires coordinate interaction;
- layout changes invalidate a prior screenshot;
- a custom modal requires visual interpretation.

Application-specific limitations may justify a test scenario or usage note. They do not automatically justify a new shared capability.

## Requirement Quality

A product requirement should include:

- problem statement;
- affected capability and layer;
- proposed input/output behavior;
- failure semantics;
- acceptance test;
- why the behavior belongs in the plugin instead of agent workflow.

Avoid requirements such as “understand this app,” “wait until it works,” or “click the right thing automatically.”

## Stop Conditions

Stop and report the blocker when:

- tools are unavailable;
- the desktop is locked;
- the target cannot be discovered or recovered;
- the native host fails without a recovery path;
- the next step would create an unauthorized side effect;
- continuing requires guessing intent or destination.

## Report Shape

Use:

1. summary and task context;
2. shared plugin findings;
3. application-specific findings;
4. workflow mistakes or non-issues;
5. open questions;
6. ship/no-ship or next-test recommendation.
