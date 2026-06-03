import type { TurnMetadata } from "../contracts/rpc.js";

export function turnScopeToKey(metadata: TurnMetadata): string {
  return `${metadata.session_id}::${metadata.turn_id}`;
}

export function isSameTurnScope(
  left: TurnMetadata | undefined,
  right: TurnMetadata | undefined
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.session_id === right.session_id && left.turn_id === right.turn_id;
}
