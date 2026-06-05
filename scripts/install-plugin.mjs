import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const pluginRoot = path.join(repoRoot, "computer_use");
const pluginSelector = "computer-use@computer-use-local";
const claudePermissionRule = "mcp__plugin_computer-use_computer-use";
const npmCommand = "npm";

const [command, target, ...rawArgs] = process.argv.slice(2);
const flags = parseFlags(rawArgs);

async function main() {
  if (!["install", "doctor"].includes(command ?? "")) {
    usage();
    process.exitCode = 1;
    return;
  }
  if (!["codex", "claude"].includes(target ?? "")) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (command === "install") {
    await install(target);
    return;
  }

  await doctor(target);
}

async function install(targetName) {
  await requireCommands(["node", "npm", targetName === "codex" ? "codex" : "claude"]);
  await assertRequiredFiles();

  if (!flags.skipBuild) {
    step("Installing TypeScript dependencies");
    await run(npmCommand, ["--prefix", pluginRoot, "install"]);

    step("Building TypeScript runtime");
    await run(npmCommand, ["--prefix", pluginRoot, "run", "build"]);
  }

  if (!flags.skipNative) {
    step("Building Windows native host");
    await run(process.execPath, [path.join(repoRoot, "scripts", "build-native-host.mjs")]);
  }

  if (targetName === "claude") {
    await installClaude();
  } else {
    await installCodex();
  }

  if (!flags.skipDoctor) {
    await doctor(targetName);
  }
}

async function installCodex() {
  step("Running MCP smoke test");
  await run(process.execPath, [path.join(repoRoot, "scripts", "smoke-claude-mcp.mjs")]);

  step("Registering Codex marketplace");
  await run("codex", ["plugin", "marketplace", "add", repoRoot]);

  if (await isCodexPluginInstalled()) {
    step("Refreshing existing Codex plugin install");
    await run("codex", ["plugin", "remove", pluginSelector]);
  }

  step("Installing Codex plugin");
  await run("codex", ["plugin", "add", pluginSelector]);
  process.stdout.write("\nCodex install finished. Start a new Codex thread/session if the plugin was not already loaded.\n");
}

async function installClaude() {
  const scope = flags.scope ?? "user";
  let settingsBackupPath;
  let settingsUpdated = false;
  const pluginWasInstalled = await isClaudePluginInstalled();

  try {
    step("Validating Claude marketplace and plugin manifests");
    await run("claude", ["plugin", "validate", repoRoot]);
    await run("claude", ["plugin", "validate", pluginRoot]);

    step("Running MCP smoke test");
    await run(process.execPath, [path.join(repoRoot, "scripts", "smoke-claude-mcp.mjs")]);

    step("Preflighting Claude user settings");
    settingsBackupPath = await backupClaudeSettings();
    await readClaudeSettings();

    step("Registering Claude marketplace");
    await run("claude", ["plugin", "marketplace", "add", repoRoot]);

    if (pluginWasInstalled) {
      step("Refreshing existing Claude plugin install");
      await run("claude", ["plugin", "uninstall", pluginSelector, "--scope", scope, "--keep-data"]);
    }

    step("Installing Claude plugin");
    await run("claude", ["plugin", "install", pluginSelector, "--scope", scope]);

    step("Updating Claude user permission allowlist");
    await addClaudePermissionRule();
    settingsUpdated = true;
  } catch (error) {
    warn(`Claude Code install failed: ${error instanceof Error ? error.message : String(error)}`);
    step("Rolling back Claude install state");

    if (settingsUpdated && settingsBackupPath) {
      await copyFile(settingsBackupPath, getClaudeSettingsPath()).catch(() => undefined);
    }

    const pluginIsInstalledNow = await isClaudePluginInstalled();
    if (pluginWasInstalled && !pluginIsInstalledNow) {
      await run("claude", ["plugin", "install", pluginSelector, "--scope", scope]).catch(() => undefined);
    } else if (!pluginWasInstalled && pluginIsInstalledNow) {
      await run("claude", ["plugin", "uninstall", pluginSelector, "--scope", scope, "--keep-data"]).catch(() => undefined);
    }

    throw error;
  } finally {
    if (settingsBackupPath) {
      await rm(settingsBackupPath, { force: true }).catch(() => undefined);
    }
  }

  process.stdout.write(
    `\nClaude Code install finished. User settings updated: ${getClaudeSettingsPath()}\n` +
    "Run /reload-plugins in the current Claude Code session, or start a new session.\n"
  );
}

