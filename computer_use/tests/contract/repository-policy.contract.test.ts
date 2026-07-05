import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScaffoldRuntime } from "../../src/index.js";
import { createClaudeAdapter } from "../../src/adapters/claude-code/index.js";
import { createCodexAdapter } from "../../src/adapters/codex/index.js";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repositoryRoot = path.dirname(pluginRoot);
const dialogActions = new Set([
  "select_file_in_dialog",
  "select_folder_in_dialog",
  "set_save_path_in_dialog"
]);

test("agent-facing mirror documents stay byte-for-byte synchronized", async () => {
  for (const name of [
    "computer-use-harness.md",
    "computer-use-installation-harness.md",
    "computer-use-maintenance-checklist.md"
  ]) {
    const agentsCopy = await readRepositoryFile(".agents", name);
    const claudeCopy = await readRepositoryFile(".claude", name);
    assert.equal(claudeCopy, agentsCopy, `${name} drifted between .agents and .claude`);
  }
});

test("every registered capability remains documented on all public surfaces", async () => {
  const methods = createScaffoldRuntime().capabilities.list().map((capability) => capability.method).sort();
  const documents = await Promise.all([
    readRepositoryFile("README.md"),
    readRepositoryFile("README.zh-CN.md"),
    readRepositoryFile("doc", "computer-use.md"),
    readRepositoryFile("doc", "acceptance", "capability-matrix.md"),
    readRepositoryFile(".agents", "computer-use-harness.md"),
    readRepositoryFile(".claude", "computer-use-harness.md"),
    readPluginFile("README.md"),
    readPluginFile("skills", "computer-use", "SKILL.md")
  ]);

  for (const method of methods) {
    for (const [index, document] of documents.entries()) {
      assert.ok(document.includes(`\`${method}\``), `${method} missing from document ${index + 1}`);
    }
  }
});

test("agent maintenance contracts retain the real-action and dialog coverage gates", async () => {
  const harness = await readRepositoryFile(".agents", "computer-use-harness.md");
  const checklist = await readRepositoryFile(".agents", "computer-use-maintenance-checklist.md");

  for (const document of [harness, checklist]) {
    assert.ok(document.includes("ComputerUse.P5SmokeApp.cs"));
    assert.ok(document.includes("tests/integration/native-host-p5-smoke.test.ts") ||
      document.includes("tests/integration/native-host-p5-smoke.test.ts".replaceAll("/", "\\")) ||
      document.includes("native-host-p5-smoke.test.ts"));
    assert.ok(document.includes("tests/integration/common-dialog-helper.test.ts") ||
      document.includes("common-dialog-helper.test.ts"));
  }
});

test("Codex and Claude Code expose the same shared capability surface", () => {
  const scaffold = createScaffoldRuntime();
  const codex = createCodexAdapter(scaffold.runtime, scaffold.dispatcher, scaffold.capabilities);
  const claude = createClaudeAdapter(scaffold.runtime, scaffold.dispatcher, scaffold.capabilities);

  assert.deepEqual(
    codex.capabilities.map((capability) => capability.name).sort(),
    claude.capabilities.map((capability) => capability.name).sort()
  );
});

