import { mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type { TurnMetadata } from "../contracts/rpc.js";
import { turnScopeToKey } from "./interrupt-scope.js";

function sanitizeSegment(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function buildInterruptScopeKey(metadata: TurnMetadata): string {
  return turnScopeToKey(metadata);
}

export function buildInterruptFilePath(codexHome: string, metadata: TurnMetadata): string {
  return path.join(
    codexHome,
    "cache",
    "computer-use",
    "interrupts",
    sanitizeSegment(metadata.session_id),
    sanitizeSegment(metadata.turn_id)
  );
}

export function hasInterruptMarker(codexHome: string, metadata: TurnMetadata): boolean {
  return existsSync(buildInterruptFilePath(codexHome, metadata));
}

export async function writeInterruptMarker(
  codexHome: string,
  metadata: TurnMetadata
): Promise<string> {
  const filePath = buildInterruptFilePath(codexHome, metadata);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "", "utf8");
  return filePath;
}

export async function removeInterruptMarker(
  codexHome: string,
  metadata: TurnMetadata
): Promise<void> {
  await rm(buildInterruptFilePath(codexHome, metadata), { force: true });
}
