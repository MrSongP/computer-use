import { spawn } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
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
const sourcePath = path.join(
  repoRoot,
  "computer_use",
  "native-host",
  "ComputerUse.NativeHost",
  "Program.cs"
);
const configuration = process.env.COMPUTER_USE_NATIVE_CONFIGURATION ?? "Release";
const framework64Dir = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319";
const framework32Dir = "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319";
const framework64WpfDir = path.join(framework64Dir, "WPF");
const framework32WpfDir = path.join(framework32Dir, "WPF");
const windowsKitsUnionMetadataDir = "C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata";

async function main() {
  if (process.platform !== "win32") {
    throw new Error("build:native is only supported on Windows.");
  }

  await assertFile(projectPath, "native host project");
  await assertFile(sourcePath, "native host source");

  const dotnet = await resolveCommand(process.env.COMPUTER_USE_DOTNET_PATH ?? "dotnet");
  if (dotnet) {
    await run(dotnet, ["build", projectPath, "-c", configuration, "--nologo"], {
      cwd: path.dirname(projectPath)
    });
    process.stdout.write("Native host built with dotnet.\n");
    return;
  }

  const csc = await resolveFirstExistingPath([
    process.env.COMPUTER_USE_CSC_PATH,
    path.join(framework64Dir, "csc.exe"),
    path.join(framework32Dir, "csc.exe")
  ]);
  if (!csc) {
    throw new Error(
      "Could not find dotnet or .NET Framework csc.exe. Install .NET SDK 8+ for the preferred path, " +
      "or enable .NET Framework developer tools for the fallback csc.exe path."
    );
  }

  const outputPath = path.join(path.dirname(projectPath), "bin", configuration, "ComputerUse.NativeHost.exe");
  await mkdir(path.dirname(outputPath), { recursive: true });
  const references = await resolveCscReferences();

  await run(
    csc,
    [
      "/nologo",
      "/target:exe",
      `/out:${outputPath}`,
      "/r:System.Web.Extensions.dll",
      "/r:System.Drawing.dll",
      ...references.map((reference) => `/r:${reference}`),
      sourcePath
    ],
    {
      cwd: path.dirname(projectPath)
    }
  );
  process.stdout.write(`Native host built with csc.exe: ${outputPath}\n`);
}

async function resolveCscReferences() {
  const windowsWinMd = await resolveWindowsWinMd();
  const frameworkCandidates = [
    { frameworkDir: framework64Dir, wpfDir: framework64WpfDir },
    { frameworkDir: framework32Dir, wpfDir: framework32WpfDir }
  ];

  for (const candidate of frameworkCandidates) {
    const references = [
      path.join(candidate.frameworkDir, "System.Runtime.dll"),
      path.join(candidate.frameworkDir, "System.Runtime.InteropServices.WindowsRuntime.dll"),
      path.join(candidate.frameworkDir, "System.Runtime.WindowsRuntime.dll"),
      path.join(candidate.wpfDir, "UIAutomationClient.dll"),
      path.join(candidate.wpfDir, "UIAutomationTypes.dll"),
      path.join(candidate.wpfDir, "WindowsBase.dll"),
      windowsWinMd
    ].filter(Boolean);

    if (await allFilesExist(references)) {
      return references;
    }
  }

  throw new Error("Could not resolve .NET Framework WPF/UIAutomation references for native host csc build.");
}

async function resolveWindowsWinMd() {
  const candidates = [
    process.env.COMPUTER_USE_WINDOWS_WINMD_PATH,
    ...(await discoverWindowsWinMdCandidates()),
    path.join(windowsKitsUnionMetadataDir, "Facade", "Windows.WinMD")
  ].filter(Boolean);

  const resolved = await resolveFirstExistingPath(candidates);
  if (!resolved) {
    throw new Error(
      "Could not find Windows.winmd. Install the Windows 10/11 SDK, or set COMPUTER_USE_WINDOWS_WINMD_PATH " +
      "to the installed Windows.winmd path such as C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata\\<version>\\Windows.winmd."
    );
  }

  return resolved;
}

async function discoverWindowsWinMdCandidates() {
  try {
    const entries = await readdir(windowsKitsUnionMetadataDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(entry.name))
      .map((entry) => path.join(windowsKitsUnionMetadataDir, entry.name, "Windows.winmd"))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

async function resolveCommand(command) {
  if (!command) {
    return undefined;
  }

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

async function resolveFirstExistingPath(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

async function allFilesExist(files) {
  for (const file of files) {
    if (!(await pathExists(file))) {
      return false;
    }
  }

  return true;
}

async function assertFile(file, label) {
  if (!(await pathExists(file))) {
    throw new Error(`Missing ${label}: ${file}`);
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
