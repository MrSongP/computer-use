import type { AppIdentifier } from "./app.js";

export interface WindowRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface WindowRef {
  id: number;
  app: AppIdentifier;
  title?: string;
  rect?: WindowRect;
  visible?: boolean;
  minimized?: boolean;
  focused?: boolean;
}
