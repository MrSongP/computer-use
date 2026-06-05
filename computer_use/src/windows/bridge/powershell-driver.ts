import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { JsonRpcMeta } from "../../core/contracts/rpc.js";
import type { AppDescriptor, AppIdentifier } from "../../core/contracts/app.js";
import type { WindowStateParams, WindowStateResult } from "../../core/contracts/capture.js";
import type { GetWindowParams } from "../../core/contracts/discovery.js";
import type {
  ActivateWindowResult,
  ClickElementParams,
  PerformSecondaryActionParams,
  SetValueParams
} from "../../core/contracts/action.js";
import type { WindowRef } from "../../core/contracts/window.js";
import { resolveVirtualScreenMetrics, type VirtualScreenMetrics } from "../input/pointer-primitives.js";
import type { PointerClickFeedback, PointerClickOptions } from "../input/pointer-input-service.js";
import type { KeyboardInput, PointerClick, PointerDrag, PointerScroll } from "../shared/win32-types.js";
import type { NativeAppLaunchOptions, NativeBridge } from "./native-bridge.js";

const execFileAsync = promisify(execFile);
let powerShellScriptPathPromise: Promise<string> | undefined;

const POWERSHELL_TYPE_DEFINITION = String.raw`
using System;
using System.Runtime.InteropServices;

namespace ComputerUse {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public Int32 x;
    public Int32 y;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public UInt16 wVk;
    public UInt16 wScan;
    public UInt32 dwFlags;
    public UInt32 time;
    public UIntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public Int32 dx;
    public Int32 dy;
    public UInt32 mouseData;
    public UInt32 dwFlags;
    public UInt32 time;
    public UIntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct INPUTUNION {
    [FieldOffset(0)] public KEYBDINPUT ki;
    [FieldOffset(0)] public MOUSEINPUT mi;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public UInt32 type;
    public INPUTUNION U;
  }

  public static class Win32 {
    public const UInt32 INPUT_MOUSE = 0;
    public const UInt32 INPUT_KEYBOARD = 1;
    public const UInt32 KEYEVENTF_KEYUP = 0x0002;
    public const UInt32 MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const UInt32 MOUSEEVENTF_LEFTUP = 0x0004;
    public const UInt32 MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const UInt32 MOUSEEVENTF_RIGHTUP = 0x0010;
    public const UInt32 MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    public const UInt32 MOUSEEVENTF_MIDDLEUP = 0x0040;

    [DllImport("user32.dll", SetLastError = true)]
    public static extern UInt32 SendInput(UInt32 cInputs, INPUT[] pInputs, Int32 cbSize);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern Boolean IsWindow(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern Boolean IsIconic(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern Boolean ShowWindow(IntPtr hWnd, Int32 nCmdShow);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern Boolean BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern Boolean SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetFocus(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern void keybd_event(Byte bVk, Byte bScan, UInt32 dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern Boolean GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern Boolean SetCursorPos(Int32 x, Int32 y);
  }
}
`;

const POWERSHELL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'

if (-not ('ComputerUse.Win32' -as [type])) {
  Add-Type -TypeDefinition @'
${POWERSHELL_TYPE_DEFINITION}
'@
}

