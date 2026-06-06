import test from "node:test";
import assert from "node:assert/strict";
import {
  NativeHostBridge,
  NativeHostBuildError,
  NativeHostTransportError
} from "../../src/windows/bridge/native-host-driver.js";
import { NullNativeBridge } from "../../src/windows/bridge/null-driver.js";

test("NativeHostBridge times out hung requests and falls back instead of hanging forever", async () => {
  const fallback = new NullNativeBridge();
  const bridge = new NativeHostBridge({
    fallback,
    requestTimeoutMs: 20
  });
  const fakeChild = createHungChild();
  (bridge as any).hostProcess = fakeChild;
  (bridge as any).ensureHostProcess = async () => fakeChild;
  (bridge as any).ensureTurnStarted = async () => {};

  const windows = await bridge.listWindows();

  assert.deepEqual(windows, [{ id: 101, app: "demo.exe", title: "Demo Window" }]);
  assert.equal(fakeChild.killCalled, true);
  assert.equal((bridge as any).fallbackActive, false);
});

test("NativeHostBridge retries native-host after a per-call transport fallback", async () => {
  const fallback = new NullNativeBridge();
  const bridge = new NativeHostBridge({
    fallback,
    requestTimeoutMs: 20
  });
  let primaryCalls = 0;

  (bridge as any).invokePrimaryResult = async () => {
    primaryCalls += 1;
    if (primaryCalls === 1) {
      throw new NativeHostTransportError(
        "Timed out waiting 20ms for native host response to 'listWindows'."
      );
    }

    return [{ id: 202, app: "native.exe", title: "Native Window" }];
  };

  assert.deepEqual(await bridge.listWindows(), [
    { id: 101, app: "demo.exe", title: "Demo Window" }
  ]);
  assert.equal((bridge as any).fallbackActive, false);
  assert.deepEqual(await bridge.listWindows(), [
    { id: 202, app: "native.exe", title: "Native Window" }
  ]);
  assert.equal(primaryCalls, 2);
});

test("NativeHostBridge keeps fallback active after a native-host build failure", async () => {
  const bridge = new NativeHostBridge({
    fallback: new NullNativeBridge(),
    requestTimeoutMs: 20
  });
  let primaryCalls = 0;

  (bridge as any).invokePrimaryResult = async () => {
    primaryCalls += 1;
    throw new NativeHostBuildError("Failed to build the native host: dotnet missing");
  };

  assert.deepEqual(await bridge.listWindows(), [
    { id: 101, app: "demo.exe", title: "Demo Window" }
  ]);
  assert.equal((bridge as any).fallbackActive, true);
  assert.deepEqual(await bridge.listWindows(), [
    { id: 101, app: "demo.exe", title: "Demo Window" }
  ]);
  assert.equal(primaryCalls, 1);
});

test("NativeHostBridge closes a temporary fallback turn on endTurn", async () => {
  const fallback = new NullNativeBridge();
  const bridge = new NativeHostBridge({
    fallback,
    requestTimeoutMs: 20
  });

  (bridge as any).invokePrimaryResult = async () => {
    throw new NativeHostTransportError(
      "Timed out waiting 20ms for native host response to 'listWindows'."
    );
  };

  await bridge.listWindows();
  bridge.endTurn();
  await waitFor(() => fallback.getRecordedInvocations().some((entry) => entry.name === "endTurn"));

  assert.deepEqual(
    fallback.getRecordedInvocations().map((entry) => entry.name),
    ["beginTurn", "listWindows", "endTurn"]
  );
});

test("NativeHostBridge reports the native-host timeout cause when fallback also fails", async () => {
  class FailingFallbackBridge extends NullNativeBridge {
    override async listWindows(): Promise<readonly { id: number; app: string; title?: string }[]> {
      throw new Error("fallback list failure");
    }
  }

  const bridge = new NativeHostBridge({
    fallback: new FailingFallbackBridge(),
    requestTimeoutMs: 20
  });
  const fakeChild = createHungChild();
  (bridge as any).hostProcess = fakeChild;
  (bridge as any).ensureHostProcess = async () => fakeChild;
  (bridge as any).ensureTurnStarted = async () => {};

  await assert.rejects(
    () => bridge.listWindows(),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.match((error as Error).message, /Timed out waiting 20ms/);
      assert.match((error as Error).message, /Fallback failed: fallback list failure/);
      return true;
    }
  );
});