test("the real Windows smoke app covers every non-dialog action capability", async () => {
  const methods = createScaffoldRuntime().capabilities
    .list()
    .map((capability) => capability.method)
    .filter((method) => capabilityIsAction(method) && !dialogActions.has(method))
    .sort();
  const smokeTest = await readPluginFile("tests", "integration", "native-host-p5-smoke.test.ts");
  const covered = [...smokeTest.matchAll(/verifiedActions\.add\("([^"]+)"\)/g)]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(covered, methods);
});

test("dialog action helpers keep dedicated integration coverage", async () => {
  const dialogTest = await readPluginFile("tests", "integration", "common-dialog-helper.test.ts");
  for (const method of dialogActions) {
    assert.ok(dialogTest.includes(`"${method}"`), `${method} lacks a dedicated integration test`);
  }
});

test("plugin startup metadata stays portable across users, drives, caches, and versions", async () => {
  const codexManifest = JSON.parse(await readPluginFile(".mcp.json")) as {
    mcpServers: { "computer-use": { cwd: string; args: string[] } };
  };
  const claudeManifest = JSON.parse(await readPluginFile(".claude-plugin", "plugin.json")) as {
    mcpServers: { "computer-use": { cwd: string; args: string[] } };
  };
  const marketplace = JSON.parse(await readRepositoryFile(".agents", "plugins", "marketplace.json")) as {
    plugins: Array<{ source: { path: string } }>;
  };
  const serialized = JSON.stringify({ codexManifest, claudeManifest, marketplace });

  assert.equal(codexManifest.mcpServers["computer-use"].cwd, ".");
  assert.ok(codexManifest.mcpServers["computer-use"].args.every((value) => value.startsWith("./")));
  assert.equal(claudeManifest.mcpServers["computer-use"].cwd, "${CLAUDE_PLUGIN_ROOT}");
  assert.ok(
    claudeManifest.mcpServers["computer-use"].args.every((value) => value.startsWith("${CLAUDE_PLUGIN_ROOT}/"))
  );
  assert.ok(marketplace.plugins.every((plugin) => plugin.source.path.startsWith("./")));
  assert.doesNotMatch(serialized, /(?:[A-Z]:\\Users\\|\/Users\/[^/]+|\/home\/[^/]+|plugins[\\/]cache[\\/][^\\/]+[\\/]\d)/i);
});

test("package and host build contracts stay version and target-framework aligned", async () => {
  const rootPackage = JSON.parse(await readRepositoryFile("package.json")) as {
    version: string;
    engines: { node: string };
  };
  const pluginPackage = JSON.parse(await readPluginFile("package.json")) as {
    version: string;
    engines: { node: string };
  };
  const codexManifest = JSON.parse(await readPluginFile(".codex-plugin", "plugin.json")) as { version: string };
  const claudeManifest = JSON.parse(await readPluginFile(".claude-plugin", "plugin.json")) as { version: string };
  const project = await readPluginFile(
    "native-host",
    "ComputerUse.NativeHost",
    "ComputerUse.NativeHost.csproj"
  );
  const driver = await readPluginFile("src", "windows", "bridge", "native-host-driver.ts");
  const smoke = await readPluginFile("tests", "integration", "native-host-p5-smoke.test.ts");
  const targetFramework = requireMatch(project, /<TargetFramework>([^<]+)<\/TargetFramework>/, "C# target framework");

  assert.deepEqual(
    [pluginPackage.version, codexManifest.version, claudeManifest.version],
    [rootPackage.version, rootPackage.version, rootPackage.version]
  );
  assert.equal(pluginPackage.engines.node, rootPackage.engines.node);
  assert.ok(Number(rootPackage.engines.node.match(/\d+/)?.[0]) >= 20);
  assert.equal(
    requireMatch(driver, /NATIVE_HOST_TARGET_FRAMEWORK\s*=\s*"([^"]+)"/, "driver target framework"),
    targetFramework
  );
  assert.equal(
    requireMatch(smoke, /NATIVE_HOST_TARGET_FRAMEWORK\s*=\s*"([^"]+)"/, "smoke target framework"),
    targetFramework
  );
});

function capabilityIsAction(method: string): boolean {
  return ![
    "list_apps",
    "list_windows",
    "get_window",
    "launch_app",
    "get_window_state"
  ].includes(method);
}

function readRepositoryFile(...segments: string[]): Promise<string> {
  return readFile(path.join(repositoryRoot, ...segments), "utf8");
}

function readPluginFile(...segments: string[]): Promise<string> {
  return readFile(path.join(pluginRoot, ...segments), "utf8");
}

function requireMatch(value: string, pattern: RegExp, description: string): string {
  const match = value.match(pattern);
  assert.ok(match?.[1], `missing ${description}`);
  return match[1];
}
