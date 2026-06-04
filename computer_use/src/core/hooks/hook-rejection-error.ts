import type { ToolGuidance } from "../contracts/rpc.js";

export class HookRejectionError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly guidance?: ToolGuidance;

  constructor(args: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    guidance?: ToolGuidance;
  }) {
    super(args.message);
    this.name = "HookRejectionError";
    this.code = args.code;
    this.details = args.details;
    this.guidance = args.guidance;
  }
}
