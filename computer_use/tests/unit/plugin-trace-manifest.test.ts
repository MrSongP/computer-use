import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("Codex plugin enables trace with the plugin root as its working directory", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(pluginRoot, ".mcp.json"), "utf8")
  ) as {
    mcpServers: {
      "computer-use": {
        cwd?: string;
        env?: Record<string, string>;
      };
    };
  };
  const server = manifest.mcpServers["computer-use"];

  assert.equal(server.cwd, ".");
  assert.equal(server.env?.COMPUTER_USE_TRACE, "1");
});

test("Claude Code plugin uses the host-provided installation root without fixed user or version paths", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8")
  ) as {
    mcpServers: {
      "computer-use": {
        args?: string[];
        cwd?: string;
        env?: Record<string, string>;
      };
    };
  };
  const server = manifest.mcpServers["computer-use"];

  assert.equal(server.env?.COMPUTER_USE_TRACE, "1");
  assert.equal(server.cwd, "${CLAUDE_PLUGIN_ROOT}");
  assert.deepEqual(server.args, [
    "${CLAUDE_PLUGIN_ROOT}/dist/src/adapters/claude-code/mcp-entrypoint.js"
  ]);
  assert.doesNotMatch(JSON.stringify(server), /(?:[A-Z]:\\|\/Users\/|\/home\/|0\.1\.0)/);
});
