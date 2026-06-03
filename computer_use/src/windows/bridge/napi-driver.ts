import { NativeHostBridge } from "./native-host-driver.js";

export class NapiNativeBridge extends NativeHostBridge {
  override readonly driverName = "napi";
}
