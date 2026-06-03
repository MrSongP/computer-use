import path from "node:path";
import type { JsonRpcMeta } from "../contracts/rpc.js";

export const TRACE_ENABLED_ENV = "COMPUTER_USE_TRACE";
export const TRACE_OUTPUT_DIR_ENV = "COMPUTER_USE_TRACE_DIR";

export interface TraceOptions {
  enabled?: boolean;
  outputDir?: string;
}

export type TraceOptionSource = "default" | "env" | "config" | "request_meta";

export interface ResolvedTraceOptions {
  enabled: boolean;
  outputDir: string;
  enabledSource: TraceOptionSource;
  outputDirSource: TraceOptionSource;
}

export function getDefaultTraceOutputDir(cwd: string = process.cwd()): string {
  return path.join(cwd, ".artifacts", "computer-use-trace");
}

export function resolveTraceOptions(args: {
  config?: TraceOptions;
  meta?: JsonRpcMeta;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
} = {}): ResolvedTraceOptions {
  const env = args.env ?? process.env;
  const cwd = args.cwd ?? process.cwd();
  const metaTrace = args.meta?.computerUseTrace;

  const envEnabled = parseTraceBoolean(env[TRACE_ENABLED_ENV]);
  const configEnabled = args.config?.enabled;
  const metaEnabled = metaTrace?.enabled;

  const enabled =
    metaEnabled ?? configEnabled ?? envEnabled ?? false;
  const enabledSource = metaEnabled !== undefined
    ? "request_meta"
    : configEnabled !== undefined
      ? "config"
      : envEnabled !== undefined
        ? "env"
        : "default";

  const defaultOutputDir = getDefaultTraceOutputDir(cwd);
  const envOutputDir = normalizeDirectory(env[TRACE_OUTPUT_DIR_ENV]);
  const configOutputDir = normalizeDirectory(args.config?.outputDir);
  const metaOutputDir = normalizeDirectory(metaTrace?.outputDir);

  const outputDir =
    metaOutputDir ?? configOutputDir ?? envOutputDir ?? defaultOutputDir;
  const outputDirSource = metaOutputDir !== undefined
    ? "request_meta"
    : configOutputDir !== undefined
      ? "config"
      : envOutputDir !== undefined
        ? "env"
        : "default";

  return {
    enabled,
    outputDir,
    enabledSource,
    outputDirSource
  };
}

function parseTraceBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return undefined;
  }
}

function normalizeDirectory(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return path.resolve(trimmed);
}
