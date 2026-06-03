export class NativeBridgeUnavailableError extends Error {
  constructor(message = "Native bridge is unavailable in this scaffold runtime") {
    super(message);
    this.name = "NativeBridgeUnavailableError";
  }
}
