import { NativeHostBridge } from "./native-host-driver.js";

export class FfiNativeBridge extends NativeHostBridge {
  override readonly driverName = "ffi";
}
