import {
  CLAUDE_HELPER_USE_MOCK_BRIDGE_ENV,
  createClaudeMcpServer
} from "./mcp-server.js";
import { installProcessCleanupHooks } from "../../core/runtime/process-cleanup.js";

export function createClaudeCodeMcpEntrypoint() {
  return createClaudeMcpServer({
    useMockBridge: process.env[CLAUDE_HELPER_USE_MOCK_BRIDGE_ENV] === "1"
  });
}

function isMainModule(argvPath: string | undefined, moduleUrl: string): boolean {
  if (!argvPath) {
    return false;
  }

  const normalizedArgv = argvPath.replace(/\\/g, "/");
  return moduleUrl.endsWith(normalizedArgv);
}

if (isMainModule(process.argv[1], import.meta.url)) {
  const instance = createClaudeCodeMcpEntrypoint().start();
  installProcessCleanupHooks(() => instance.server.close());
}
