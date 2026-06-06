import os from "node:os";
import path from "node:path";
import type { JsonRpcMeta } from "../contracts/rpc.js";
import { InterruptState } from "./interrupt-state.js";
import { LifecycleManager } from "../runtime/lifecycle-manager.js";
import {
  buildInterruptScopeKey,
  hasInterruptMarker,
  removeInterruptMarker,
  writeInterruptMarker
} from "./interrupt-files.js";
import { ESCAPE_ERROR_MESSAGE } from "./interrupt-error.js";
import { isSameTurnScope } from "./interrupt-scope.js";

export class EndTurnCoordinator {
  private currentTurnMeta: JsonRpcMeta["codexTurnMetadata"] | undefined;
  private readonly closedInterruptScopes = new Set<string>();

  constructor(
    private readonly lifecycle: LifecycleManager,
    private readonly interrupts: InterruptState,
    private readonly codexHome: string = resolveCodexHome()
  ) {
    this.currentTurnMeta = this.lifecycle.getCurrentTurn()?.codexTurnMetadata;
  }

  begin(meta?: JsonRpcMeta): void {
    const nextTurnMeta = meta?.codexTurnMetadata;
    if (!isSameTurnScope(this.currentTurnMeta, nextTurnMeta)) {
      this.interrupts.clear();
    }

    this.currentTurnMeta = nextTurnMeta;
    this.lifecycle.beginTurn(meta);
  }

  async close(): Promise<void> {
    const currentTurnMeta = this.lifecycle.getCurrentTurn()?.codexTurnMetadata ?? this.currentTurnMeta;
    if (currentTurnMeta) {
      await removeInterruptMarker(this.codexHome, currentTurnMeta);
      this.closedInterruptScopes.delete(buildInterruptScopeKey(currentTurnMeta));
    }

    this.lifecycle.endTurn();
    this.interrupts.clear();
    this.currentTurnMeta = undefined;
  }

  check(meta?: JsonRpcMeta): string | null {
    const turnMeta = meta?.codexTurnMetadata ?? this.currentTurnMeta;
    if (!turnMeta) {
      return this.interrupts.isInterrupted() ? ESCAPE_ERROR_MESSAGE : null;
    }

    const scopeKey = buildInterruptScopeKey(turnMeta);
    if (this.interrupts.isInterrupted(scopeKey) || hasInterruptMarker(this.codexHome, turnMeta)) {
      this.interrupts.trigger(scopeKey);
      this.currentTurnMeta = turnMeta;
      this.closeInterruptedTurn(scopeKey);
      return ESCAPE_ERROR_MESSAGE;
    }

    if (this.interrupts.getScopeKey() && this.interrupts.getScopeKey() !== scopeKey) {
      this.interrupts.clear();
    }

    return null;
  }

  async trigger(meta?: JsonRpcMeta): Promise<string | null> {
    const turnMeta = meta?.codexTurnMetadata ?? this.currentTurnMeta;
    if (!turnMeta) {
      this.interrupts.trigger();
      return null;
    }

    const scopeKey = buildInterruptScopeKey(turnMeta);
    this.interrupts.trigger(scopeKey);
    this.currentTurnMeta = turnMeta;
    this.closeInterruptedTurn(scopeKey);
    return writeInterruptMarker(this.codexHome, turnMeta);
  }

  private closeInterruptedTurn(scopeKey: string): void {
    if (this.closedInterruptScopes.has(scopeKey)) {
      return;
    }

    this.closedInterruptScopes.add(scopeKey);
    this.lifecycle.resetTurn("interrupted");
  }
}

function resolveCodexHome(): string {
  return process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
}
