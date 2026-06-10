import type { Dispatcher } from "../../core/dispatcher/dispatch.js";
import type { JsonRpcMeta, TurnMetadata } from "../../core/contracts/rpc.js";
import type { CapabilityRegistry } from "../../core/runtime/capability-registry.js";
import type { ExecutionContext } from "../../core/runtime/execution-context.js";
import {
  ClaudeCodeAdapterRpcError,
  type ClaudeCodeAdapterMethod,
  type ClaudeCodeCapabilityDescriptor,
  type ClaudeCodeInvokeMeta,
  type ClaudeCodeInvokeOptions,
  type ClaudeCodePluginContract
} from "./plugin-contract.js";
import { getClaudeToolInputSchema, getClaudeToolOutputSchema } from "./tool-schema.js";

export function createClaudeAdapter(
  runtime: ExecutionContext,
  dispatcher: Dispatcher,
  capabilities: CapabilityRegistry
): ClaudeCodePluginContract & {
  runtime: ExecutionContext;
  dispatcher: Dispatcher;
} {
  let nextRequestId = 1;
  let currentTurnMeta: TurnMetadata | undefined;
  const capabilityDescriptors: readonly ClaudeCodeCapabilityDescriptor[] = [
    ...capabilities.list().map((item) => ({
      name: item.method,
      rpcMethod: item.method,
      summary: item.summary,
      requiresWindowActivation: item.requiresWindowActivation,
      inputSchema: getClaudeToolInputSchema(item.method),
      outputSchema: getAdvertisedOutputSchema(item.method)
    })),
    {
      name: "end_turn",
      rpcMethod: "end_turn",
      summary: "Call once before the final answer to show completion, close the active Claude Code computer-use turn, and flush lifecycle state.",
      requiresWindowActivation: false,
      inputSchema: getClaudeToolInputSchema("end_turn"),
      outputSchema: getClaudeToolOutputSchema("end_turn")
    }
  ];

  return {
    host: "claude-code",
    runtime,
    dispatcher,
    capabilities: capabilityDescriptors,
    async bootstrap() {
      // Claude Code starts MCP servers before the first tool call; no turn starts until invoke().
    },
    async invoke(
      method: ClaudeCodeAdapterMethod,
      params: unknown = {},
      options: ClaudeCodeInvokeOptions = {}
    ) {
      if (method === "end_turn") {
        await runtime.endTurn.close();
        clearTurnMeta(options.meta);
        return null;
      }

      await endPreviousTurnIfScopeChanged(options.meta);
      const meta = ensureClaudeHostMeta(options.meta);
      const response = await dispatcher.dispatch({
        id: nextRequestId++,
        method,
        params,
        meta
      });

      if (!response.ok) {
        throw new ClaudeCodeAdapterRpcError(response);
      }

      currentTurnMeta = meta.codexTurnMetadata;
      return response.result;
    },
    async endTurn(meta?: ClaudeCodeInvokeMeta) {
      await runtime.endTurn.close();
      clearTurnMeta(meta);
    },
    async close() {
      await runtime.endTurn.close();
      currentTurnMeta = undefined;
    }
  };

  async function endPreviousTurnIfScopeChanged(nextMeta: ClaudeCodeInvokeMeta | undefined): Promise<void> {
    if (!currentTurnMeta) {
      return;
    }

    const nextTurnMeta = normalizeTurnMeta(nextMeta);
    if (sameTurnScope(currentTurnMeta, nextTurnMeta)) {
      return;
    }

    try {
      await runtime.endTurn.close();
    } finally {
      currentTurnMeta = undefined;
    }
  }

  function clearTurnMeta(meta: ClaudeCodeInvokeMeta | undefined): void {
    if (!currentTurnMeta) {
      return;
    }

    const turnMeta = normalizeTurnMeta(meta);
    if (turnMeta === undefined || sameTurnScope(currentTurnMeta, turnMeta)) {
      currentTurnMeta = undefined;
    }
  }
}

export function ensureClaudeHostMeta(meta: ClaudeCodeInvokeMeta | undefined): JsonRpcMeta {
  const normalizedTurnMeta = normalizeTurnMeta(meta);
  const { claudeTurnMetadata: _claudeTurnMetadata, ...jsonRpcMeta } = meta ?? {};

  return {
    ...jsonRpcMeta,
    host: "claude-code",
    codexTurnMetadata: normalizedTurnMeta
  };
}

function getAdvertisedOutputSchema(
  method: ClaudeCodeAdapterMethod
): ReturnType<typeof getClaudeToolOutputSchema> {
  if (method === "get_window_state") {
    return undefined;
  }

  return getClaudeToolOutputSchema(method);
}

function normalizeTurnMeta(meta: ClaudeCodeInvokeMeta | undefined): TurnMetadata | undefined {
  return meta?.codexTurnMetadata ?? meta?.claudeTurnMetadata;
}

function sameTurnScope(left: TurnMetadata | undefined, right: TurnMetadata | undefined): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.session_id === right.session_id && left.turn_id === right.turn_id;
}