async function doctor(targetName) {
  await requireCommands(["node", targetName === "codex" ? "codex" : "claude"]);

  step("Checking built runtime entrypoint");
  await assertFile(path.join(pluginRoot, "dist", "src", "adapters", "claude-code", "mcp-entrypoint.js"));

  step("Running MCP smoke test");
  await run(process.execPath, [path.join(repoRoot, "scripts", "smoke-claude-mcp.mjs")]);

  if (targetName === "claude") {
    step("Validating Claude marketplace and plugin manifests");
    await run("claude", ["plugin", "validate", repoRoot]);
    await run("claude", ["plugin", "validate", pluginRoot]);

    step("Checking Claude user permission allowlist");
    const settings = await readClaudeSettings();
    const allowRules = Array.isArray(settings.permissions?.allow)
      ? settings.permissions.allow.map(String)
      : [];
    if (!allowRules.includes(claudePermissionRule)) {
      throw new Error(`Claude user settings do not allow ${claudePermissionRule}.`);
    }

    step("Checking Claude marketplace registration");
    const marketplaces = await runCapture("claude", ["plugin", "marketplace", "list"]);
    assertMatch(marketplaces, /computer-use-local/, "Claude marketplace computer-use-local is not registered.");

    step("Checking Claude plugin install state");
    if (!(await isClaudePluginInstalled())) {
      throw new Error(`Claude plugin ${pluginSelector} is not installed.`);
    }
  } else {
    step("Checking Codex marketplace registration");
    const marketplaces = await runCapture("codex", ["plugin", "marketplace", "list"]);
    assertMatch(marketplaces, /computer-use-local/, "Codex marketplace computer-use-local is not registered.");

    step("Checking Codex plugin install state");
    if (!(await isCodexPluginInstalled())) {
      throw new Error(`Codex plugin ${pluginSelector} is not installed.`);
    }
  }

  process.stdout.write("\nDoctor passed.\n");
}

async function assertRequiredFiles() {
  await Promise.all([
    assertFile(path.join(repoRoot, ".claude-plugin", "marketplace.json")),
    assertFile(path.join(repoRoot, ".agents", "plugins", "marketplace.json")),
    assertFile(path.join(pluginRoot, ".claude-plugin", "plugin.json")),
    assertFile(path.join(pluginRoot, ".codex-plugin", "plugin.json")),
    assertFile(path.join(pluginRoot, ".mcp.json"))
  ]);
}

async function requireCommands(commands) {
  for (const name of commands) {
    if (!(await commandExists(name))) {
      throw new Error(`Required command not found in PATH: ${name}`);
    }
  }
}

async function commandExists(name) {
  try {
    await run(process.platform === "win32" ? "where.exe" : "which", [name], {
      stdio: "ignore"
    });
    return true;
  } catch {
    return false;
  }
}

async function isCodexPluginInstalled() {
  try {
    const output = await runCapture("codex", ["plugin", "list", "--marketplace", "computer-use-local"]);
    return /computer-use@computer-use-local\s+installed/.test(output);
  } catch {
    return false;
  }
}

async function isClaudePluginInstalled() {
  try {
    await runCapture("claude", ["plugin", "details", pluginSelector]);
    return true;
  } catch {
    return false;
  }
}

function getClaudeSettingsPath() {
  return path.join(os.homedir(), ".claude", "settings.json");
}

