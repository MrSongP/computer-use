import { NullNativeBridge } from "../windows/bridge/null-driver.js";

export class MockNativeBridge extends NullNativeBridge {
  override readonly driverName = "mock";
}
