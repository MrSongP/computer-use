export class InterruptState {
  private interrupted = false;
  private scopeKey: string | undefined;

  trigger(scopeKey?: string): void {
    this.interrupted = true;
    this.scopeKey = scopeKey;
  }

  clear(scopeKey?: string): void {
    if (scopeKey && this.scopeKey && this.scopeKey !== scopeKey) {
      return;
    }

    this.interrupted = false;
    this.scopeKey = undefined;
  }

  isInterrupted(scopeKey?: string): boolean {
    if (!this.interrupted) {
      return false;
    }

    if (!this.scopeKey || !scopeKey) {
      return true;
    }

    return this.scopeKey === scopeKey;
  }

  getScopeKey(): string | undefined {
    return this.scopeKey;
  }
}