test("NativeHostBridge disposes the native-host process after endTurn flushes", async () => {
  const bridge = new NativeHostBridge({
    fallback: new NullNativeBridge()
  });
  const fakeChild = createHungChild();
  const methods: string[] = [];

  (bridge as any).hostProcess = fakeChild;
  (bridge as any).turnStarted = true;
  (bridge as any).invokeHost = async (method: string) => {
    methods.push(method);
  };

  bridge.endTurn();
  await waitFor(() => fakeChild.killCalled);

  assert.deepEqual(methods, ["endTurn"]);
  assert.equal(fakeChild.killCalled, true);
  assert.equal((bridge as any).hostProcess, undefined);
});

test("NativeHostBridge retries getWindowState without text after a native-host timeout", async () => {
  const bridge = new NativeHostBridge({
    fallback: new NullNativeBridge()
  });
  const methods: Array<{ method: string; payload: Record<string, unknown> }> = [];
  let invocationCount = 0;

  (bridge as any).invokePrimaryResult = async (method: string, payload: Record<string, unknown>) => {
    methods.push({ method, payload });
    invocationCount += 1;

    if (invocationCount === 1) {
      throw new NativeHostTransportError(
        "Timed out waiting 20000ms for native host response to 'getWindowState'."
      );
    }

    return {
      window: {
        id: 68946,
        app: "C:\\Windows\\System32\\notepad.exe",
        rect: { left: 0, top: 0, right: 640, bottom: 480 },
        visible: true,
        minimized: false,
        focused: true
      },
      capture: {
        screenshotRequested: false,
        textRequested: false
      }
    };
  };

  const result = await bridge.getWindowState({
    window: {
      id: 68946,
      app: "C:\\Windows\\System32\\notepad.exe"
    },
    include_screenshot: false,
    include_text: true,
    max_elements: 20
  });

  assert.equal(methods.length, 2);
  assert.deepEqual(methods[0]?.payload, {
    params: {
      window: {
        id: 68946,
        app: "C:\\Windows\\System32\\notepad.exe"
      },
      include_screenshot: false,
      include_text: true,
      max_elements: 20
    },
    meta: null
  });
  assert.deepEqual(methods[1]?.payload, {
    params: {
      window: {
        id: 68946,
        app: "C:\\Windows\\System32\\notepad.exe"
      },
      include_screenshot: false,
      include_text: false,
      max_elements: 20
    },
    meta: null
  });
  assert.deepEqual(result.capture, {
    screenshotRequested: false,
    textRequested: true,
    textSource: "uia_timeout",
    elementsReturned: 0,
    elementsTotal: 0,
    elementsMatched: 0,
    truncated: false,
    partial: true,
    degradedReasons: ["uia_timeout"]
  });
});

test("NativeHostBridge blocks risky Chromium IM UIA text requests before native traversal", async () => {
  const bridge = new NativeHostBridge({
    fallback: new NullNativeBridge()
  });
  const methods: Array<{ method: string; payload: Record<string, unknown> }> = [];

  (bridge as any).invokePrimaryResult = async (method: string, payload: Record<string, unknown>) => {
    methods.push({ method, payload });
    return {
      window: {
        id: 68946,
        app: "D:\\QQ\\QQ.exe",
        rect: { left: -2167, top: 300, right: -717, bottom: 1371 },
        visible: true,
        minimized: false,
        focused: true
      },
      screenshot: {
        data: "jpeg",
        mime: "image/jpeg",
        width: 1450,
        height: 1071,
        byteLength: 4,
        source: "wgc"
      },
      capture: {
        screenshotRequested: true,
        textRequested: false,
        screenshotSource: "wgc"
      }
    };
  };

  const result = await bridge.getWindowState({
    window: {
      id: 68946,
      app: "D:\\QQ\\QQ.exe"
    },
    include_screenshot: true,
    include_text: true,
    max_elements: 300,
    name_contains: "Desperate"
  });

  assert.equal(methods.length, 1);
  assert.deepEqual(methods[0]?.payload, {
    params: {
      window: {
        id: 68946,
        app: "D:\\QQ\\QQ.exe"
      },
      include_screenshot: true,
      include_text: false,
      max_elements: 300,
      name_contains: "Desperate"
    },
    meta: null
  });
  assert.equal(result.text, undefined);
  assert.equal(result.capture.textRequested, true);
  assert.equal(result.capture.textSource, "uia_blocked_chromium_im");
  assert.deepEqual(result.capture.degradedReasons, ["uia_blocked_chromium_im"]);
  assert.equal(result.capture.elementsReturned, 0);
  assert.equal(result.screenshot?.source, "wgc");
});

