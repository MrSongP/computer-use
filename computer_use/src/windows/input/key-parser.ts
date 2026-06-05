export interface ParsedKey {
  readonly key: string;
  readonly vkCode: number;
  readonly isExtended: boolean;
}

export interface ParsedChord {
  readonly keys: readonly ParsedKey[];
}

interface KeyDefinition {
  readonly vkCode: number;
  readonly isExtended: boolean;
}

const KEY_ALIASES = new Map<string, readonly string[]>([
  ["exclam", ["Shift_L", "1"]]
]);

const FORBIDDEN_KEYS = new Set([
  "super",
  "super_l",
  "super_r",
  "meta",
  "meta_l",
  "meta_r",
  "windows",
  "win",
  "cmd",
  "command",
  "os"
]);

const KEY_DEFINITIONS = new Map<string, KeyDefinition>([
  ["Shift", { vkCode: 0xa0, isExtended: false }],
  ["Shift_L", { vkCode: 0xa0, isExtended: false }],
  ["Shift_R", { vkCode: 0xa1, isExtended: false }],
  ["Control", { vkCode: 0xa2, isExtended: false }],
  ["Ctrl", { vkCode: 0xa2, isExtended: false }],
  ["Control_L", { vkCode: 0xa2, isExtended: false }],
  ["Control_R", { vkCode: 0xa3, isExtended: false }],
  ["Alt", { vkCode: 0xa4, isExtended: false }],
  ["Alt_L", { vkCode: 0xa4, isExtended: false }],
  ["Alt_R", { vkCode: 0xa5, isExtended: false }],
  ["Caps_Lock", { vkCode: 0x14, isExtended: false }],
  ["Escape", { vkCode: 0x1b, isExtended: false }],
  ["Return", { vkCode: 0x0d, isExtended: false }],
  ["Tab", { vkCode: 0x09, isExtended: false }],
  ["BackSpace", { vkCode: 0x08, isExtended: false }],
  ["Delete", { vkCode: 0x2e, isExtended: true }],
  ["Home", { vkCode: 0x24, isExtended: true }],
  ["End", { vkCode: 0x23, isExtended: true }],
  ["Prior", { vkCode: 0x21, isExtended: true }],
  ["Page_Up", { vkCode: 0x21, isExtended: true }],
  ["Next", { vkCode: 0x22, isExtended: true }],
  ["Page_Down", { vkCode: 0x22, isExtended: true }],
  ["Left", { vkCode: 0x25, isExtended: true }],
  ["Up", { vkCode: 0x26, isExtended: true }],
  ["Right", { vkCode: 0x27, isExtended: true }],
  ["Down", { vkCode: 0x28, isExtended: true }],
  ["Insert", { vkCode: 0x2d, isExtended: true }],
  ["Print", { vkCode: 0x2c, isExtended: false }],
  ["Scroll_Lock", { vkCode: 0x91, isExtended: false }],
  ["Pause", { vkCode: 0x13, isExtended: false }],
  ["space", { vkCode: 0x20, isExtended: false }],
  ["period", { vkCode: 0xbe, isExtended: false }],
  ["comma", { vkCode: 0xbc, isExtended: false }],
  ["slash", { vkCode: 0xbf, isExtended: false }],
  ["KP_0", { vkCode: 0x60, isExtended: false }],
  ["KP_1", { vkCode: 0x61, isExtended: false }],
  ["KP_2", { vkCode: 0x62, isExtended: false }],
  ["KP_3", { vkCode: 0x63, isExtended: false }],
  ["KP_4", { vkCode: 0x64, isExtended: false }],
  ["KP_5", { vkCode: 0x65, isExtended: false }],
  ["KP_6", { vkCode: 0x66, isExtended: false }],
  ["KP_7", { vkCode: 0x67, isExtended: false }],
  ["KP_8", { vkCode: 0x68, isExtended: false }],
  ["KP_9", { vkCode: 0x69, isExtended: false }],
  ["KP_Add", { vkCode: 0x6b, isExtended: false }],
  ["KP_Subtract", { vkCode: 0x6d, isExtended: false }],
  ["KP_Multiply", { vkCode: 0x6a, isExtended: false }],
  ["KP_Divide", { vkCode: 0x6f, isExtended: true }],
  ["KP_Decimal", { vkCode: 0x6e, isExtended: false }]
]);

for (let i = 1; i <= 12; i += 1) {
  KEY_DEFINITIONS.set(`F${i}`, { vkCode: 0x6f + i, isExtended: false });
}

for (let i = 0; i < 26; i += 1) {
  const key = String.fromCharCode(65 + i);
  KEY_DEFINITIONS.set(key, { vkCode: 0x41 + i, isExtended: false });
  KEY_DEFINITIONS.set(key.toLowerCase(), { vkCode: 0x41 + i, isExtended: false });
}

for (let i = 0; i <= 9; i += 1) {
  KEY_DEFINITIONS.set(String(i), { vkCode: 0x30 + i, isExtended: false });
}

export function parseKeyChord(input: string): ParsedChord {
  const parts = input.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error("key chord is required");
  }

  const keys = parts.flatMap((part) => {
    if (FORBIDDEN_KEYS.has(part.toLowerCase())) {
      throw new Error(`Forbidden key: ${part}`);
    }

    const alias = KEY_ALIASES.get(part);
    if (alias) {
      return alias.map(resolveKeyDefinition);
    }

    return [resolveKeyDefinition(part)];
  });

  return { keys };
}

function resolveKeyDefinition(part: string): ParsedKey {
  const definition = KEY_DEFINITIONS.get(part);
  if (!definition) {
    throw new Error(`Unknown key: ${part}`);
  }

  return {
    key: part,
    vkCode: definition.vkCode,
    isExtended: definition.isExtended
  };
}

export function normalizeKeyChord(input: string): readonly string[] {
  return parseKeyChord(input).keys.map((key) => key.key);
}
