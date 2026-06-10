import type { JsonRpcMeta } from "../contracts/rpc.js";
import type { NativeBridge } from "../../windows/bridge/native-bridge.js";
import { isSameTurnScope } from "../interrupt/interrupt-scope.js";

export class LifecycleManager {
  private currentTurn: JsonRpcMeta | undefined;

  constructor(private readonly nativeBridge: NativeBridge) {}

  beginTurn(meta?: JsonRpcMeta): void {
    if (
      this.currentTurn &&
      !isSameTurnScope(this.currentTurn.codexTurnMetadata, meta?.codexTurnMetadata)
    ) {
      this.resetTurn("stale_turn");
    }

    this.currentTurn = meta;
    this.nativeBridge.beginTurn(meta);
  }

  async endTurn(): Promise<void> {
    this.currentTurn = undefined;
    await this.nativeBridge.endTurn();
  }

  resetTurn(reason?: string): void {
    this.currentTurn = undefined;
    if (this.nativeBridge.resetTurn) {
      this.nativeBridge.resetTurn(reason);
      return;
    }

    void this.nativeBridge.endTurn();
  }

  getCurrentTurn(): JsonRpcMeta | undefined {
    return this.currentTurn;
  }
}
