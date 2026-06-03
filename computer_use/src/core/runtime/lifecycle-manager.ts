import type { JsonRpcMeta } from "../contracts/rpc.js";
import type { NativeBridge } from "../../windows/bridge/native-bridge.js";

export class LifecycleManager {
  private currentTurn: JsonRpcMeta | undefined;

  constructor(private readonly nativeBridge: NativeBridge) {}

  beginTurn(meta?: JsonRpcMeta): void {
    this.currentTurn = meta;
    this.nativeBridge.beginTurn(meta);
  }

  endTurn(): void {
    this.currentTurn = undefined;
    this.nativeBridge.endTurn();
  }

  getCurrentTurn(): JsonRpcMeta | undefined {
    return this.currentTurn;
  }
}
