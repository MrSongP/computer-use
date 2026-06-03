export interface CapabilityResult<TPayload = unknown> {
  ok: boolean;
  payload: TPayload;
  warnings?: readonly string[];
}

export class ComputerUseContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ComputerUseContractError";
    this.code = code;
  }
}
