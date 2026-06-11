import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const projectPath = path.join(
  repoRoot,
  "computer_use",
  "native-host",
  "ComputerUse.NativeHost",
  "ComputerUse.NativeHost.csproj"
);
const sourceRootPath = path.join(
  repoRoot,
  "computer_use",
  "native-host",
  "ComputerUse.NativeHost"
);
const configuration = process.env.COMPUTER_USE_NATIVE_CONFIGURATION ?? "Release";
const defaultWindowsDotnetPaths = [
  "C:\\Program Files\\dotnet\\dotnet.exe",
  "C:\\Program Files (x86)\\dotnet\\dotnet.exe"
];

async function main() {
  if (process.platform !== "win32") {
    throw new Error("build:native is only supported on Windows.");
  }

  await assertFile(projectPath, "native host project");
  await assertDirectory(sourceRootPath, "native host source directory");

  const dotnet = await resolveDotnetCommand(process.env.COMPUTER_USE_DOTNET_PATH);
  if (!dotnet) {
    throw new Error(
      "Could not find .NET SDK 8+. Install Microsoft.DotNet.SDK.8, add dotnet to PATH, " +
      "or set COMPUTER_USE_DOTNET_PATH to C:\\Program Files\\dotnet\\dotnet.exe."
    );
  }

  await run(dotnet, ["build", projectPath, "-c", configuration, "--nologo"], {
    cwd: path.dirname(projectPath)
  });
  process.stdout.write("Native host built with dotnet.\n");
}

async function resolveDotnetCommand(preferred) {
  const candidates = [preferred, "dotnet", ...(process.platform === "win32" ? defaultWindowsDotnetPaths : [])]
    .filter((candidate) => typeof candidate === "string" && candidate.length > 0);

  for (const candidate of candidates) {
    const resolved = await resolveCommand(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return undefined;
}

async function resolveCommand(command) {
  if (path.isAbsolute(command) || command.includes("\\") || command.includes("/")) {
    return await pathExists(command) ? command : undefined;
  }

  const where = process.platform === "win32" ? "where.exe" : "which";
  const args = [command];
  try {
    await run(where, args, { stdio: "ignore" });
    return command;
  } catch {
    return undefined;
  }
}

async function assertFile(file, label) {
  if (!(await pathExists(file))) {
    throw new Error(`Missing ${label}: ${file}`);
  }
}

async function assertDirectory(directory, label) {
  let fileStat;
  try {
    fileStat = await stat(directory);
  } catch {
    throw new Error(`Missing ${label}: ${directory}`);
  }

  if (!fileStat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${directory}`);
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

async function run(command, args, options = {}) {
  const stdio = options.stdio ?? "inherit";
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio,
      windowsHide: true
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(" ")}`));
    });
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
