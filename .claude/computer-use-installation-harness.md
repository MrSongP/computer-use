# Computer Use Installation Harness

This is the agent-facing installation contract for `computer_use`.

## Installation Model

- Plugin root: `D:\Desktop\computer-use\computer_use`
- Codex marketplace: `D:\Desktop\computer-use\.agents\plugins\marketplace.json`
- Codex manifest: `computer_use\.codex-plugin\plugin.json`
- Claude manifest: `computer_use\.claude-plugin\plugin.json`
- MCP manifest: `computer_use\.mcp.json`
- Skill: `computer_use\skills\computer-use\SKILL.md`
- Recommended commands: `npm run install:codex`, `npm run install:claude`, `npm run install:all`

`.agents\plugins\marketplace.json` must point at `./computer_use`, which is the real plugin root.

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
