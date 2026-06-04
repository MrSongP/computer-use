import test from "node:test";
import assert from "node:assert/strict";
import {
  NativeHostBridge,
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
  assert.equal((bridge as any).fallbackActive, true);
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
        app: "C:\\Program Files\\Tencent\\QQNT\\QQ.exe",
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
      app: "C:\\Program Files\\Tencent\\QQNT\\QQ.exe"
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
        app: "C:\\Program Files\\Tencent\\QQNT\\QQ.exe"
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
        app: "C:\\Program Files\\Tencent\\QQNT\\QQ.exe"
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
    partial: true
  });
});

test("NativeHostBridge clears turnStarted when the host process is disposed", () => {
  const bridge = new NativeHostBridge({
    fallback: new NullNativeBridge()
  });

  (bridge as any).turnStarted = true;
  (bridge as any).disposeHostProcess();

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
