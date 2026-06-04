import test from "node:test";
import assert from "node:assert/strict";
import { createScaffoldRuntime } from "../../src/index.js";
import type { WindowStateResult } from "../../src/core/contracts/capture.js";
import type { MockNativeBridge } from "../../src/mocks/native-bridge.mock.js";

test("action lane dispatches click through the mock native bridge", async () => {
  const scaffold = createScaffoldRuntime();

  const response = await scaffold.dispatcher.dispatch({
    id: 1,
    method: "click",
    params: {
      window: { id: 101, app: "demo.exe" },
      x: 100,
      y: 200
    }
  });

  assert.deepEqual(response, { id: 1, ok: true, result: null });
  const bridge = scaffold.runtime.nativeBridge as MockNativeBridge;
  assert.deepEqual(
    bridge.getRecordedInvocations().map((entry) => entry.name),
    ["beginTurn", "activateWindow", "getVirtualScreenMetrics", "sendPointerClick"]
  );
});

test("action lane dispatches press_key and type_text through the same runtime seam", async () => {
  const scaffold = createScaffoldRuntime();

  const pressKeyResponse = await scaffold.dispatcher.dispatch({
    id: 2,
    method: "press_key",
    params: {
      window: { id: 101, app: "demo.exe" },
      key: "Control_L+V"
    }
  });

  const typeTextResponse = await scaffold.dispatcher.dispatch({
    id: 3,
    method: "type_text",
    params: {
      window: { id: 101, app: "demo.exe" },
      text: "hello"
    }
  });

  assert.deepEqual(pressKeyResponse, { id: 2, ok: true, result: null });
  assert.deepEqual(typeTextResponse, { id: 3, ok: true, result: null });
  const bridge = scaffold.runtime.nativeBridge as MockNativeBridge;
  assert.deepEqual(
    bridge.getRecordedInvocations().map((entry) => entry.name),
    [
      "beginTurn",
      "activateWindow",
      "sendKeyboardInputs",
      "beginTurn",
      "activateWindow",
      "sendText"
    ]
  );
});

test("action lane exposes activate_window through the same runtime seam", async () => {
  const scaffold = createScaffoldRuntime();

  const response = await scaffold.dispatcher.dispatch({
    id: 4,
    method: "activate_window",
    params: {
      window: { id: 101, app: "demo.exe" }
    }
  });

  assert.deepEqual(response, { id: 4, ok: true, result: null });
  const bridge = scaffold.runtime.nativeBridge as MockNativeBridge;
  assert.deepEqual(
    bridge.getRecordedInvocations().map((entry) => entry.name),
    ["beginTurn", "activateWindow"]
  );
});

test("action lane exposes discovery and launch capabilities through the same runtime seam", async () => {
  const scaffold = createScaffoldRuntime();

  const listWindowsResponse = await scaffold.dispatcher.dispatch({
    id: 5,
    method: "list_windows",
    params: {}
  });
  const getWindowResponse = await scaffold.dispatcher.dispatch({
    id: 6,
    method: "get_window",
    params: { id: 101, app: "demo.exe" }
  });
  const listAppsResponse = await scaffold.dispatcher.dispatch({
    id: 7,
    method: "list_apps",
    params: {}
  });
  const launchAppResponse = await scaffold.dispatcher.dispatch({
    id: 8,
    method: "launch_app",
    params: { app: "demo.exe", launch_mode: "force_new" }
  });

  assert.deepEqual(listWindowsResponse, {
    id: 5,
    ok: true,
    result: [{ id: 101, app: "demo.exe", title: "Demo Window" }]
  });
  assert.deepEqual(getWindowResponse, {
    id: 6,
    ok: true,
    result: { id: 101, app: "demo.exe", title: "Demo Window" }
  });
  assert.deepEqual(listAppsResponse, {
    id: 7,
    ok: true,
    result: {
      apps: [
        {
          id: "demo.exe",
          displayName: "Demo App",
          executablePath: "C:\\Demo\\demo.exe",
          isRunning: true,
          activationModel: "executable_path",
          windows: [{ id: 101, app: "demo.exe", title: "Demo Window" }]
        },
        {
          id: "windows.shell.taskbar",
          displayName: "Windows Taskbar",
          isRunning: true,
          activationModel: "executable_path",
          windows: [{ id: 501, app: "windows.shell.taskbar", title: "Windows Taskbar" }]
        }
      ]
    }
  });
  assert.deepEqual(launchAppResponse, { id: 8, ok: true, result: null });

  const bridge = scaffold.runtime.nativeBridge as MockNativeBridge;
  assert.deepEqual(
    bridge.getRecordedInvocations().map((entry) => entry.name),
    [
      "beginTurn",
      "listWindows",
      "beginTurn",
      "getWindow",
      "beginTurn",
      "listApps",
      "beginTurn",
      "launchApp"
    ]
  );
});

