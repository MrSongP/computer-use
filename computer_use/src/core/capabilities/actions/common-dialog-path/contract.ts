import type { CommonDialogPathParams } from "../../../../core/contracts/action.js";
import type { WindowRef } from "../../../../core/contracts/window.js";
import {
  ensureNoUnknownKeys,
  ensureNonEmptyString,
  ensureObject,
  ensureWindowRef
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const selectFileInDialogCapability: CapabilityDefinition = {
  method: "select_file_in_dialog",
  summary: "Select an existing local file in a standard Windows dialog.",
  requiresWindowActivation: true
};

export const selectFolderInDialogCapability: CapabilityDefinition = {
  method: "select_folder_in_dialog",
  summary: "Select an existing local folder in a standard Windows dialog.",
  requiresWindowActivation: true
};

export const setSavePathInDialogCapability: CapabilityDefinition = {
  method: "set_save_path_in_dialog",
  summary: "Set a save path in a standard Windows dialog.",
  requiresWindowActivation: true
};

export function validateCommonDialogPathParams(
  params: CommonDialogPathParams,
  method: string
): CommonDialogPathParams {
  const candidate = ensureObject(params, `${method} params are required`);
  ensureNoUnknownKeys(candidate, ["window", "path"], method);
  ensureWindowRef(candidate.window, method);
  return {
    window: candidate.window as WindowRef,
    path: ensureNonEmptyString(candidate.path, `${method} requires a non-empty local path`)
  };
}
