const MOUSE_BUTTON_VALUES = ["left", "right", "middle", "l", "r", "m"] as const;

export function ensureObject(
  value: unknown,
  message: string
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

export function ensureNoUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  method: string
): void {
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${method} received unsupported fields: ${unknownKeys.join(", ")}`);
  }
}

export function ensureWindowRef(window: unknown, method: string): void {
  if (typeof window !== "object" || window === null) {
    throw new Error(`${method} requires a valid window`);
  }

  const candidate = window as { id?: unknown; app?: unknown };
  if (typeof candidate.id !== "number" || !Number.isFinite(candidate.id) || typeof candidate.app !== "string") {
    throw new Error(`${method} requires a valid window`);
  }
}

export function ensureNonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(message);
  }

  return value;
}

export function ensurePositiveInteger(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(message);
  }

  return value;
}

export function ensureFiniteNumber(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(message);
  }

  return value;
}

export function ensureOptionalNonEmptyString(value: unknown, message: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }

  return value.trim();
}

export function ensureNonEmptyString(value: unknown, message: string): string {
  const result = ensureOptionalNonEmptyString(value, message);
  if (result === undefined) {
    throw new Error(message);
  }

  return result;
}

export function ensureMouseButton(value: unknown, message: string): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || !MOUSE_BUTTON_VALUES.includes(value as typeof MOUSE_BUTTON_VALUES[number])) {
    throw new Error(message);
  }
}
