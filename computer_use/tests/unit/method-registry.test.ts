import test from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_METHODS, MethodRegistry } from "../../src/core/dispatcher/method-registry.js";

test("MethodRegistry stores and lists action handlers", () => {
  const registry = new MethodRegistry();
  registry.register("click", async (request) => ({ id: request.id, ok: true, result: null }));
  registry.register("type_text", async (request) => ({ id: request.id, ok: true, result: null }));

  assert.deepEqual(registry.list(), ["click", "type_text"]);
  assert.ok(registry.get("click"));
  assert.equal(registry.get("press_key"), undefined);
});

test("MethodRegistry reserves built-in lifecycle methods", () => {
  const registry = new MethodRegistry();

  for (const method of BUILT_IN_METHODS) {
    assert.equal(registry.has(method), true);
    assert.throws(
      () => registry.register(method, async (request) => ({ id: request.id, ok: true, result: null })),
      new RegExp(`Cannot override built-in method: ${method}`)
    );
  }
});
