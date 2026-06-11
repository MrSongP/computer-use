export function installProcessCleanupHooks(cleanup: () => Promise<void> | void): void {
  let cleaning = false;

  const cleanupOnce = async () => {
    if (cleaning) {
      return;
    }

    cleaning = true;
    try {
      await cleanup();
    } catch (error) {
      process.stderr.write(`${formatCleanupError(error)}\n`);
    }
  };

  const exitAfterCleanup = (code: number) => {
    void cleanupOnce().finally(() => {
      process.exit(code);
    });
  };

  process.once("SIGINT", () => {
    exitAfterCleanup(130);
  });
  process.once("SIGTERM", () => {
    exitAfterCleanup(143);
  });
  process.once("beforeExit", () => {
    void cleanupOnce();
  });
  process.once("uncaughtException", (error) => {
    process.stderr.write(`${formatCleanupError(error)}\n`);
    exitAfterCleanup(1);
  });
  process.once("unhandledRejection", (reason) => {
    process.stderr.write(`${formatCleanupError(reason)}\n`);
    exitAfterCleanup(1);
  });
}

function formatCleanupError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
