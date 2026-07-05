import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const pluginRoot = path.resolve(
  process.env.COMPUTER_USE_SMOKE_PLUGIN_ROOT ?? path.join(repoRoot, "computer_use")
);
const entrypoint = path.join(pluginRoot, "dist", "src", "adapters", "claude-code", "mcp-entrypoint.js");

async function main() {
  const child = spawn(process.execPath, [entrypoint], {
    cwd: pluginRoot,
    stdio: ["pipe", "pipe", "pipe"]
  });

  const responses = [];
  let stdoutBuffer = "";
  let stderrBuffer = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;

    while (true) {
      const newlineIndex = stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) {
        break;
      }

      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        responses.push(JSON.parse(line));
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    stderrBuffer += chunk;
  });

  const request = (payload) => {
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  };

  const waitForResponses = async (count, timeoutMs = 15000) => {
    const startedAt = Date.now();
    while (responses.length < count) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for ${count} MCP responses. stderr=${stderrBuffer || "<empty>"}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    return responses.slice(0, count);
  };

  try {
    request({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        clientInfo: {
          name: "computer-use-smoke",
          version: "0.0.0"
        }
      }
    });
    request({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {}
    });
    request({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    });
    request({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "list_apps",
        arguments: {
          claudeTurnMetadata: {
            session_id: "smoke-session",
            turn_id: "smoke-turn"
          }
        }
      }
    });
    request({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "end_turn",
        arguments: {
          claudeTurnMetadata: {
            session_id: "smoke-session",
            turn_id: "smoke-turn"
          }
        }
      }
    });

    const [initializeResponse, listResponse, listAppsResponse, endTurnResponse] = await waitForResponses(4);
    if (initializeResponse?.result?.serverInfo?.name !== "computer-use") {
      throw new Error(`Unexpected initialize response: ${JSON.stringify(initializeResponse)}`);
    }

    const tools = listResponse?.result?.tools;
    if (!Array.isArray(tools)) {
      throw new Error(`tools/list did not return a tool array: ${JSON.stringify(listResponse)}`);
    }

    const toolNames = new Set(tools.map((tool) => tool?.name));
    for (const requiredTool of ["list_windows", "get_window_state", "click", "end_turn"]) {
      if (!toolNames.has(requiredTool)) {
        throw new Error(`Missing required tool "${requiredTool}" in tools/list.`);
      }
    }

    if (listAppsResponse?.result?.isError) {
      throw new Error(`list_apps failed during smoke test: ${JSON.stringify(listAppsResponse)}`);
    }

    const parsedAppsPayload = JSON.parse(listAppsResponse.result.content[0].text);
    if (!parsedAppsPayload || !Array.isArray(parsedAppsPayload.apps)) {
      throw new Error(`list_apps returned an unexpected payload: ${JSON.stringify(listAppsResponse)}`);
    }

    if (endTurnResponse?.result?.isError) {
      throw new Error(`end_turn failed during smoke test: ${JSON.stringify(endTurnResponse)}`);
    }

    request({
      jsonrpc: "2.0",
      id: 5,
      method: "close",
      params: {}
    });

    await waitForResponses(5);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        resolve();
      }, 500);

      child.once("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0 || code === null) {
          resolve();
          return;
        }

        reject(new Error(`MCP entrypoint exited with code ${code}. stderr=${stderrBuffer || "<empty>"}`));
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    process.stdout.write("Claude MCP smoke passed.\n");
  } catch (error) {
    child.kill();
    throw error;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
