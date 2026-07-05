import type { NativeBridge } from "./native-bridge.js";
import { MockNativeBridge } from "../../mocks/native-bridge.mock.js";
import { NativeHostBridge } from "./native-host-driver.js";
import { NapiNativeBridge } from "./napi-driver.js";
import { PowerShellNativeBridge } from "./powershell-driver.js";

export type NativeBridgeDriver = "mock" | "powershell" | "napi" | "native-host";

export interface NativeBridgeFactoryOptions {
  driver?: NativeBridgeDriver;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export function createNativeBridge(options: NativeBridgeFactoryOptions = {}): NativeBridge {
  const driver = options.driver ?? resolveNativeBridgeDriver(options.platform, options.env);

  switch (driver) {
    case "mock":
      return new MockNativeBridge();
    case "powershell":
      return new PowerShellNativeBridge();
    case "napi":
      return new NapiNativeBridge();
    case "native-host":
      return new NativeHostBridge();
    default:
      return assertNever(driver);
  }
}

export function resolveNativeBridgeDriver(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): NativeBridgeDriver {
  const requested = env.COMPUTER_USE_DRIVER?.toLowerCase();
  switch (requested) {
    case "mock":
    case "powershell":
    case "napi":
    case "native-host":
      return requested;
    case undefined:
      return platform === "win32" ? "native-host" : "mock";
    default:
      throw new Error(`Unsupported COMPUTER_USE_DRIVER: ${env.COMPUTER_USE_DRIVER}`);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled native bridge driver: ${String(value)}`);
}
