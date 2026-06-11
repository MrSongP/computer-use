import test from "node:test";
import assert from "node:assert/strict";
import { buildOperationStatus } from "../../src/windows/bridge/operation-status.js";

test("buildOperationStatus describes window activation in display text", () => {
  assert.deepEqual(
    buildOperationStatus("activateWindow", {
      window: {
        id: 42,
        app: "D:\\Tencent\\QQ.exe",
        title: "QQ"
      }
    }),
    {
      title: "Focus Window",
      detail: "Bring QQ to the front"
    }
  );
});

test("buildOperationStatus keeps pointer coordinates visible for click actions", () => {
  assert.deepEqual(
    buildOperationStatus("sendPointerClick", {
      targetWindow: {
        id: 42,
        app: "C:\\Windows\\System32\\notepad.exe",
        title: "Untitled - Notepad"
      },
      click: {
        x: 120,
        y: 240,
        button: "left",
        clickCount: 1
      }
    }),
    {
      title: "Click",
      detail: "Click Untitled - Notepad (120, 240)"
    }
  );
});

test("buildOperationStatus maps element clicks to the same short click label", () => {
  assert.deepEqual(
    buildOperationStatus("clickElement", {
      params: {
        window: {
          id: 42,
          app: "C:\\Windows\\System32\\notepad.exe",
          title: "Untitled - Notepad"
        },
        element_index: 7
      }
    }),
    {
      title: "Click",
      detail: "Click element #7 in Untitled - Notepad"
    }
  );
});

test("buildOperationStatus maps window state reads to a short look label", () => {
  assert.deepEqual(
    buildOperationStatus("getWindowState", {
      params: {
        window: {
          id: 42,
          app: "C:\\Windows\\System32\\notepad.exe",
          title: "Untitled - Notepad"
        }
      }
    }),
    {
      title: "View State",
      detail: "Read Untitled - Notepad"
    }
  );
});

test("buildOperationStatus falls back to app executable names", () => {
  assert.deepEqual(
    buildOperationStatus("launchApp", {
      app: "C:\\Program Files\\Tencent\\QQNT\\QQ.exe"
    }),
    {
      title: "Launch App",
      detail: "Open or reuse QQ"
    }
  );
});