function Get-LastErrorCode {
  return [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
}

function New-KeyboardInput([UInt16]$vkCode, [UInt16]$scanCode, [UInt32]$flags) {
  $input = New-Object ComputerUse.INPUT
  $input.type = [ComputerUse.Win32]::INPUT_KEYBOARD
  $input.U = New-Object ComputerUse.INPUTUNION
  $input.U.ki = New-Object ComputerUse.KEYBDINPUT
  $input.U.ki.wVk = $vkCode
  $input.U.ki.wScan = $scanCode
  $input.U.ki.dwFlags = $flags
  $input.U.ki.time = 0
  $input.U.ki.dwExtraInfo = [UIntPtr]::Zero
  return $input
}

function New-MouseInput([UInt32]$flags) {
  $input = New-Object ComputerUse.INPUT
  $input.type = [ComputerUse.Win32]::INPUT_MOUSE
  $input.U = New-Object ComputerUse.INPUTUNION
  $input.U.mi = New-Object ComputerUse.MOUSEINPUT
  $input.U.mi.dx = 0
  $input.U.mi.dy = 0
  $input.U.mi.mouseData = 0
  $input.U.mi.dwFlags = $flags
  $input.U.mi.time = 0
  $input.U.mi.dwExtraInfo = [UIntPtr]::Zero
  return $input
}

function Invoke-SendInput([ComputerUse.INPUT[]]$inputs) {
  if ($inputs.Length -eq 0) {
    return
  }

  $inputSize = [System.Runtime.InteropServices.Marshal]::SizeOf([type][ComputerUse.INPUT])
  $result = [ComputerUse.Win32]::SendInput([UInt32]$inputs.Length, $inputs, $inputSize)
  if ($result -ne $inputs.Length) {
    throw "SendInput failed with Win32 error $(Get-LastErrorCode) after sending $result of $($inputs.Length) inputs."
  }
}

function Invoke-PasteShortcut {
  $ctrlDown = New-KeyboardInput ([UInt16]0x11) ([UInt16]0) ([UInt32]0)
  $vDown = New-KeyboardInput ([UInt16]0x56) ([UInt16]0) ([UInt32]0)
  $vUp = New-KeyboardInput ([UInt16]0x56) ([UInt16]0) ([UInt32][ComputerUse.Win32]::KEYEVENTF_KEYUP)
  $ctrlUp = New-KeyboardInput ([UInt16]0x11) ([UInt16]0) ([UInt32][ComputerUse.Win32]::KEYEVENTF_KEYUP)
  Invoke-SendInput @($ctrlDown, $vDown, $vUp, $ctrlUp)
}

function Invoke-SendText([string]$text) {
  $previousText = $null
  $hadPreviousText = $false

  try {
    $clipboardValue = Get-Clipboard -Raw
    if ($clipboardValue -is [string]) {
      $previousText = $clipboardValue
      $hadPreviousText = $true
    }
  } catch {
  }

  try {
    Set-Clipboard -Value $text
    Start-Sleep -Milliseconds 20
    Invoke-PasteShortcut
    Start-Sleep -Milliseconds 20
  } finally {
    if ($hadPreviousText) {
      try {
        Set-Clipboard -Value $previousText
      } catch {
      }
    }
  }
}

function Test-IsForegroundWindow([IntPtr]$hwnd) {
  if ($hwnd -eq [IntPtr]::Zero) {
    return $false
  }

  $foreground = [ComputerUse.Win32]::GetForegroundWindow()
  return $foreground -ne [IntPtr]::Zero -and $foreground.ToInt64() -eq $hwnd.ToInt64()
}

function Invoke-EscapeUnlock {
  [ComputerUse.Win32]::keybd_event(0x1B, 0, 0, [UIntPtr]::Zero)
  [ComputerUse.Win32]::keybd_event(0x1B, 0, [ComputerUse.Win32]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

function Invoke-AltUnlock {
  $altDown = New-KeyboardInput ([UInt16]0x12) ([UInt16]0) ([UInt32]0)
  $altUp = New-KeyboardInput ([UInt16]0x12) ([UInt16]0) ([UInt32][ComputerUse.Win32]::KEYEVENTF_KEYUP)
  Invoke-SendInput @($altDown, $altUp)
}

function Invoke-ForceForeground([IntPtr]$hwnd) {
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (Test-IsForegroundWindow $hwnd) {
      return $true
    }

    [ComputerUse.Win32]::BringWindowToTop($hwnd) | Out-Null
    [ComputerUse.Win32]::SetForegroundWindow($hwnd) | Out-Null
    [ComputerUse.Win32]::SetFocus($hwnd) | Out-Null
    Start-Sleep -Milliseconds 50

    if (Test-IsForegroundWindow $hwnd) {
      return $true
    }

    Invoke-AltUnlock
    [ComputerUse.Win32]::SetForegroundWindow($hwnd) | Out-Null
    [ComputerUse.Win32]::SetFocus($hwnd) | Out-Null
    Start-Sleep -Milliseconds 50
  }

  return $false
}

function Move-CursorHumanized([Int32]$targetX, [Int32]$targetY) {
  $start = New-Object ComputerUse.POINT
  if (-not [ComputerUse.Win32]::GetCursorPos([ref]$start)) {
    if (-not [ComputerUse.Win32]::SetCursorPos($targetX, $targetY)) {
      throw "SetCursorPos failed with Win32 error $(Get-LastErrorCode)."
    }
    Start-Sleep -Milliseconds 18
    return
  }

  $deltaX = [double]($targetX - $start.x)
  $deltaY = [double]($targetY - $start.y)
  $distance = [Math]::Sqrt(($deltaX * $deltaX) + ($deltaY * $deltaY))
  if ($distance -lt 2.0) {
    if (-not [ComputerUse.Win32]::SetCursorPos($targetX, $targetY)) {
      throw "SetCursorPos failed with Win32 error $(Get-LastErrorCode)."
    }
    Start-Sleep -Milliseconds 18
    return
  }

  $steps = [int][Math]::Max(6, [Math]::Min(30, [Math]::Ceiling($distance / 22.0)))
  $durationMs = [int][Math]::Max(90, [Math]::Min(220, [Math]::Round(80.0 + ($distance * 0.35))))
  $stepDelayMs = [int][Math]::Max(4, [Math]::Floor($durationMs / $steps))
  $arcHeight = if ($distance -lt 24.0) { 0.0 } else { [Math]::Min(36.0, $distance * 0.12) }
  $perpendicularX = (-1.0 * $deltaY) / $distance
  $perpendicularY = $deltaX / $distance
  $curveDirection = if (($deltaX -ge 0.0 -and $deltaY -ge 0.0) -or ($deltaX -lt 0.0 -and $deltaY -lt 0.0)) {
    1.0
  } else {
    -1.0
  }

  for ($step = 1; $step -le $steps; $step++) {
    $t = $step / [double]$steps
    $eased = 0.5 - ([Math]::Cos([Math]::PI * $t) / 2.0)
    $arc = [Math]::Sin([Math]::PI * $t) * $arcHeight * $curveDirection
    $nextX = [int][Math]::Round($start.x + ($deltaX * $eased) + ($perpendicularX * $arc))
    $nextY = [int][Math]::Round($start.y + ($deltaY * $eased) + ($perpendicularY * $arc))
    if (-not [ComputerUse.Win32]::SetCursorPos($nextX, $nextY)) {
      throw "SetCursorPos failed with Win32 error $(Get-LastErrorCode)."
    }
    Start-Sleep -Milliseconds $stepDelayMs
  }

  if (-not [ComputerUse.Win32]::SetCursorPos($targetX, $targetY)) {
    throw "SetCursorPos failed with Win32 error $(Get-LastErrorCode)."
  }
  Start-Sleep -Milliseconds 18
}

$payload = $env:COMPUTER_USE_PAYLOAD | ConvertFrom-Json -Depth 10

switch ($payload.action) {
  'activateWindow' {
    $hwnd = [IntPtr]([Int64]$payload.window.id)
    if (-not [ComputerUse.Win32]::IsWindow($hwnd)) {
      throw "Window handle $($payload.window.id) is not valid."
    }

    if ([ComputerUse.Win32]::IsIconic($hwnd)) {
      [ComputerUse.Win32]::ShowWindow($hwnd, 9) | Out-Null
      Start-Sleep -Milliseconds 50
    }

    if (-not (Invoke-ForceForeground $hwnd)) {
      Invoke-EscapeUnlock
      Start-Sleep -Milliseconds 50

      if (-not (Invoke-ForceForeground $hwnd)) {
        throw "Failed to activate window handle $($payload.window.id)."
      }
    }
    break
  }
  'sendText' {
    Invoke-SendText ([string]$payload.text)
    break
  }
  'sendKeyboardInputs' {
    $items = @($payload.inputs)
    $inputs = New-Object 'ComputerUse.INPUT[]' $items.Count
    for ($i = 0; $i -lt $items.Count; $i++) {
      $item = $items[$i]
      $scanCode = if ($null -ne $item.scanCode) { [UInt16]$item.scanCode } else { [UInt16]0 }
      $inputs[$i] = New-KeyboardInput ([UInt16]$item.vkCode) $scanCode ([UInt32]$item.flags)
    }
    Invoke-SendInput $inputs
    break
  }
  'sendPointerClick' {
    Move-CursorHumanized ([Int32]$payload.click.x) ([Int32]$payload.click.y)

    switch ($payload.click.button) {
      'left' {
        $down = [ComputerUse.Win32]::MOUSEEVENTF_LEFTDOWN
        $up = [ComputerUse.Win32]::MOUSEEVENTF_LEFTUP
      }
      'right' {
        $down = [ComputerUse.Win32]::MOUSEEVENTF_RIGHTDOWN
        $up = [ComputerUse.Win32]::MOUSEEVENTF_RIGHTUP
      }
      'middle' {
        $down = [ComputerUse.Win32]::MOUSEEVENTF_MIDDLEDOWN
        $up = [ComputerUse.Win32]::MOUSEEVENTF_MIDDLEUP
      }
      default {
        throw "Unsupported mouse button: $($payload.click.button)"
      }
    }

    for ($i = 0; $i -lt [Int32]$payload.click.clickCount; $i++) {
      Invoke-SendInput @((New-MouseInput $down), (New-MouseInput $up))
      if ($i + 1 -lt [Int32]$payload.click.clickCount) {
        Start-Sleep -Milliseconds 50
      }
    }
    break
  }
  default {
    throw "Unsupported action: $($payload.action)"
  }
}
`;

export interface PowerShellNativeBridgeOptions {
  shellExecutable?: string;
  timeoutMs?: number;
}

export class PowerShellNativeBridge implements NativeBridge {
  readonly driverName: string = "powershell";
  readonly capabilities = {
    activationModel: {
      supportsAttachThreadInput: false,
      approximatesThreadInputAttachment: true,
      supportsDesktopSwitching: false,
      supportsSyntheticEscapeUnlock: true,
      supportsSyntheticAltUnlock: true,
      foregroundRetryCount: 20,
      unlockSequence: ["escape", "alt"] as const
    },
    pointerModel: {
      usesVirtualScreenCoordinates: false,
      providesVirtualScreenMetrics: false,
      dpiAwareness: "system" as const
    },
    lifecycleModel: {
      supportsPhysicalEscapeHook: false,
      supportsInterruptMarkers: true,
      transport: "powershell" as const
    }
  };
  private readonly shellExecutable?: string;
  private readonly timeoutMs: number;
  private currentTurnMeta?: JsonRpcMeta;

  constructor(options: PowerShellNativeBridgeOptions = {}) {
    this.shellExecutable = options.shellExecutable;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  beginTurn(meta?: JsonRpcMeta): void {
    this.currentTurnMeta = meta;
  }

  endTurn(): void {
    this.currentTurnMeta = undefined;
  }

  async activateWindow(window: WindowRef): Promise<ActivateWindowResult> {
    await this.invoke({
      action: "activateWindow",
      window,
      meta: this.currentTurnMeta ?? null
    });
    return {
      ok: true,
      window,
      focused: true,
      focusedSource: "assumed_after_successful_call",
      hint: "PowerShell fallback completed activation without a structured focus report."
    };
  }

  async sendText(text: string): Promise<void> {
    await this.invoke({
      action: "sendText",
      text,
      meta: this.currentTurnMeta ?? null
    });
  }

  async sendKeyboardInputs(inputs: readonly KeyboardInput[]): Promise<void> {
    await this.invoke({
      action: "sendKeyboardInputs",
      inputs,
      meta: this.currentTurnMeta ?? null
    });
  }

  async sendPointerClick(click: PointerClick, _options?: PointerClickOptions): Promise<PointerClickFeedback | void> {
    await this.invoke({
      action: "sendPointerClick",
      click,
      meta: this.currentTurnMeta ?? null
    });
  }

  async sendPointerScroll(_scroll: PointerScroll): Promise<void> {
    throw new Error("PowerShell native bridge does not implement pointer scroll.");
  }

  async sendPointerDrag(_drag: PointerDrag): Promise<void> {
    throw new Error("PowerShell native bridge does not implement pointer drag.");
  }

  protected async invoke(payload: Record<string, unknown>): Promise<void> {
    const scriptPath = await ensurePowerShellScriptPath();
    let lastError: unknown;

    for (const shellExecutable of this.getShellCandidates()) {
      try {
        await execFileAsync(
          shellExecutable,
          ["-NoProfile", "-NonInteractive", "-File", scriptPath],
          {
            windowsHide: true,
            timeout: this.timeoutMs,
            env: {
              ...process.env,
              COMPUTER_USE_PAYLOAD: JSON.stringify(payload)
            }
          }
        );
        return;
      } catch (error) {
        lastError = error;
        if (!isMissingShellError(error)) {
          break;
        }
      }
    }

    throw wrapBridgeExecutionError(lastError);
  }

  private getShellCandidates(): readonly string[] {
    if (this.shellExecutable) {
      return [this.shellExecutable];
    }

    return [
      process.env.COMPUTER_USE_POWERSHELL_PATH ?? "",
      "pwsh.exe",
      "powershell.exe"
    ].filter((candidate): candidate is string => candidate.length > 0);
  }

  async getVirtualScreenMetrics(): Promise<VirtualScreenMetrics> {
    return resolveVirtualScreenMetrics();
  }

  async listWindows(): Promise<readonly WindowRef[]> {
    throw new Error("PowerShell native bridge does not implement list_windows.");
  }

  async getWindow(_params: GetWindowParams): Promise<WindowRef> {
    throw new Error("PowerShell native bridge does not implement get_window.");
  }

  async listApps(): Promise<readonly AppDescriptor[]> {
    throw new Error("PowerShell native bridge does not implement list_apps.");
  }

  async launchApp(_app: AppIdentifier, _options?: NativeAppLaunchOptions): Promise<void> {
    throw new Error("PowerShell native bridge does not implement launch_app.");
  }

  async getWindowState(_params: WindowStateParams): Promise<WindowStateResult> {
    throw new Error("PowerShell native bridge does not implement get_window_state.");
  }

  async clickElement(_params: ClickElementParams): Promise<void> {
    throw new Error("PowerShell native bridge does not implement click_element.");
  }

  async setValue(_params: SetValueParams): Promise<void> {
    throw new Error("PowerShell native bridge does not implement set_value.");
  }

  async performSecondaryAction(_params: PerformSecondaryActionParams): Promise<void> {
    throw new Error("PowerShell native bridge does not implement perform_secondary_action.");
  }
}

function isMissingShellError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
  );
}

function wrapBridgeExecutionError(error: unknown): Error {
  if (error instanceof Error) {
    const details: string[] = [`PowerShell native bridge failed: ${error.message}`];
    if ("stderr" in error && typeof error.stderr === "string" && error.stderr.trim().length > 0) {
      details.push(`stderr: ${error.stderr.trim()}`);
    }
    if ("stdout" in error && typeof error.stdout === "string" && error.stdout.trim().length > 0) {
      details.push(`stdout: ${error.stdout.trim()}`);
    }
    return new Error(details.join("\n"));
  }

  return new Error("PowerShell native bridge failed.");
}

async function ensurePowerShellScriptPath(): Promise<string> {
  if (!powerShellScriptPathPromise) {
    powerShellScriptPathPromise = (async () => {
      const contentHash = createHash("sha1").update(POWERSHELL_SCRIPT).digest("hex").slice(0, 12);
      const scriptPath = path.join(os.tmpdir(), `computer-use-native-bridge-${contentHash}.ps1`);
      await writeFile(scriptPath, POWERSHELL_SCRIPT, "utf8");
      return scriptPath;
    })();
  }

  return powerShellScriptPathPromise;
}
