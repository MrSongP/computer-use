import { createScaffoldRuntime, createWindowsRuntime } from "../../index.js";
import {
  StdioJsonRpcServer,
  StdioRpcRuntime
} from "../../core/transport/stdio-server.js";
import { installProcessCleanupHooks } from "../../core/runtime/process-cleanup.js";

export const CODEX_HELPER_USE_MOCK_BRIDGE_ENV = "COMPUTER_USE_TEST_USE_MOCK_BRIDGE";

export interface CodexHelperServerOptions {
  useMockBridge?: boolean;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  exit?: (code: number) => void;
}

export function createCodexHelperServer(options: CodexHelperServerOptions = {}) {
  const scaffold = options.useMockBridge ? createScaffoldRuntime() : createWindowsRuntime();
  const transport = new StdioJsonRpcServer({
    input: options.input,
    output: options.output
  });
  const runtime = new StdioRpcRuntime(
    transport,
    scaffold.dispatcher,
    scaffold.runtime,
    {
      exit: options.exit
    }
  );

  transport.on("parseError", (error) => {
    process.stderr.write(`${error.message}\n`);
  });

  return {
    scaffold,
    transport,
    runtime,
    start() {
      runtime.start();
      return this;
    }
  };
}

function isMainModule(argvPath: string | undefined, moduleUrl: string): boolean {
  if (!argvPath) {
    return false;
  }

  const normalizedArgv = argvPath.replace(/\\/g, "/");
  return moduleUrl.endsWith(normalizedArgv);
}

if (isMainModule(process.argv[1], import.meta.url)) {
  const instance = createCodexHelperServer({
    useMockBridge: process.env[CODEX_HELPER_USE_MOCK_BRIDGE_ENV] === "1"
  }).start();
  installProcessCleanupHooks(() => instance.runtime.close());
}
