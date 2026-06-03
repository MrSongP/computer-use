import type { Dispatcher } from "../../core/dispatcher/dispatch.js";
import type { CapabilityRegistry } from "../../core/runtime/capability-registry.js";
import type { ExecutionContext } from "../../core/runtime/execution-context.js";
import { CodexHelperTransport, type CodexHelperTransportOptions } from "./helper-transport.js";
import type {
  CodexCapabilityDescriptor,
  CodexPluginContract
} from "./plugin-contract.js";

export interface CreateCodexAdapterOptions {
  transport?: CodexHelperTransport;
  transportOptions?: CodexHelperTransportOptions;
}

export function createCodexAdapter(
  runtime: ExecutionContext,
  dispatcher: Dispatcher,
  capabilities: CapabilityRegistry,
  options: CreateCodexAdapterOptions = {}
): CodexPluginContract & {
  runtime: ExecutionContext;
  dispatcher: Dispatcher;
} {
  const transport = options.transport ?? new CodexHelperTransport(options.transportOptions);
  const capabilityDescriptors: readonly CodexCapabilityDescriptor[] = [
    ...capabilities.list().map((item) => ({
      name: item.method,
      rpcMethod: item.method,
      summary: item.summary,
      requiresWindowActivation: item.requiresWindowActivation
    })),
    {
      name: "end_turn",
      rpcMethod: "end_turn",
      summary: "Close the active Codex turn and flush lifecycle state.",
      requiresWindowActivation: false
    }
  ];

  return {
    host: "codex",
    runtime,
    dispatcher,
    capabilities: capabilityDescriptors,
    async bootstrap() {
      await transport.bootstrap();
    },
    async invoke(method, params = {}, invokeOptions = {}) {
      return await transport.invoke(method, params, invokeOptions);
    },
    async endTurn(meta) {
      await transport.invoke("end_turn", {}, { meta });
    },
    async close() {
      await transport.close();
    }
  };
}
