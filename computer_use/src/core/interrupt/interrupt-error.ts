export const ESCAPE_ERROR_MESSAGE =
  "Computer Use was stopped by the user with the physical Escape key. " +
  "Stop your work, do not call further Computer Use tools in this turn, " +
  "and send a final message noting that the user stopped Computer Use.";

export interface InterruptAwareErrorLike {
  code?: string;
  error?: string;
  message?: string;
}

export function isEscapeInterruptError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message === ESCAPE_ERROR_MESSAGE;
  }

  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as InterruptAwareErrorLike;
  return candidate.error === ESCAPE_ERROR_MESSAGE || candidate.message === ESCAPE_ERROR_MESSAGE;
}
