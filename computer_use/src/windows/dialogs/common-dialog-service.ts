import { access, stat } from "node:fs/promises";
import path from "node:path";
import type {
  CommonDialogPathParams,
  CommonDialogPathResult
} from "../../core/contracts/action.js";
import type { NativeBridge } from "../bridge/native-bridge.js";
import { WindowActivationService } from "../activation/window-activator.js";
import { KeyboardInputService } from "../input/keyboard-input-service.js";
import { TextInputService } from "../input/text-input-service.js";

export type CommonDialogHelper =
  | "select_file_in_dialog"
  | "select_folder_in_dialog"
  | "set_save_path_in_dialog";

const DIALOG_CLOSE_TIMEOUT_MS = 800;
const DIALOG_CLOSE_POLL_INTERVAL_MS = 50;

export class CommonDialogService {
  constructor(private readonly bridge: NativeBridge) {}

  async selectFile(params: CommonDialogPathParams): Promise<CommonDialogPathResult> {
    await assertExistingPath(params.path, "file");
    return this.completeDialog(params, "select_file_in_dialog");
  }

  async selectFolder(params: CommonDialogPathParams): Promise<CommonDialogPathResult> {
    await assertExistingPath(params.path, "directory");
    return this.completeDialog(params, "select_folder_in_dialog");
  }

  async setSavePath(params: CommonDialogPathParams): Promise<CommonDialogPathResult> {
    const parent = path.dirname(params.path);
    await assertExistingPath(parent, "directory");
    return this.completeDialog(params, "set_save_path_in_dialog");
  }

  private async completeDialog(
    params: CommonDialogPathParams,
    helper: CommonDialogHelper
  ): Promise<CommonDialogPathResult> {
    const activation = new WindowActivationService(this.bridge);
    const keyboard = new KeyboardInputService(activation, this.bridge);
    const text = new TextInputService(activation, this.bridge);

    await keyboard.pressKey({ window: params.window, key: "Alt+N" });
    await text.typeText({ window: params.window, text: params.path });
    await keyboard.pressKey({ window: params.window, key: "Return" });

    return {
      ok: true,
      path: params.path,
      helper,
      dialogClosed: await this.didDialogClose(params.window.id)
    };
  }

  private async didDialogClose(id: number): Promise<boolean | null> {
    const deadline = Date.now() + DIALOG_CLOSE_TIMEOUT_MS;
    let observedOpen = false;

    do {
      try {
        await this.bridge.getWindow({ id });
        observedOpen = true;
      } catch {
        return true;
      }
      await sleep(DIALOG_CLOSE_POLL_INTERVAL_MS);
    } while (Date.now() < deadline);

    return observedOpen ? false : null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function assertExistingPath(value: string, expected: "file" | "directory"): Promise<void> {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("common dialog helper requires a non-empty local path");
  }

  await access(value);
  const info = await stat(value);
  if (expected === "file" && !info.isFile()) {
    throw new Error(`Expected an existing file path: ${value}`);
  }
  if (expected === "directory" && !info.isDirectory()) {
    throw new Error(`Expected an existing folder path: ${value}`);
  }
}
