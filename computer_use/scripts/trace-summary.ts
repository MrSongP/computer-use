import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { getDefaultTraceOutputDir } from "../src/core/trace/trace-config.js";
import type { ActionTraceEvidence } from "../src/core/trace/tracer.js";
import { summarizeTraceEvidence } from "../src/core/trace/trace-summary.js";

const targetDir = path.resolve(process.argv[2] ?? getDefaultTraceOutputDir(process.cwd()));
const evidence = await readTraceEvidence(targetDir);
const summary = summarizeTraceEvidence(evidence);

process.stdout.write(`${JSON.stringify({
  traceDir: targetDir,
  totalActions: evidence.length,
  ...summary
}, null, 2)}\n`);

async function readTraceEvidence(traceDir: string): Promise<ActionTraceEvidence[]> {
  const evidenceFiles = await collectEvidenceFiles(traceDir);
  const evidence = await Promise.all(
    evidenceFiles.map(async (filePath) => JSON.parse(await readFile(filePath, "utf8")) as ActionTraceEvidence)
  );
  return evidence;
}

async function collectEvidenceFiles(rootDir: string): Promise<string[]> {
  const directories = [rootDir];
  const files: string[] = [];

  while (directories.length > 0) {
    const currentDir = directories.pop()!;
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        directories.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name === "evidence.json") {
        files.push(fullPath);
      }
    }
  }

  files.sort((left, right) => left.localeCompare(right));
  return files;
}
