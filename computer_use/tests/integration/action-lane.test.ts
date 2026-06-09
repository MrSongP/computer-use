import test from "node:test";
import assert from "node:assert/strict";
import { createScaffoldRuntime } from "../../src/index.js";
import type {
  ClickResult,
  DragResult,
  PerformSecondaryActionResult,
  PressKeyResult,
  ScrollResult,
  SetValueResult,
  TypeTextResult
} from "../../src/core/contracts/action.js";
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

  assert.equal(response.ok, true);
  const clickResult = response.result as ClickResult;
  assert.equal(clickResult.ok, true);
  assert.deepEqual(clickResult.screenPoint, { x: 100, y: 200 });
  assert.equal(clickResult.activation.focused, true);
  assert.equal(clickResult.postInputFocus?.matchesTarget, true);
  assert.equal(clickResult.hitTest?.matchesTarget, true);
  const bridge = scaffold.runtime.nativeBridge as MockNativeBridge;
  assert.deepEqual(
    bridge.getRecordedInvocations().map((entry) => entry.name),
    ["beginTurn", "activateWindow", "getVirtualScreenMetrics", "sendPointerClick"]
  );
});

test("action lane rejects element_index on click and keeps semantic clicks on click_element", async () => {
  const scaffold = createScaffoldRuntime();

  await assert.rejects(
    scaffold.dispatcher.dispatch({
      id: 15,
      method: "click",
      params: {
        window: { id: 101, app: "demo.exe" },
        x: 10,
        y: 20,
        element_index: 1
      }
    }),
    /unsupported fields: element_index/
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

  assert.equal(pressKeyResponse.id, 2);
  assert.equal(pressKeyResponse.ok, true);
  const pressKeyResult = pressKeyResponse.result as PressKeyResult;
  assert.equal(pressKeyResult.ok, true);
  assert.equal(pressKeyResult.key, "Control_L+V");
  assert.deepEqual(pressKeyResult.dispatched, {
    kind: "keyboard_chord",
    normalizedKeys: ["Control_L", "V"],
    inputEvents: 4
  });
  assert.equal(pressKeyResult.activation.targetWindow.id, 101);
  assert.equal(typeTextResponse.id, 3);
  assert.equal(typeTextResponse.ok, true);
  const typeTextResult = typeTextResponse.result as TypeTextResult;
  assert.equal(typeTextResult.ok, true);
  assert.deepEqual(typeTextResult.dispatched, {
    kind: "text",
    inputMethod: "sendText",
    textLength: 5,
    utf16CodeUnits: 5
  });
  assert.equal(typeTextResult.activation.targetWindow.id, 101);
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

  assert.deepEqual(response, {
    id: 4,
    ok: true,
    result: {
      ok: true,
      window: { id: 101, app: "demo.exe" },
      focused: true,
      focusedSource: "assumed_after_successful_call"
    }
  });
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
  assert.equal(listAppsResponse.id, 7);
  assert.equal(listAppsResponse.ok, true);
  const listAppsResult = listAppsResponse.result as any;
  assert.deepEqual(listAppsResult.apps, [
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
  ]);
  assert.deepEqual(listAppsResult.diagnostics, {
    totalApps: 2,
    filteredApps: 2,
    returnedApps: 2,
    truncated: false,
    appliedFilters: {
      limit: 60
    }
  });
  assert.equal(listAppsResult.runtime.schemaVersion, "computer-use/list-apps/v1");
  assert.equal(listAppsResult.runtime.driverName, "mock");
  assert.equal(launchAppResponse.ok, true);
  const launchResult = launchAppResponse.result as any;
  assert.equal(launchResult.ok, true);
  assert.equal(launchResult.app, "demo.exe");
  assert.equal(launchResult.strategy, "executable_path");
  assert.equal(launchResult.launchMode, "force_new");
  assert.equal(launchResult.disposition, "observed_window");
  assert.deepEqual(launchResult.observedWindows, [
    { id: 101, app: "demo.exe", title: "Demo Window" }
  ]);
  assert.equal(launchResult.followUpActions.some((action: { action: string }) => action.action === "pollListWindows"), true);

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
      "launchApp",
      "listApps"
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
  assert.equal(clickElementResponse.id, 10);
  assert.equal(clickElementResponse.ok, true);
  const clickElementResult = clickElementResponse.result as any;
  assert.equal(clickElementResult.ok, true);
  assert.equal(clickElementResult.elementIndex, 1);
  assert.equal(clickElementResult.dispatched, "InvokePattern");
  assert.equal(clickElementResult.activation.targetWindow.id, 101);
  assert.equal(setValueResponse.ok, true);
  const setValueResult = setValueResponse.result as SetValueResult;
  assert.equal(setValueResult.ok, true);
  assert.equal(setValueResult.elementIndex, 1);
  assert.equal(setValueResult.dispatched, "ValuePattern");
  assert.equal(setValueResult.valueLength, 5);
  assert.equal(setValueResult.utf16CodeUnits, 5);
  assert.deepEqual(setValueResult.stateDiff, { collected: false, reason: "trace_disabled" });
  assert.equal(secondaryResponse.ok, true);
  const secondaryResult = secondaryResponse.result as PerformSecondaryActionResult;
  assert.equal(secondaryResult.ok, true);
  assert.equal(secondaryResult.elementIndex, 1);
  assert.equal(secondaryResult.requestedAction, "raise");
  assert.equal(secondaryResult.dispatched, "raise");
  assert.deepEqual(secondaryResult.stateDiff, { collected: false, reason: "trace_disabled" });
  assert.equal(scrollResponse.ok, true);
  const scrollResult = scrollResponse.result as ScrollResult;
  assert.equal(scrollResult.ok, true);
  assert.deepEqual(scrollResult.requestedPoint, { x: 100, y: 200 });
  assert.deepEqual(scrollResult.screenPoint, { x: 100, y: 200 });
  assert.deepEqual(scrollResult.scroll, { scrollX: 0, scrollY: -1 });
  assert.deepEqual(scrollResult.stateDiff, { collected: false, reason: "trace_disabled" });
  assert.equal(dragResponse.ok, true);
  const dragResult = dragResponse.result as DragResult;
  assert.equal(dragResult.ok, true);
  assert.deepEqual(dragResult.requestedStart, { x: 100, y: 200 });
  assert.deepEqual(dragResult.requestedEnd, { x: 140, y: 260 });
  assert.deepEqual(dragResult.screenStart, { x: 100, y: 200 });
  assert.deepEqual(dragResult.screenEnd, { x: 140, y: 260 });
  assert.deepEqual(dragResult.drag, { button: "left", durationMs: 250, steps: 12 });
  assert.deepEqual(dragResult.stateDiff, { collected: false, reason: "trace_disabled" });

  const bridge = scaffold.runtime.nativeBridge as MockNativeBridge;
  assert.deepEqual(
    bridge.getRecordedInvocations().map((entry) => entry.name),
    [
      "beginTurn",
      "getWindowState",
      "getVirtualScreenMetrics",
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
      "getVirtualScreenMetrics",
      "sendPointerScroll",
      "beginTurn",
      "activateWindow",
      "getVirtualScreenMetrics",
      "sendPointerDrag"
    ]
  );
});
