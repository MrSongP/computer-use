# Computer Use Installation Harness

This is the agent-facing installation contract for `computer_use`.

## Installation Model

- Plugin root: `computer_use`
- Codex marketplace: `.agents\plugins\marketplace.json`
- Codex manifest: `computer_use\.codex-plugin\plugin.json`
- Claude manifest: `computer_use\.claude-plugin\plugin.json`
- MCP manifest: `computer_use\.mcp.json`
- Skill: `computer_use\skills\computer-use\SKILL.md`
- Recommended commands: `npm run install:codex`, `npm run install:claude`, `npm run install:all`

`.agents\plugins\marketplace.json` must point at `./computer_use`, which is the real plugin root.

## Distribution And Path Portability

This plugin is distributed to unrelated GitHub users. Installation behavior must work for arbitrary Windows account names, drives, clone directories, cache directories, and future versions.

- Codex MCP paths remain relative to the installed plugin root.
- Claude Code MCP paths use `${CLAUDE_PLUGIN_ROOT}`.
- Do not hard-code a local clone path or a version-specific plugin cache path.
- Do not edit installed cache files as source. Reinstall from the repository.
- The packaged plugins enable trace and write to `<plugin-root>/.artifacts/computer-use-trace/` unless `COMPUTER_USE_TRACE_DIR` is set.

## Required Install Behavior

The installer should:

1. Install TypeScript dependencies.
2. Build the TypeScript runtime.
3. Build the C# native host.
4. Run the MCP smoke test.
5. Register the local marketplace.
6. Install the plugin for the target host.
7. Run the relevant doctor check.

Claude Code installs should ensure `mcp__plugin_computer-use_computer-use` is present in the user allowlist when that permission model is in use.

## Native Host Rule

The native host target framework is `net8.0-windows10.0.19041.0`. If the `.csproj` target framework changes, update the TypeScript native-host launch path in `computer_use/src/windows/bridge/native-host-driver.ts`.

## Do Not Restore Old Entrypoints

Do not make the old official compatibility client wrapper the normal path for this project. Codex and Claude Code should load capabilities through this repository's manifests, MCP server, TypeScript contracts, and native-host adapter.

Do not reintroduce PowerShell-only install or doctor scripts as the primary path when the Node installer is the maintained path.

If official-client compatibility is tested in the future, keep it clearly named as a separate compatibility test, not the default plugin entrypoint.

## Verification After Install-Surface Changes

Run or inspect:

```powershell
rg -n "computer-use-client" computer_use\skills computer_use\src
npm run typecheck
node .\scripts\smoke-claude-mcp.mjs
npm run doctor:codex
npm run doctor:claude
```

Also run adapter or integration tests affected by the install-surface change.

To verify a real installed copy instead of the source tree, set `COMPUTER_USE_SMOKE_PLUGIN_ROOT` to the host-reported plugin root before running the smoke script. This is a test input only; never commit one machine's resolved path.

Search for accidental machine-specific paths before completion:

```powershell
rg -n '[A-Za-z]:\\(?:Users|Desktop)\\|plugins[\\/]+cache[\\/]+.*[0-9]+\.[0-9]+\.[0-9]+' computer_use scripts -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/bin/**' -g '!**/obj/**'
```
