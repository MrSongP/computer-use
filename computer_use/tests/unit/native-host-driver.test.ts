import test from "node:test";
import assert from "node:assert/strict";
import { NativeHostBridge } from "../../src/windows/bridge/native-host-driver.js";
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
