import type {
  ClickElementParams,
  PerformSecondaryActionParams,
  SetValueParams
} from "../../core/contracts/action.js";
import type { WindowActivationService } from "../activation/window-activator.js";
import type { ActivationPlan } from "../activation/activation-strategy.js";
import type { NativeBridge } from "../bridge/native-bridge.js";

export interface ElementActionExecution {
  activation: ActivationPlan;
  elementIndex: number;
  patternAction: string;
}

export class ElementInteractionService {
  constructor(
    private readonly activationService: WindowActivationService,
    private readonly bridge: NativeBridge
  ) {}

  async clickElement(params: ClickElementParams): Promise<ElementActionExecution> {
    assertElementIndex(params.element_index, "click_element");
    const activation = await this.activationService.activate(params.window);
    await this.bridge.clickElement(params);
    return {
      activation,
      elementIndex: params.element_index,
      patternAction: "InvokePattern"
    };
  }

  async setValue(params: SetValueParams): Promise<ElementActionExecution> {
    assertElementIndex(params.element_index, "set_value");
    if (typeof params.value !== "string") {
      throw new Error("set_value requires a string value");
    }

    const activation = await this.activationService.activate(params.window);
    await this.bridge.setValue(params);
    return {
      activation,
      elementIndex: params.element_index,
      patternAction: "ValuePattern"
    };
  }

  async performSecondaryAction(params: PerformSecondaryActionParams): Promise<ElementActionExecution> {
    assertElementIndex(params.element_index, "perform_secondary_action");
    if (typeof params.action !== "string" || params.action.trim().length === 0) {
      throw new Error("perform_secondary_action requires an action string");
    }

    const activation = await this.activationService.activate(params.window);
    await this.bridge.performSecondaryAction({
      ...params,
      action: params.action.trim()
    });
    return {
      activation,
      elementIndex: params.element_index,
      patternAction: params.action.trim()
    };
  }
}

function assertElementIndex(index: number, method: string): void {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`${method} requires a non-negative element_index`);
  }
}
