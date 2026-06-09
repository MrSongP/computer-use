import type { ActivationPlan, PressKeyParams } from "../../core/contracts/action.js";
import type { KeyboardInput } from "../shared/win32-types.js";
import type { WindowActivationService } from "../activation/window-activator.js";
import { parseKeyChord } from "./key-parser.js";

const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;

export interface KeyboardInputPort {
  sendKeyboardInputs(inputs: readonly KeyboardInput[]): Promise<void>;
}

export interface KeyboardInputExecution {
  activation: ActivationPlan;
  key: string;
  normalizedKeys: readonly string[];
  inputEvents: number;
}

export class KeyboardInputService {
  constructor(
    private readonly activationService: WindowActivationService,
    private readonly port: KeyboardInputPort
  ) {}

  async pressKey(params: PressKeyParams): Promise<KeyboardInputExecution> {
    const activation = await this.activationService.activate(params.window);

    const chord = parseKeyChord(params.key);
    const keyDownInputs = chord.keys.map((key) => ({
      key: key.key,
      vkCode: key.vkCode,
      flags: key.isExtended ? KEYEVENTF_EXTENDEDKEY : 0
    }));
    const keyUpInputs = [...chord.keys].reverse().map((key) => ({
      key: key.key,
      vkCode: key.vkCode,
      flags: (key.isExtended ? KEYEVENTF_EXTENDEDKEY : 0) | KEYEVENTF_KEYUP
    }));
    const inputs = [...keyDownInputs, ...keyUpInputs];

    await this.port.sendKeyboardInputs(inputs);
    return {
      activation,
      key: params.key,
      normalizedKeys: chord.keys.map((key) => key.key),
      inputEvents: inputs.length
    };
  }
}
