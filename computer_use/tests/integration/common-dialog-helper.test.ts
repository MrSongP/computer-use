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

test("select_folder_in_dialog validates an existing folder and completes the helper workflow", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "computer-use-dialog-folder-"));

  try {
    const scaffold = createScaffoldRuntime();
    const response = await scaffold.dispatcher.dispatch({
      id: 33,
      method: "select_folder_in_dialog",
      params: {
        window: { id: 102, app: "demo.exe", title: "Select Folder" },
        path: sandboxDir
      }
    });

    assert.deepEqual(response, {
      id: 33,
      ok: true,
      result: {
        ok: true,
        path: sandboxDir,
        helper: "select_folder_in_dialog",
        dialogClosed: false
      }
    });
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
});

test("set_save_path_in_dialog validates the destination parent and completes the helper workflow", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "computer-use-dialog-save-"));
  const savePath = path.join(sandboxDir, "saved.txt");

  try {
    const scaffold = createScaffoldRuntime();
    const response = await scaffold.dispatcher.dispatch({
      id: 34,
      method: "set_save_path_in_dialog",
      params: {
        window: { id: 103, app: "demo.exe", title: "Save As" },
        path: savePath
      }
    });

    assert.deepEqual(response, {
      id: 34,
      ok: true,
      result: {
        ok: true,
        path: savePath,
        helper: "set_save_path_in_dialog",
        dialogClosed: false
      }
    });
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
});
