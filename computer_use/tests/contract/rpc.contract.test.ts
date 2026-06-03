import test from "node:test";
import assert from "node:assert/strict";
import { JsonRpcCodec } from "../../src/core/transport/json-rpc.js";

test("JsonRpcCodec parses and serializes action requests", () => {
  const codec = new JsonRpcCodec();
  const request = codec.parseRequest(
    JSON.stringify({
      id: 1,
      method: "click",
      params: { window: { id: 1, app: "demo.exe" }, x: 20, y: 40 }
    })
  );

  assert.equal(request.method, "click");
  assert.equal(codec.stringifyResponse({ id: 1, ok: true, result: null }), "{\"id\":1,\"ok\":true,\"result\":null}");
});

test("JsonRpcCodec rejects malformed requests", () => {
  const codec = new JsonRpcCodec();
  assert.throws(() => codec.parseRequest(JSON.stringify({ method: "click", params: {} })));
});
