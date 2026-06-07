import type {
  CommonDialogPathParams,
  CommonDialogPathResult
} from "../../../../core/contracts/action.js";
import type { JsonRpcRequest, JsonRpcResponse } from "../../../../core/contracts/rpc.js";
import type { ExecutionContext } from "../../../../core/runtime/execution-context.js";
import { CommonDialogService, type CommonDialogHelper } from "../../../../windows/dialogs/common-dialog-service.js";
import {
  selectFileInDialogCapability,
  selectFolderInDialogCapability,
  setSavePathInDialogCapability,
  validateCommonDialogPathParams
} from "./contract.js";

type CommonDialogCapability =
  | typeof selectFileInDialogCapability
  | typeof selectFolderInDialogCapability
  | typeof setSavePathInDialogCapability;

export class CommonDialogPathHandler {
  readonly definition: CommonDialogCapability;
  private readonly helper: CommonDialogHelper;

  constructor(
    private readonly context: ExecutionContext,
    method: CommonDialogHelper
  ) {
    this.helper = method;
    this.definition = resolveDefinition(method);
  }

  async handle(request: JsonRpcRequest<CommonDialogPathParams>): Promise<JsonRpcResponse<CommonDialogPathResult>> {
    return this.context.trace.runAction({
      actionType: this.definition.method,
      request,
      execute: async (trace) => {
        const interruptError = this.context.endTurn.check(request.meta);
        if (interruptError) {
          return { id: request.id, ok: false, code: "interrupted", error: interruptError };
        }

        const params = validateCommonDialogPathParams(request.params, this.definition.method);
        trace.setInputParams({ ...params, path: params.path });
        trace.setTargetWindow(params.window);

        this.context.endTurn.begin(request.meta);
        const service = new CommonDialogService(this.context.nativeBridge);
        const result = await runHelper(service, this.helper, params);
        await trace.writeJsonArtifact("common-dialog", "common-dialog-helper.json", result);

        return {
          id: request.id,
          ok: true,
          result
        };
      }
    });
  }
}

function resolveDefinition(method: CommonDialogHelper): CommonDialogCapability {
  switch (method) {
    case "select_file_in_dialog":
      return selectFileInDialogCapability;
    case "select_folder_in_dialog":
      return selectFolderInDialogCapability;
    case "set_save_path_in_dialog":
      return setSavePathInDialogCapability;
  }
}

async function runHelper(
  service: CommonDialogService,
  method: CommonDialogHelper,
  params: CommonDialogPathParams
): Promise<CommonDialogPathResult> {
  switch (method) {
    case "select_file_in_dialog":
      return service.selectFile(params);
    case "select_folder_in_dialog":
      return service.selectFolder(params);
    case "set_save_path_in_dialog":
      return service.setSavePath(params);
  }
}
