import test from "node:test";
import assert from "node:assert/strict";
import { createNativeBridge, resolveNativeBridgeDriver } from "../../src/windows/bridge/create-native-bridge.js";

test("resolveNativeBridgeDriver defaults to native-host on Windows", () => {
  assert.equal(resolveNativeBridgeDriver("win32", {}), "native-host");
});

test("resolveNativeBridgeDriver defaults to mock outside Windows", () => {
  assert.equal(resolveNativeBridgeDriver("linux", {}), "mock");
});

test("resolveNativeBridgeDriver respects explicit env override", () => {
  assert.equal(resolveNativeBridgeDriver("win32", { COMPUTER_USE_DRIVER: "mock" }), "mock");
});

test("createNativeBridge instantiates the requested driver", () => {
  assert.equal(createNativeBridge({ driver: "mock" }).driverName, "mock");
  assert.equal(createNativeBridge({ driver: "powershell" }).driverName, "powershell");
  assert.equal(createNativeBridge({ driver: "native-host" }).driverName, "native-host");
  assert.equal(createNativeBridge({ driver: "ffi" }).driverName, "ffi");
  assert.equal(createNativeBridge({ driver: "napi" }).driverName, "napi");
});
