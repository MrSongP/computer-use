import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createScaffoldRuntime } from "../../src/index.js";

test("select_file_in_dialog validates an existing local file and completes the helper workflow", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "computer-use-dialog-"));
  const filePath = path.join(sandboxDir, "sample.txt");
  await writeFile(filePath, "hello", "utf8");

  try {
    const scaffold = createScaffoldRuntime();
    const response = await scaffold.dispatcher.dispatch({
      id: 31,
      method: "select_file_in_dialog",
      params: {
        window: { id: 101, app: "demo.exe", title: "Open" },
        path: filePath
      }
    });

    assert.deepEqual(response, {
      id: 31,
      ok: true,
      result: {
        ok: true,
        path: filePath,
        helper: "select_file_in_dialog",
        dialogClosed: false
      }
    });
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
});

test("select_file_in_dialog rejects missing local files before interacting with the dialog", async () => {
  const scaffold = createScaffoldRuntime();

  await assert.rejects(
    () => scaffold.dispatcher.dispatch({
      id: 32,
      method: "select_file_in_dialog",
      params: {
        window: { id: 101, app: "demo.exe", title: "Open" },
        path: path.join(tmpdir(), "missing-computer-use-file.txt")
      }
    }),
    /ENOENT/
  );
});
