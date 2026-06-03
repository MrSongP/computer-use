import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface TraceArtifactReference {
  kind: string;
  fileName: string;
  relativePath: string;
  mimeType: string;
}

export interface TraceActionLocation {
  sessionId: string;
  turnId: string;
  actionId: string;
  actionDir: string;
  relativeActionDir: string;
}

export class TraceArtifactWriter {
  constructor(private readonly rootDir: string) {}

  async createActionLocation(scope: {
    sessionId: string;
    turnId: string;
    actionId: string;
  }): Promise<TraceActionLocation> {
    const sessionId = sanitizePathSegment(scope.sessionId);
    const turnId = sanitizePathSegment(scope.turnId);
    const actionId = sanitizePathSegment(scope.actionId);
    const relativeActionDir = path.join(sessionId, turnId, actionId);
    const actionDir = path.join(this.rootDir, relativeActionDir);
    await mkdir(actionDir, { recursive: true });

    return {
      sessionId,
      turnId,
      actionId,
      actionDir,
      relativeActionDir
    };
  }

  async writeJson(
    location: TraceActionLocation,
    kind: string,
    fileName: string,
    payload: unknown
  ): Promise<TraceArtifactReference> {
    return this.writeArtifact(
      location,
      kind,
      ensureJsonExtension(fileName),
      Buffer.from(JSON.stringify(payload, null, 2), "utf8"),
      "application/json"
    );
  }

  async writeText(
    location: TraceActionLocation,
    kind: string,
    fileName: string,
    payload: string
  ): Promise<TraceArtifactReference> {
    return this.writeArtifact(
      location,
      kind,
      fileName,
      Buffer.from(payload, "utf8"),
      "text/plain"
    );
  }

  async writeBinary(
    location: TraceActionLocation,
    kind: string,
    fileName: string,
    payload: Uint8Array,
    mimeType: string
  ): Promise<TraceArtifactReference> {
    return this.writeArtifact(location, kind, fileName, payload, mimeType);
  }

  private async writeArtifact(
    location: TraceActionLocation,
    kind: string,
    fileName: string,
    payload: Uint8Array,
    mimeType: string
  ): Promise<TraceArtifactReference> {
    const normalizedFileName = sanitizeFileName(fileName);
    const absolutePath = path.join(location.actionDir, normalizedFileName);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, payload);

    return {
      kind,
      fileName: normalizedFileName,
      relativePath: path.join(location.relativeActionDir, normalizedFileName),
      mimeType
    };
  }
}

function sanitizePathSegment(value: string): string {
  const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");
  return normalized.length > 0 ? normalized : "unknown";
}

function sanitizeFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");
  return normalized.length > 0 ? normalized : "artifact.bin";
}

function ensureJsonExtension(fileName: string): string {
  return fileName.endsWith(".json") ? fileName : `${fileName}.json`;
}