test("action lane exposes capture and UIA capabilities through the same runtime seam", async () => {
  const scaffold = createScaffoldRuntime();

  const getWindowStateResponse = await scaffold.dispatcher.dispatch({
    id: 9,
    method: "get_window_state",
    params: {
      window: { id: 101, app: "demo.exe", title: "Demo Window" }
    }
  });
  const clickElementResponse = await scaffold.dispatcher.dispatch({
    id: 10,
    method: "click_element",
    params: {
      window: { id: 101, app: "demo.exe" },
      element_index: 1
    }
  });
  const setValueResponse = await scaffold.dispatcher.dispatch({
    id: 11,
    method: "set_value",
    params: {
      window: { id: 101, app: "demo.exe" },
      element_index: 1,
      value: "hello"
    }
  });
  const secondaryResponse = await scaffold.dispatcher.dispatch({
    id: 12,
    method: "perform_secondary_action",
    params: {
      window: { id: 101, app: "demo.exe" },
      element_index: 1,
      action: "raise"
    }
  });
  const scrollResponse = await scaffold.dispatcher.dispatch({
    id: 13,
    method: "scroll",
    params: {
      window: { id: 101, app: "demo.exe" },
      x: 100,
      y: 200,
      scroll_y: -1
    }
  });
  const dragResponse = await scaffold.dispatcher.dispatch({
    id: 14,
    method: "drag",
    params: {
      window: { id: 101, app: "demo.exe" },
      from_x: 100,
      from_y: 200,
      to_x: 140,
      to_y: 260
    }
  });

  assert.equal(getWindowStateResponse.ok, true);
  const windowState = getWindowStateResponse.result as WindowStateResult;
  assert.equal(windowState.screenshot?.mime, "image/jpeg");
  assert.equal(windowState.screenshot?.raw, undefined);
  assert.equal(windowState.text?.index, 0);
  assert.deepEqual(clickElementResponse, { id: 10, ok: true, result: null });
  assert.deepEqual(setValueResponse, { id: 11, ok: true, result: null });
  assert.deepEqual(secondaryResponse, { id: 12, ok: true, result: null });
  assert.deepEqual(scrollResponse, { id: 13, ok: true, result: null });
  assert.deepEqual(dragResponse, { id: 14, ok: true, result: null });

  const bridge = scaffold.runtime.nativeBridge as MockNativeBridge;
  assert.deepEqual(
    bridge.getRecordedInvocations().map((entry) => entry.name),
    [
      "beginTurn",
      "getWindowState",
      "beginTurn",
      "activateWindow",
      "clickElement",
      "beginTurn",
      "activateWindow",
      "setValue",
      "beginTurn",
      "activateWindow",
      "performSecondaryAction",
      "beginTurn",
      "activateWindow",
      "sendPointerScroll",
      "beginTurn",
      "activateWindow",
      "sendPointerDrag"
    ]
  );
});
