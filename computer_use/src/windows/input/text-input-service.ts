import type { TypeTextParams } from "../../core/contracts/action.js";
import type { KeyboardInput } from "../shared/win32-types.js";
import type { WindowActivationService } from "../activation/window-activator.js";

const KEYEVENTF_UNICODE = 0x0004;
const KEYEVENTF_KEYUP = 0x0002;

export interface TextInputPort {
  sendKeyboardInputs(inputs: readonly KeyboardInput[]): Promise<void>;
}

export class TextInputService {
  constructor(
    private readonly activationService: WindowActivationService,
    private readonly port: TextInputPort
  ) {}

  async typeText(params: TypeTextParams): Promise<void> {
    await this.activationService.activate(params.window);

    const inputs: KeyboardInput[] = [];
    for (const symbol of params.text) {
      for (const scanCode of toUtf16CodeUnits(symbol)) {
        inputs.push({
          key: symbol,
          vkCode: 0,
          scanCode,
          flags: KEYEVENTF_UNICODE
        });
        inputs.push({
          key: symbol,
          vkCode: 0,
          scanCode,
          flags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
        });
      }
    }

    await this.port.sendKeyboardInputs(inputs);
  }
}

function toUtf16CodeUnits(symbol: string): readonly number[] {
  return Array.from({ length: symbol.length }, (_, index) => symbol.charCodeAt(index));
}