async function readClaudeSettings() {
  const settingsPath = getClaudeSettingsPath();
  if (!(await pathExists(settingsPath))) {
    return {};
  }

  try {
    return JSON.parse(await readFile(settingsPath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse Claude user settings JSON at ${settingsPath}. ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writeClaudeSettings(value) {
  const settingsPath = getClaudeSettingsPath();
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function backupClaudeSettings() {
  const settingsPath = getClaudeSettingsPath();
  if (!(await pathExists(settingsPath))) {
    return undefined;
  }

  const backupPath = `${settingsPath}.computer-use-backup-${timestamp()}`;
  await copyFile(settingsPath, backupPath);
  return backupPath;
}

async function addClaudePermissionRule() {
  const settings = await readClaudeSettings();
  settings.permissions ??= {};
  const allowRules = Array.isArray(settings.permissions.allow)
    ? settings.permissions.allow.map(String)
    : [];

  if (!allowRules.includes(claudePermissionRule)) {
    allowRules.push(claudePermissionRule);
  }

  settings.permissions.allow = allowRules;
  await writeClaudeSettings(settings);
}

async function assertFile(file) {
  if (!(await pathExists(file))) {
    throw new Error(`Required file is missing: ${file}`);
  }
}

async function pathExists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function assertMatch(content, pattern, message) {
  if (!pattern.test(content)) {
    throw new Error(message);
  }
}

async function run(commandName, args, options = {}) {
  const spawnSpec = createSpawnSpec(commandName, args);
  await new Promise((resolve, reject) => {
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit",
      windowsHide: true
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed with exit code ${code}: ${commandName} ${args.join(" ")}`));
    });
  });
}

async function runCapture(commandName, args) {
  const spawnSpec = createSpawnSpec(commandName, args);
  return await new Promise((resolve, reject) => {
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`Command failed with exit code ${code}: ${commandName} ${args.join(" ")}\n${stderr}`.trim()));
    });
  });
}

function createSpawnSpec(commandName, args) {
  if (process.platform !== "win32") {
    return { command: commandName, args };
  }

  if (isDirectWindowsExecutable(commandName)) {
    return { command: commandName, args };
  }

  const commandLine = [commandName, ...args].map(quoteCmdArg).join(" ");
  return {
    command: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", commandLine]
  };
}

function isDirectWindowsExecutable(commandName) {
  const normalized = commandName.toLowerCase();
  return normalized.endsWith(".exe") || path.isAbsolute(commandName);
}

function quoteCmdArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./\\:=@+-]+$/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function parseFlags(args) {
  const parsed = {
    scope: "user",
    skipBuild: false,
    skipDoctor: false,
    skipNative: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--skip-build") {
      parsed.skipBuild = true;
    } else if (arg === "--skip-doctor") {
      parsed.skipDoctor = true;
    } else if (arg === "--skip-native") {
      parsed.skipNative = true;
    } else if (arg === "--scope") {
      parsed.scope = args[index + 1] ?? "user";
      index += 1;
    } else if (arg?.startsWith("--scope=")) {
      parsed.scope = arg.slice("--scope=".length);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!["user", "project", "local"].includes(parsed.scope)) {
    throw new Error("--scope must be one of: user, project, local");
  }

  return parsed;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function step(message) {
  process.stdout.write(`==> ${message}\n`);
}

function warn(message) {
  process.stderr.write(`WARNING: ${message}\n`);
}

function usage() {
  process.stderr.write(
    [
      "Usage:",
      "  node scripts/install-plugin.mjs install codex [--skip-build] [--skip-native] [--skip-doctor]",
      "  node scripts/install-plugin.mjs install claude [--scope user|project|local] [--skip-build] [--skip-native] [--skip-doctor]",
      "  node scripts/install-plugin.mjs doctor codex",
      "  node scripts/install-plugin.mjs doctor claude"
    ].join("\n") + "\n"
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
