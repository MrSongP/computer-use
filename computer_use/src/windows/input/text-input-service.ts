import type { ActivationPlan, TypeTextParams } from "../../core/contracts/action.js";
import type { KeyboardInput } from "../shared/win32-types.js";
import type { WindowActivationService } from "../activation/window-activator.js";

const KEYEVENTF_UNICODE = 0x0004;
const KEYEVENTF_KEYUP = 0x0002;

export interface TextInputPort {
  sendText?(text: string): Promise<void>;
  sendKeyboardInputs(inputs: readonly KeyboardInput[]): Promise<void>;
}

export interface TextInputExecution {
  activation: ActivationPlan;
  inputMethod: "sendText" | "unicodeKeyboardInputs";
  textLength: number;
  utf16CodeUnits: number;
  inputEvents?: number;
  fallbackFromSendText?: boolean;
}

export class TextInputService {
  constructor(
    private readonly activationService: WindowActivationService,
    private readonly port: TextInputPort
  ) {}

  async typeText(params: TypeTextParams): Promise<TextInputExecution> {
    const activation = await this.activationService.activate(params.window);

    if (typeof this.port.sendText === "function") {
      try {
        await this.port.sendText(params.text);
        return {
          activation,
          inputMethod: "sendText",
          textLength: Array.from(params.text).length,
          utf16CodeUnits: params.text.length
        };
      } catch {
        // Fall back to Unicode keystrokes when direct text injection is unavailable.
      }
    }

    const inputs = buildUnicodeKeyboardInputs(params.text);
    await this.port.sendKeyboardInputs(inputs);
    return {
      activation,
      inputMethod: "unicodeKeyboardInputs",
      textLength: Array.from(params.text).length,
      utf16CodeUnits: params.text.length,
      inputEvents: inputs.length,
      fallbackFromSendText: typeof this.port.sendText === "function" ? true : undefined
    };
  }
}

function buildUnicodeKeyboardInputs(text: string): KeyboardInput[] {
  const inputs: KeyboardInput[] = [];
  for (const symbol of text) {
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

  return inputs;
}

function toUtf16CodeUnits(symbol: string): readonly number[] {
  return Array.from({ length: symbol.length }, (_, index) => symbol.charCodeAt(index));
}
