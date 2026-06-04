export interface TracePayloadMetrics {
  charCount: number;
  utf8Bytes: number;
  estimatedTokens: number;
  estimator: "heuristic_mixed_text_v1";
}

export function createPayloadMetrics(value: unknown): TracePayloadMetrics {
  const serialized = serializeForMetrics(value);
  return {
    charCount: serialized.length,
    utf8Bytes: Buffer.byteLength(serialized, "utf8"),
    estimatedTokens: estimateTokenCount(serialized),
    estimator: "heuristic_mixed_text_v1"
  };
}

export function estimateTokenCount(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  let tokens = 0;
  let index = 0;
  while (index < text.length) {
    const codePoint = text.codePointAt(index)!;
    const char = String.fromCodePoint(codePoint);
    const width = char.length;

    if (isWhitespace(char)) {
      index += width;
      continue;
    }

    if (isCjkCodePoint(codePoint)) {
      tokens += 1;
      index += width;
      continue;
    }

    if (isAsciiWordCodePoint(codePoint)) {
      let end = index + width;
      while (end < text.length) {
        const next = text.codePointAt(end)!;
        if (!isAsciiWordCodePoint(next)) {
          break;
        }
        end += String.fromCodePoint(next).length;
      }
      tokens += Math.ceil((end - index) / 4);
      index = end;
      continue;
    }

    if (isOtherWordCodePoint(codePoint)) {
      let count = 1;
      let end = index + width;
      while (end < text.length) {
        const next = text.codePointAt(end)!;
        if (!isOtherWordCodePoint(next)) {
          break;
        }
        count += 1;
        end += String.fromCodePoint(next).length;
      }
      tokens += Math.ceil(count / 2);
      index = end;
      continue;
    }

    tokens += 1;
    index += width;
  }

  return Math.max(tokens, 1);
}

function serializeForMetrics(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) {
      return serialized;
    }
  } catch {
    // Fall through to the string conversion below.
  }

  return String(value);
}

function isWhitespace(char: string): boolean {
  return /\s/u.test(char);
}

function isAsciiWordCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x30 && codePoint <= 0x39) ||
    (codePoint >= 0x41 && codePoint <= 0x5a) ||
    (codePoint >= 0x61 && codePoint <= 0x7a) ||
    codePoint === 0x5f
  );
}

function isOtherWordCodePoint(codePoint: number): boolean {
  if (isAsciiWordCodePoint(codePoint) || isCjkCodePoint(codePoint)) {
    return false;
  }

  return (
    (codePoint >= 0x00c0 && codePoint <= 0x024f) ||
    (codePoint >= 0x0370 && codePoint <= 0x03ff) ||
    (codePoint >= 0x0400 && codePoint <= 0x04ff) ||
    (codePoint >= 0x1e00 && codePoint <= 0x1eff)
  );
}

function isCjkCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x3040 && codePoint <= 0x309f) ||
    (codePoint >= 0x30a0 && codePoint <= 0x30ff) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af)
  );
}
