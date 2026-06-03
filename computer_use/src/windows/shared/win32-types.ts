export type HWND = number;
export type DWORD = number;
export type UINT = number;
export type WORD = number;

export interface KeyboardInput {
  key: string;
  vkCode: WORD;
  scanCode?: WORD;
  flags: DWORD;
}

export interface PointerClick {
  x: number;
  y: number;
  button: "left" | "right" | "middle";
  clickCount: number;
}

export interface PointerScroll {
  x: number;
  y: number;
  scrollX: number;
  scrollY: number;
}

export interface PointerDrag {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  button: "left" | "right" | "middle";
  durationMs: number;
  steps: number;
}
