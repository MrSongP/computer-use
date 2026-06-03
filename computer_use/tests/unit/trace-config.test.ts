import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveTraceOptions } from "../../src/core/trace/trace-config.js";

test("resolveTraceOptions honors env, config, and request meta precedence", () => {
  const env = {
    COMPUTER_USE_TRACE: "1",
    COMPUTER_USE_TRACE_DIR: "C:\\trace-from-env"
  } as NodeJS.ProcessEnv;

  const fromEnv = resolveTraceOptions({
    env,
    cwd: "C:\\workspace\\computer_use"
  });
  assert.equal(fromEnv.enabled, true);
  assert.equal(fromEnv.enabledSource, "env");
  assert.equal(fromEnv.outputDir, path.resolve("C:\\trace-from-env"));
  assert.equal(fromEnv.outputDirSource, "env");

  const fromConfig = resolveTraceOptions({
    env,
    cwd: "C:\\workspace\\computer_use",
    config: {
      enabled: false,
      outputDir: "C:\\trace-from-config"
    }
  });
  assert.equal(fromConfig.enabled, false);
  assert.equal(fromConfig.enabledSource, "config");
  assert.equal(fromConfig.outputDir, path.resolve("C:\\trace-from-config"));
  assert.equal(fromConfig.outputDirSource, "config");

  const fromMeta = resolveTraceOptions({
    env,
    cwd: "C:\\workspace\\computer_use",
    config: {
      enabled: false,
      outputDir: "C:\\trace-from-config"
    },
    meta: {
      computerUseTrace: {
        enabled: true,
        outputDir: "C:\\trace-from-meta"
      }
    }
  });
  assert.equal(fromMeta.enabled, true);
  assert.equal(fromMeta.enabledSource, "request_meta");
  assert.equal(fromMeta.outputDir, path.resolve("C:\\trace-from-meta"));
  assert.equal(fromMeta.outputDirSource, "request_meta");
});

test("resolveTraceOptions falls back to a workspace-local default when unset", () => {
  const resolved = resolveTraceOptions({
    env: {},
    cwd: "C:\\workspace\\computer_use"
  });

  assert.equal(resolved.enabled, false);
  assert.equal(resolved.enabledSource, "default");
  assert.equal(
    resolved.outputDir,
    path.join("C:\\workspace\\computer_use", ".artifacts", "computer-use-trace")
  );
  assert.equal(resolved.outputDirSource, "default");
});
