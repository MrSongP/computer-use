# Documentation

This directory contains canonical project documentation for `computer_use`. Each document has one primary responsibility; README files provide short entrypoints and link here instead of duplicating detail.

## Documentation Map

| Area | Document | Responsibility |
| --- | --- | --- |
| Architecture | [Architecture overview](architecture/overview.md) | System context, layers, dependency direction, lifecycle, and repository layout |
| Architecture | [Windows native interface](architecture/windows-native-interface.md) | Stable boundary between shared semantics and Win32/WGC/UIA/input implementation |
| Acceptance | [Capability matrix](acceptance/capability-matrix.md) | Supported public capabilities, implementation anchors, and primary evidence |
| Development | [Testing strategy](development/testing.md) | Test layers, commands, real fixture coverage, and executable policy |
| Development | [Manual plugin testing](development/manual-testing.md) | Representative application testing, evidence, and issue classification |

## Reading Paths

### Users

1. [English README](../README.md) or [简体中文 README](../README.zh-CN.md)
2. [Capability matrix](acceptance/capability-matrix.md) when exact supported tools matter

### Contributors

1. [Repository contract](../AGENTS.md)
2. [Architecture overview](architecture/overview.md)
3. [Testing strategy](development/testing.md)
4. The change-area document required by `AGENTS.md`

### Maintainers And Testers

1. [Capability matrix](acceptance/capability-matrix.md)
2. [Testing strategy](development/testing.md)
3. [Manual plugin testing](development/manual-testing.md)
4. Mirrored agent checklists under `.agents/` and `.claude/`

## Documentation Boundaries

- `README.md` and `README.zh-CN.md` own product introduction, prerequisites, quick installation, and navigation.
- `computer_use/README.md` owns plugin-root packaging, runtime, and trace details.
- `doc/architecture/` owns stable design and implementation boundaries.
- `doc/acceptance/` owns supported behavior and evidence.
- `doc/development/` owns testing and maintenance methods.
- `AGENTS.md` owns repository-wide contributor rules.
- `.agents/` and `.claude/` own mirrored agent maintenance contracts.
- `computer_use/skills/` owns instructions shipped with the installed plugin.

Temporary investigations, trace output, screenshots, generated artifacts, and task-specific reports are not project documentation and must not be committed here.

## Structure Rules

- Prefer links to canonical detail over repeated tables or command blocks.
- Move or rename documents only with all inbound links updated.
- Keep local Markdown links valid; repository contract tests enforce them.
- Keep `.agents/` and `.claude/` mirror documents byte-for-byte synchronized.
- Delete superseded documents instead of leaving stale alternatives.