test("NativeHostBridge preserves normal UIA text requests for non-risky apps", async () => {
  const bridge = new NativeHostBridge({
    fallback: new NullNativeBridge()
  });
  const methods: Array<{ method: string; payload: Record<string, unknown> }> = [];

  (bridge as any).invokePrimaryResult = async (method: string, payload: Record<string, unknown>) => {
    methods.push({ method, payload });
    return {
      window: {
        id: 123,
        app: "C:\\Windows\\System32\\notepad.exe",
        rect: { left: 0, top: 0, right: 640, bottom: 480 },
        visible: true,
        minimized: false,
        focused: true
      },
      text: {
        index: 0,
        role: "Window",
        name: "Notepad",
        children: []
      },
      capture: {
        screenshotRequested: false,
        textRequested: true,
        textSource: "uia",
        elementsReturned: 1,
        elementsTotal: 1,
        elementsMatched: 1
      }
    };
  };

  const result = await bridge.getWindowState({
    window: {
      id: 123,
      app: "C:\\Windows\\System32\\notepad.exe"
    },
    include_screenshot: false,
    include_text: true
  });

  assert.equal(methods.length, 1);
  assert.deepEqual((methods[0]?.payload as any).params.include_text, true);
  assert.equal(result.capture.textSource, "uia");
  assert.equal(result.text?.name, "Notepad");
});

test("NativeHostBridge preserves WGC degradation diagnostics from native-host window state", async () => {
  const bridge = new NativeHostBridge({
    fallback: new NullNativeBridge()
  });

  (bridge as any).invokePrimaryResult = async () => ({
    window: {
      id: 68946,
      app: "C:\\Program Files\\Tencent\\QQNT\\QQ.exe",
      rect: { left: 0, top: 0, right: 640, bottom: 480 },
      visible: true,
      minimized: false,
      focused: false,
      health: {
        hung: true,
        isResponding: false,
        lastInputIdleMs: 1234
      }
    },
    screenshot: {
      data: "jpeg",
      mime: "image/jpeg",
      width: 640,
      height: 480,
      byteLength: 4,
      source: "gdi_fallback",
      degradedReason: "wgc_failed",
      gdiFallbackAt: "2026-06-06T00:00:00.000Z"
    },
    capture: {
      screenshotRequested: true,
      textRequested: false,
      screenshotSource: "gdi_fallback",
      screenshotDegradedReason: "wgc_failed",
      degradedReasons: ["wgc_failed"]
    }
  });

  const result = await bridge.getWindowState({
    window: {
      id: 68946,
      app: "C:\\Windows\\System32\\notepad.exe"
    },
    include_screenshot: true,
    include_text: false
  });

  assert.equal(result.window.health?.hung, true);
  assert.equal(result.screenshot?.source, "gdi_fallback");
  assert.equal(result.screenshot?.degradedReason, "wgc_failed");
  assert.equal(result.screenshot?.gdiFallbackAt, "2026-06-06T00:00:00.000Z");
  assert.deepEqual(result.capture.degradedReasons, ["wgc_failed"]);
  assert.equal(result.capture.screenshotDegradedReason, "wgc_failed");
});

test("NativeHostBridge clears turnStarted when the host process is disposed", () => {
  const bridge = new NativeHostBridge({
    fallback: new NullNativeBridge()
  });

  (bridge as any).turnStarted = true;
  (bridge as any).disposeHostProcess();

  assert.equal((bridge as any).turnStarted, false);
});

test("NativeHostBridge resetTurn immediately disposes the host process", () => {
  const bridge = new NativeHostBridge({
    fallback: new NullNativeBridge()
  });
  const fakeChild = createHungChild();

  (bridge as any).hostProcess = fakeChild;
  (bridge as any).currentTurnMeta = {
    codexTurnMetadata: {
      session_id: "session-reset",
      turn_id: "turn-reset"
    }
  };
  (bridge as any).turnStarted = true;

  bridge.resetTurn("interrupted");

  assert.equal(fakeChild.killCalled, true);
  assert.equal((bridge as any).hostProcess, undefined);
  assert.equal((bridge as any).currentTurnMeta, undefined);
  assert.equal((bridge as any).turnStarted, false);
});

function createHungChild() {
  return {
    killed: false,
    killCalled: false,
    stdin: {
      write(_chunk: string, _encoding: BufferEncoding, callback?: (error?: Error | null) => void) {
        callback?.(null);
        return true;
      }
    },
    kill() {
      this.killCalled = true;
      this.killed = true;
      return true;
    }
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.fail("condition was not met in time");
}
