using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Windows.Automation;
using Windows.Foundation;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;
using WinRT;

namespace ComputerUse.NativeHost
{
    internal static class Program
    {
        private static int Main()
        {
            Console.InputEncoding = Encoding.UTF8;
            Console.OutputEncoding = Encoding.UTF8;

            var serializer = new JsonBridge();

            var host = new NativeHostService();
            try
            {
                string line;
                while ((line = Console.ReadLine()) != null)
                {
                    if (string.IsNullOrWhiteSpace(line))
                    {
                        continue;
                    }

                    Dictionary<string, object> request = null;
                    int requestId = 0;

                    try
                    {
                        request = serializer.DeserializeDictionary(line);
                        if (request == null)
                        {
                            throw NativeHostException.InvalidRequest("Request payload could not be decoded.");
                        }

                        requestId = ReadRequiredInt(request, "id");
                        var method = ReadRequiredString(request, "method");
                        var payload = ReadOptionalDictionary(request, "payload");
                        var result = host.Dispatch(method, payload);

                        WriteResponse(serializer, ResponseEnvelope.Success(requestId, result));
                    }
                    catch (NativeHostException error)
                    {
                        WriteResponse(
                            serializer,
                            ResponseEnvelope.Failure(requestId, error.Message, error.Code, error.Details, error.Guidance)
                        );
                    }
                    catch (Exception error)
                    {
                        WriteResponse(
                            serializer,
                            ResponseEnvelope.Failure(
                                requestId,
                                error.Message,
                                "INTERNAL_ERROR",
                                CreateDetails("type", error.GetType().FullName),
                                null
                            )
                        );
                    }
                }
            }
            finally
            {
                host.Dispose();
            }

            return 0;
        }

        private static void WriteResponse(JsonBridge serializer, ResponseEnvelope response)
        {
            Console.WriteLine(serializer.Serialize(response.ToDictionary()));
        }

        private sealed class JsonBridge
        {
            private readonly JsonSerializerOptions options = new JsonSerializerOptions();

            public Dictionary<string, object> DeserializeDictionary(string json)
            {
                using (var document = JsonDocument.Parse(json))
                {
                    var value = ConvertElement(document.RootElement) as Dictionary<string, object>;
                    if (value == null)
                    {
                        throw NativeHostException.InvalidRequest("Request payload must be a JSON object.");
                    }

                    return value;
                }
            }

            public string Serialize(object value)
            {
                return JsonSerializer.Serialize(value, options);
            }

            private static object ConvertElement(JsonElement element)
            {
                switch (element.ValueKind)
                {
                    case JsonValueKind.Object:
                        var dictionary = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                        foreach (var property in element.EnumerateObject())
                        {
                            dictionary[property.Name] = ConvertElement(property.Value);
                        }

                        return dictionary;
                    case JsonValueKind.Array:
                        var array = new ArrayList();
                        foreach (var item in element.EnumerateArray())
                        {
                            array.Add(ConvertElement(item));
                        }

                        return array;
                    case JsonValueKind.String:
                        return element.GetString();
                    case JsonValueKind.Number:
                        int intValue;
                        if (element.TryGetInt32(out intValue))
                        {
                            return intValue;
                        }

                        long longValue;
                        if (element.TryGetInt64(out longValue))
                        {
                            return longValue;
                        }

                        return element.GetDouble();
                    case JsonValueKind.True:
                        return true;
                    case JsonValueKind.False:
                        return false;
                    case JsonValueKind.Null:
                    case JsonValueKind.Undefined:
                    default:
                        return null;
                }
            }
        }

        private static int ReadRequiredInt(IDictionary<string, object> values, string key)
        {
            object value;
            if (!values.TryGetValue(key, out value))
            {
                throw NativeHostException.InvalidRequest("Native-host request is missing '" + key + "'.");
            }

            return Convert.ToInt32(value);
        }

        private static string ReadRequiredString(IDictionary<string, object> values, string key)
        {
            object value;
            if (!values.TryGetValue(key, out value) || value == null)
            {
                throw NativeHostException.InvalidRequest("Native-host request is missing '" + key + "'.");
            }

            var text = value.ToString();
            if (string.IsNullOrWhiteSpace(text))
            {
                throw NativeHostException.InvalidRequest("Native-host request property '" + key + "' is empty.");
            }

            return text;
        }

        private static string ReadRequiredLiteralText(IDictionary<string, object> values, string key)
        {
            object value;
            if (!values.TryGetValue(key, out value) || value == null)
            {
                throw NativeHostException.InvalidRequest("Native-host request is missing '" + key + "'.");
            }

            return value.ToString() ?? string.Empty;
        }

        private static Dictionary<string, object> ReadOptionalDictionary(
            IDictionary<string, object> values,
            string key
        )
        {
            object value;
            if (!values.TryGetValue(key, out value) || value == null)
            {
                return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            }

            var dictionary = value as Dictionary<string, object>;
            if (dictionary == null)
            {
                throw NativeHostException.InvalidRequest("Native-host property '" + key + "' must be an object.");
            }

            return dictionary;
        }

        private static Dictionary<string, object> CreateDetails(string key, object value)
        {
            var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            details[key] = value;
            return details;
        }
    }

    internal sealed class NativeHostService : IDisposable
    {
        private const int RoInitMultithreaded = 1;
        private const int DwmaExtendedFrameBounds = 9;
        private const int DwmaCloaked = 14;
        private const uint ProcessQueryLimitedInformation = 0x1000;
        private const uint DesktopSwitchDesktop = 0x0100;
        private const uint DesktopReadObjects = 0x0001;
        private const uint GmemMoveable = 0x0002;
        private const uint CfUnicodeText = 13;
        private const int D3dDriverTypeHardware = 1;
        private const int D3dDriverTypeWarp = 5;
        private const uint D3d11CreateDeviceBgraSupport = 0x20;
        private const uint D3d11SdkVersion = 7;
        private static readonly IntPtr DpiAwarenessContextPerMonitorAwareV2 = new IntPtr(-4);
        private static readonly IntPtr DpiAwarenessContextPerMonitorAware = new IntPtr(-3);
        private static readonly Guid GraphicsCaptureItemGuid = new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760");
        private static readonly Guid DxgiDeviceGuid = new Guid("54EC77FA-1377-44E6-8C32-88FD5F44C84C");
        private const string TaskbarAppId = "windows.shell.taskbar";
        private const string TaskbarDisplayName = "Windows Taskbar";
        private const string TaskbarWindowTitle = "Windows Taskbar";
        private static readonly string[] HiddenClassNames =
        {
            "Progman",
            "Button",
            "Shell_TrayWnd",
            "Shell_SecondaryTrayWnd",
            "Windows.UI.Core.CoreWindow",
            "ToolTips_Class32",
            "IME"
        };

        private bool turnInitialized;
        private bool roInitialized;
        private IntPtr mtaCookie;
        private TurnContext currentTurn;
        private PhysicalEscapeHookController escapeHook;

        public object Dispatch(string method, Dictionary<string, object> payload)
        {
            switch (method)
            {
                case "beginTurn":
                    BeginTurn(payload);
                    return null;
                case "endTurn":
                    EndTurn();
                    return null;
                case "activateWindow":
                    return ActivateWindow(GetWindowHandle(payload));
                case "sendText":
                    SendText(ReadRequiredLiteralText(payload, "text"));
                    return null;
                case "sendKeyboardInputs":
                    SendKeyboardInputs(GetKeyboardInputs(payload));
                    return null;
                case "sendPointerClick":
                    return SendPointerClick(GetPointerClick(payload), ReadOptionalDictionary(payload, "targetWindow"));
                case "sendPointerScroll":
                    SendPointerScroll(GetPointerScroll(payload));
                    return null;
                case "sendPointerDrag":
                    SendPointerDrag(GetPointerDrag(payload));
                    return null;
                case "getVirtualScreenMetrics":
                    return GetVirtualScreenMetrics();
                case "listWindows":
                    return ListWindows();
                case "getWindow":
                    return GetWindow(ReadRequiredDictionary(payload, "params"));
                case "listApps":
                    return ListApps();
                case "launchApp":
                    LaunchApp(ReadRequiredString(payload, "app"), ReadOptionalString(payload, "launchMode"));
                    return null;
                case "getWindowState":
                    return GetWindowState(ReadRequiredDictionary(payload, "params"));
                case "clickElement":
                    ClickElement(ReadRequiredDictionary(payload, "params"));
                    return null;
                case "setValue":
                    SetValue(ReadRequiredDictionary(payload, "params"));
                    return null;
                case "performSecondaryAction":
                    PerformSecondaryAction(ReadRequiredDictionary(payload, "params"));
                    return null;
                case "ping":
                    return CreatePingPayload();
                default:
                    throw NativeHostException.InvalidRequest("Unsupported native-host method: " + method);
            }
        }

        public void Dispose()
        {
            EndTurn();
        }

        private Dictionary<string, object> CreatePingPayload()
        {
            var payload = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            payload["driver"] = "native-host";
            payload["turnInitialized"] = turnInitialized;
            payload["supportsDesktopSwitching"] = true;
            payload["supportsPhysicalEscapeHook"] = true;
            payload["providesVirtualScreenMetrics"] = true;
            return payload;
        }

        private void BeginTurn(IDictionary<string, object> payload)
        {
            if (turnInitialized)
            {
                currentTurn = ParseTurnContext(payload);
                EnsureEscapeHook();
                return;
            }

            var hr = CoIncrementMTAUsage(out mtaCookie);
            if (IsFailed(hr))
            {
                throw NativeHostException.FromHResult("CoIncrementMTAUsage", hr, "Failed to acquire an MTA usage cookie.");
            }

            hr = RoInitialize(RoInitMultithreaded);
            if (hr != 0 && hr != 1)
            {
                CoDecrementMTAUsage(mtaCookie);
                mtaCookie = IntPtr.Zero;
                throw NativeHostException.FromHResult(
                    "RoInitialize",
                    hr,
                    "Failed to initialize the WinRT apartment for the current turn."
                );
            }

            roInitialized = true;
            turnInitialized = true;
            currentTurn = ParseTurnContext(payload);
            EnsureEscapeHook();
        }

        private void EndTurn()
        {
            if (escapeHook != null)
            {
                escapeHook.Dispose();
                escapeHook = null;
            }

            currentTurn = null;

            if (!turnInitialized)
            {
                return;
            }

            if (roInitialized)
            {
                RoUninitialize();
                roInitialized = false;
            }

            if (mtaCookie != IntPtr.Zero)
            {
                CoDecrementMTAUsage(mtaCookie);
                mtaCookie = IntPtr.Zero;
            }

            turnInitialized = false;
        }

        private void EnsureEscapeHook()
        {
            if (escapeHook != null)
            {
                escapeHook.Dispose();
                escapeHook = null;
            }

            if (currentTurn == null)
            {
                return;
            }

            escapeHook = new PhysicalEscapeHookController(currentTurn);
            escapeHook.Start();
        }

        private Dictionary<string, object> ActivateWindow(IntPtr hwnd)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            Dictionary<string, object> result = null;
            WithDpiGuard(delegate
            {
                EnsureWindow(hwnd);

                if (IsIconic(hwnd))
                {
                    if (!ShowWindow(hwnd, 9))
                    {
                        ThrowLastWin32Error("ShowWindow", "Failed to restore a minimized target window.");
                    }

                    Thread.Sleep(50);
                }

                TrySwitchToInputDesktop();

                var currentThreadId = GetCurrentThreadId();
                uint ignoredProcessId;
                var targetThreadId = GetWindowThreadProcessId(hwnd, out ignoredProcessId);
                if (targetThreadId == 0)
                {
                    ThrowLastWin32Error("GetWindowThreadProcessId", "Failed to resolve the target window thread.");
                }

                var foregroundWindow = GetForegroundWindow();
                uint foregroundProcessId;
                var foregroundThreadId = foregroundWindow == IntPtr.Zero
                    ? 0u
                    : GetWindowThreadProcessId(foregroundWindow, out foregroundProcessId);

                var attachments = new List<ThreadAttachment>();
                TryAttachThreadInput(currentThreadId, targetThreadId, attachments);
                if (foregroundThreadId != 0)
                {
                    TryAttachThreadInput(currentThreadId, foregroundThreadId, attachments);
                }

                try
                {
                    for (var attempt = 0; attempt < 20; attempt++)
                    {
                        ThrowIfInterrupted();

                        if (IsForegroundWindow(hwnd))
                        {
                            result = BuildActivationResult(hwnd);
                            return;
                        }

                        BringWindowToTop(hwnd);
                        SetForegroundWindow(hwnd);
                        SetFocus(hwnd);
                        Thread.Sleep(50);

                        if (IsForegroundWindow(hwnd))
                        {
                            result = BuildActivationResult(hwnd);
                            return;
                        }

                        if (attempt % 2 == 0)
                        {
                            TrySwitchToInputDesktop();
                            SendEscapeUnlock();
                        }
                        else
                        {
                            SendAltUnlock();
                        }

                        SetForegroundWindow(hwnd);
                        SetFocus(hwnd);
                        Thread.Sleep(50);
                    }

                    var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                    details["windowId"] = hwnd.ToInt64();
                    var failedForegroundWindow = GetForegroundWindow();
                    if (failedForegroundWindow != IntPtr.Zero)
                    {
                        details["foregroundWindowId"] = failedForegroundWindow.ToInt64();
                    }
                    var guidance = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                    guidance["should_retry"] = true;
                    guidance["user_visible_message"] = "The target window could not be brought to the foreground.";
                    guidance["model_action"] =
                        "Retry once after refreshing the window. If the window is visible, use window-relative click coordinates or wait for the foreground lock timeout before retrying activate_window.";
                    throw NativeHostException.NativeExecution(
                        "SetForegroundWindow",
                        "Failed to activate the target window after 20 foreground retries.",
                        details,
                        guidance
                    );
                }
                finally
                {
                    for (var index = attachments.Count - 1; index >= 0; index--)
                    {
                        var attachment = attachments[index];
                        AttachThreadInput(attachment.SourceThreadId, attachment.TargetThreadId, false);
                    }
                }
            });

            return result ?? BuildActivationResult(hwnd);
        }

        private Dictionary<string, object> BuildActivationResult(IntPtr hwnd)
        {
            var foregroundWindow = GetForegroundWindow();
            var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            result["ok"] = true;
            result["window"] = BuildWindowStatePayload(hwnd, null);
            result["focused"] = foregroundWindow != IntPtr.Zero && foregroundWindow == hwnd;
            result["focusedSource"] = "GetForegroundWindow";
            if (foregroundWindow != IntPtr.Zero)
            {
                result["foregroundWindowId"] = foregroundWindow.ToInt64();
            }
            return result;
        }

        private void SendKeyboardInputs(IList<KeyboardInputDto> inputs)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            WithDpiGuard(delegate
            {
                if (inputs.Count == 0)
                {
                    return;
                }

                var nativeInputs = new INPUT[inputs.Count];
                for (var index = 0; index < inputs.Count; index++)
                {
                    ThrowIfInterrupted();

                    var item = inputs[index];
                    nativeInputs[index] = new INPUT
                    {
                        type = 1,
                        U = new INPUTUNION
                        {
                            ki = new KEYBDINPUT
                            {
                                wVk = item.VkCode,
                                wScan = item.ScanCode,
                                dwFlags = item.Flags,
                                time = 0,
                                dwExtraInfo = UIntPtr.Zero
                            }
                        }
                    };
                }

                var sent = (int)SendInput((uint)nativeInputs.Length, nativeInputs, Marshal.SizeOf(typeof(INPUT)));
                if (sent != nativeInputs.Length)
                {
                    ThrowLastWin32Error(
                        "SendInput",
                        "SendInput only sent " + sent + " of " + nativeInputs.Length + " keyboard input records.",
                        CreateKeyboardInputGuidance()
                    );
                }
            });
        }

        private void SendText(string text)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            WithDpiGuard(delegate
            {
                if (string.IsNullOrEmpty(text))
                {
                    return;
                }

                var clipboard = CaptureClipboardSnapshot();
                if (clipboard.FormatCount > 0 && !clipboard.HadUnicodeText)
                {
                    var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                    details["formatCount"] = clipboard.FormatCount;
                    throw NativeHostException.NativeExecution(
                        "OpenClipboard",
                        "Clipboard currently contains non-text data that cannot be restored safely for exact text paste.",
                        details,
                        CreateTextInputGuidance(
                            "The clipboard contains non-text data, so exact paste-based text injection was not attempted.",
                            "Use press_key for character-by-character input, or use set_value when an accessibility ValuePattern element is available."
                        )
                    );
                }

                try
                {
                    SetClipboardUnicodeText(text);
                    Thread.Sleep(20);
                    SendPasteShortcut();
                    Thread.Sleep(20);
                }
                finally
                {
                    if (clipboard.HadUnicodeText)
                    {
                        TryRestoreClipboardUnicodeText(clipboard.Text ?? string.Empty);
                    }
                    else if (clipboard.FormatCount == 0)
                    {
                        TryClearClipboard();
                    }
                }
            });
        }

        private Dictionary<string, object> SendPointerClick(PointerClickDto click, IDictionary<string, object> targetWindow = null)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            Dictionary<string, object> result = null;
            WithDpiGuard(delegate
            {
                MoveCursorHumanized(click.X, click.Y);
                ThrowIfInterrupted();

                uint downFlag;
                uint upFlag;
                switch (click.Button)
                {
                    case "left":
                        downFlag = 0x0002;
                        upFlag = 0x0004;
                        break;
                    case "right":
                        downFlag = 0x0008;
                        upFlag = 0x0010;
                        break;
                    case "middle":
                        downFlag = 0x0020;
                        upFlag = 0x0040;
                        break;
                    default:
                        throw NativeHostException.InvalidRequest("Unsupported mouse button: " + click.Button);
                }

                for (var count = 0; count < click.ClickCount; count++)
                {
                    ThrowIfInterrupted();

                    var nativeInputs = new[]
                    {
                        CreateMouseInput(downFlag),
                        CreateMouseInput(upFlag)
                    };

                    var sent = (int)SendInput((uint)nativeInputs.Length, nativeInputs, Marshal.SizeOf(typeof(INPUT)));
                    if (sent != nativeInputs.Length)
                    {
                        ThrowLastWin32Error(
                            "SendInput",
                            "SendInput only sent " + sent + " of " + nativeInputs.Length + " pointer input records.",
                            CreatePointerInputGuidance()
                        );
                    }

                    if (count + 1 < click.ClickCount)
                    {
                        Thread.Sleep(50);
                    }
                }

                result = BuildPointerClickFeedback(click, targetWindow);
            });

            return result ?? new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        }

        private Dictionary<string, object> BuildPointerClickFeedback(
            PointerClickDto click,
            IDictionary<string, object> targetWindow
        )
        {
            var targetWindowId = ReadOptionalWindowId(targetWindow);
            var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

            var foregroundWindow = GetForegroundWindow();
            var postInputFocus = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            postInputFocus["focused"] = targetWindowId.HasValue &&
                foregroundWindow != IntPtr.Zero &&
                foregroundWindow.ToInt64() == targetWindowId.Value;
            postInputFocus["matchesTarget"] = (bool)postInputFocus["focused"];
            if (foregroundWindow != IntPtr.Zero)
            {
                postInputFocus["foregroundWindowId"] = foregroundWindow.ToInt64();
            }
            result["postInputFocus"] = postInputFocus;

            var point = new POINT { x = click.X, y = click.Y };
            var rawHitWindow = WindowFromPoint(point);
            var hitWindow = rawHitWindow == IntPtr.Zero ? IntPtr.Zero : GetAncestor(rawHitWindow, 2);
            if (hitWindow == IntPtr.Zero)
            {
                hitWindow = rawHitWindow;
            }

            var hitTest = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (rawHitWindow != IntPtr.Zero)
            {
                hitTest["rawHwndAtPoint"] = rawHitWindow.ToInt64();
            }
            if (hitWindow != IntPtr.Zero)
            {
                hitTest["hwndAtPoint"] = hitWindow.ToInt64();
                hitTest["matchesTarget"] = targetWindowId.HasValue && hitWindow.ToInt64() == targetWindowId.Value;
                var hitWindowPayload = BuildWindowStatePayload(hitWindow, null);
                if (hitWindowPayload != null)
                {
                    hitTest["window"] = hitWindowPayload;
                }
                var processName = GetWindowProcessName(hitWindow);
                if (!string.IsNullOrWhiteSpace(processName))
                {
                    hitTest["processName"] = processName;
                }
            }
            else if (targetWindowId.HasValue)
            {
                hitTest["matchesTarget"] = false;
            }
            result["hitTest"] = hitTest;

            return result;
        }

        private void MoveCursorHumanized(int targetX, int targetY)
        {
            POINT start;
            if (!GetCursorPos(out start))
            {
                if (!SetCursorPos(targetX, targetY))
                {
                    ThrowLastWin32Error(
                        "SetCursorPos",
                        "Failed to move the system cursor to the requested coordinates.",
                        CreatePointerInputGuidance()
                    );
                }

                Thread.Sleep(18);
                return;
            }

            var deltaX = (double)(targetX - start.x);
            var deltaY = (double)(targetY - start.y);
            var distance = Math.Sqrt((deltaX * deltaX) + (deltaY * deltaY));
            if (distance < 2.0)
            {
                if (!SetCursorPos(targetX, targetY))
                {
                    ThrowLastWin32Error(
                        "SetCursorPos",
                        "Failed to move the system cursor to the requested coordinates.",
                        CreatePointerInputGuidance()
                    );
                }

                Thread.Sleep(18);
                return;
            }

            var steps = Math.Max(6, Math.Min(30, (int)Math.Ceiling(distance / 22.0)));
            var durationMs = Math.Max(90, Math.Min(220, (int)Math.Round(80.0 + (distance * 0.35))));
            var stepDelayMs = Math.Max(4, durationMs / steps);
            var arcHeight = distance < 24.0 ? 0.0 : Math.Min(36.0, distance * 0.12);
            var perpendicularX = (-1.0 * deltaY) / distance;
            var perpendicularY = deltaX / distance;
            var curveDirection =
                ((deltaX >= 0.0 && deltaY >= 0.0) || (deltaX < 0.0 && deltaY < 0.0))
                    ? 1.0
                    : -1.0;

            for (var step = 1; step <= steps; step++)
            {
                ThrowIfInterrupted();
                var t = (double)step / steps;
                var eased = 0.5 - (Math.Cos(Math.PI * t) / 2.0);
                var arc = Math.Sin(Math.PI * t) * arcHeight * curveDirection;
                var nextX = (int)Math.Round(start.x + (deltaX * eased) + (perpendicularX * arc));
                var nextY = (int)Math.Round(start.y + (deltaY * eased) + (perpendicularY * arc));
                if (!SetCursorPos(nextX, nextY))
                {
                    ThrowLastWin32Error("SetCursorPos", "Failed while animating the system cursor.", CreatePointerInputGuidance());
                }

                Thread.Sleep(stepDelayMs);
            }

            if (!SetCursorPos(targetX, targetY))
            {
                ThrowLastWin32Error(
                    "SetCursorPos",
                    "Failed to move the system cursor to the requested coordinates.",
                    CreatePointerInputGuidance()
                );
            }

            Thread.Sleep(18);
        }

        private void SendPointerScroll(PointerScrollDto scroll)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            WithDpiGuard(delegate
            {
                if (!SetCursorPos(scroll.X, scroll.Y))
                {
                    ThrowLastWin32Error(
                        "SetCursorPos",
                        "Failed to move the system cursor to the requested scroll point.",
                        CreatePointerInputGuidance()
                    );
                }

                Thread.Sleep(10);
                var inputs = new List<INPUT>();
                if (scroll.ScrollY != 0)
                {
                    inputs.Add(CreateMouseInput(0x0800, scroll.ScrollY * 120));
                }
                if (scroll.ScrollX != 0)
                {
                    inputs.Add(CreateMouseInput(0x1000, scroll.ScrollX * 120));
                }

                var nativeInputs = inputs.ToArray();
                var sent = (int)SendInput((uint)nativeInputs.Length, nativeInputs, Marshal.SizeOf(typeof(INPUT)));
                if (sent != nativeInputs.Length)
                {
                    ThrowLastWin32Error(
                        "SendInput",
                        "SendInput only sent " + sent + " of " + nativeInputs.Length + " scroll input records.",
                        CreatePointerInputGuidance()
                    );
                }
            });
        }

        private void SendPointerDrag(PointerDragDto drag)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            WithDpiGuard(delegate
            {
                uint downFlag;
                uint upFlag;
                switch (drag.Button)
                {
                    case "left":
                        downFlag = 0x0002;
                        upFlag = 0x0004;
                        break;
                    case "right":
                        downFlag = 0x0008;
                        upFlag = 0x0010;
                        break;
                    case "middle":
                        downFlag = 0x0020;
                        upFlag = 0x0040;
                        break;
                    default:
                        throw NativeHostException.InvalidRequest("Unsupported drag button: " + drag.Button);
                }

                if (!SetCursorPos(drag.FromX, drag.FromY))
                {
                    ThrowLastWin32Error(
                        "SetCursorPos",
                        "Failed to move the system cursor to the drag start point.",
                        CreatePointerInputGuidance()
                    );
                }

                var inputs = new List<INPUT>();
                inputs.Add(CreateMouseInput(downFlag));
                for (var step = 1; step <= drag.Steps; step++)
                {
                    ThrowIfInterrupted();
                    var ratio = (double)step / drag.Steps;
                    inputs.Add(CreateMouseInput(
                        0x0001 | 0x8000 | 0x4000,
                        0,
                        NormalizeAbsolute(drag.FromX + (drag.ToX - drag.FromX) * ratio, GetSystemMetrics(76), GetSystemMetrics(78)),
                        NormalizeAbsolute(drag.FromY + (drag.ToY - drag.FromY) * ratio, GetSystemMetrics(77), GetSystemMetrics(79))
                    ));
                }
                inputs.Add(CreateMouseInput(upFlag));

                var delay = drag.Steps <= 0 ? 0 : drag.DurationMs / drag.Steps;
                foreach (var input in inputs)
                {
                    var nativeInputs = new[] { input };
                    var sent = (int)SendInput(1, nativeInputs, Marshal.SizeOf(typeof(INPUT)));
                    if (sent != 1)
                    {
                        ThrowLastWin32Error("SendInput", "Failed while sending a drag input record.", CreatePointerInputGuidance());
                    }
                    if (delay > 0)
                    {
                        Thread.Sleep(delay);
                    }
                }
            });
        }

        private Dictionary<string, object> GetVirtualScreenMetrics()
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            return BuildVirtualScreenMetricsPayload();
        }

        private Dictionary<string, object> BuildVirtualScreenMetricsPayload()
        {
            var metrics = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            metrics["originX"] = GetSystemMetrics(76);
            metrics["originY"] = GetSystemMetrics(77);
            metrics["width"] = Math.Max(2, GetSystemMetrics(78));
            metrics["height"] = Math.Max(2, GetSystemMetrics(79));
            metrics["source"] = "native";
            return metrics;
        }

        private object ListWindows()
        {
            EnsureTurnInitialized();
            return EnumerateWindows();
        }

        private object GetWindow(IDictionary<string, object> payload)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            var hwnd = new IntPtr(ReadRequiredLong(payload, "id"));
            var requestedApp = ReadOptionalString(payload, "app");
            var window = BuildWindowPayload(hwnd, requestedApp);
            if (window == null)
            {
                var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                details["windowId"] = hwnd.ToInt64();
                throw NativeHostException.NativeExecution(
                    "getWindow",
                    "Could not resolve a visible window for the requested handle.",
                    details
                );
            }

            return window;
        }

        private object ListApps()
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            var windows = EnumerateWindows();
            var runningExecutablePaths = EnumerateRunningExecutablePaths();
            var windowsByApp = new Dictionary<string, List<Dictionary<string, object>>>(StringComparer.OrdinalIgnoreCase);
            foreach (Dictionary<string, object> window in windows)
            {
                ThrowIfInterrupted();
                var appId = Convert.ToString(window["app"]);
                List<Dictionary<string, object>> appWindows;
                if (!windowsByApp.TryGetValue(appId, out appWindows))
                {
                    appWindows = new List<Dictionary<string, object>>();
                    windowsByApp[appId] = appWindows;
                }

                appWindows.Add(window);
            }

            var merged = new Dictionary<string, Dictionary<string, object>>(StringComparer.OrdinalIgnoreCase);
            foreach (var app in EnumerateShellApps())
            {
                ThrowIfInterrupted();
                merged[app.Id] = BuildAppPayload(app, windowsByApp, runningExecutablePaths);
            }

            foreach (var entry in windowsByApp)
            {
                if (merged.ContainsKey(entry.Key))
                {
                    continue;
                }

                var app = new AppDescriptorDto
                {
                    Id = entry.Key,
                    DisplayName = Path.GetFileNameWithoutExtension(entry.Key),
                    ExecutablePath = entry.Key,
                    ActivationModel = "executable_path"
                };
                merged[app.Id] = BuildAppPayload(app, windowsByApp, runningExecutablePaths);
            }

            var result = new List<Dictionary<string, object>>(merged.Values);
            var taskbarWindow = FindTaskbarWindow();
            if (taskbarWindow != IntPtr.Zero)
            {
                result.Add(BuildTaskbarAppPayload(taskbarWindow));
            }

            result.Sort(delegate(Dictionary<string, object> left, Dictionary<string, object> right)
            {
                return string.Compare(
                    Convert.ToString(left["id"]),
                    Convert.ToString(right["id"]),
                    StringComparison.OrdinalIgnoreCase
                );
            });

            return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
            {
                { "apps", result }
            };
        }

        private static IntPtr FindTaskbarWindow()
        {
            var primaryTaskbar = FindWindow("Shell_TrayWnd", null);
            if (primaryTaskbar != IntPtr.Zero)
            {
                return primaryTaskbar;
            }

            return FindWindow("Shell_SecondaryTrayWnd", null);
        }

        private Dictionary<string, object> BuildTaskbarAppPayload(IntPtr hwnd)
        {
            var payload = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            payload["id"] = TaskbarAppId;
            payload["displayName"] = TaskbarDisplayName;
            payload["isRunning"] = true;
            payload["activationModel"] = "executable_path";
            payload["windows"] = new List<Dictionary<string, object>>
            {
                BuildTaskbarWindowPayload(hwnd)
            };
            return payload;
        }

        private Dictionary<string, object> BuildTaskbarWindowPayload(IntPtr hwnd)
        {
            var payload = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            payload["id"] = hwnd.ToInt64();
            payload["app"] = TaskbarAppId;
            payload["title"] = TaskbarWindowTitle;
            return payload;
        }

        private static bool IsTaskbarRequested(string requestedApp)
        {
            return string.Equals(requestedApp, TaskbarAppId, StringComparison.OrdinalIgnoreCase);
        }

        private void LaunchApp(string app, string launchMode)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            if (string.IsNullOrWhiteSpace(app))
            {
                throw NativeHostException.InvalidRequest("launch_app requires a non-empty app identifier.");
            }

            var normalized = app.Trim();
            if (normalized.StartsWith("pid:", StringComparison.OrdinalIgnoreCase))
            {
                throw NativeHostException.Interrupted("launch_app does not support pid app identifiers");
            }

            var normalizedLaunchMode = NormalizeLaunchMode(launchMode);
            var launchTarget = ResolveLaunchTargetDescriptor(normalized);
            if (normalizedLaunchMode != "force_new" && IsExistingSessionRunning(normalized, launchTarget))
            {
                throw CreateTrayRestoreRequiredException(normalized, launchTarget);
            }

            if (LooksLikeExecutablePath(normalized))
            {
                LaunchProcess(normalized, null, Path.GetDirectoryName(normalized));
                return;
            }

            var explorerPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
            var shellTarget = "shell:AppsFolder\\" + normalized;
            LaunchProcess(explorerPath, "\"" + shellTarget + "\"", null);
        }

        private static string NormalizeLaunchMode(string launchMode)
        {
            if (string.IsNullOrWhiteSpace(launchMode))
            {
                return "reuse_or_launch";
            }

            var normalized = launchMode.Trim();
            if (string.Equals(normalized, "reuse_or_launch", StringComparison.OrdinalIgnoreCase))
            {
                return "reuse_or_launch";
            }

            if (string.Equals(normalized, "force_new", StringComparison.OrdinalIgnoreCase))
            {
                return "force_new";
            }

            throw NativeHostException.InvalidRequest("launch_app launchMode must be reuse_or_launch or force_new when provided.");
        }

        private AppDescriptorDto ResolveLaunchTargetDescriptor(string app)
        {
            if (LooksLikeExecutablePath(app))
            {
                return new AppDescriptorDto
                {
                    Id = app,
                    DisplayName = Path.GetFileNameWithoutExtension(app),
                    ExecutablePath = app,
                    ActivationModel = "executable_path"
                };
            }

            foreach (var candidate in EnumerateShellApps())
            {
                if (string.Equals(candidate.Id, app, StringComparison.OrdinalIgnoreCase))
                {
                    return candidate;
                }

                if (!string.IsNullOrWhiteSpace(candidate.ExecutablePath) &&
                    string.Equals(candidate.ExecutablePath, app, StringComparison.OrdinalIgnoreCase))
                {
                    return candidate;
                }
            }

            return null;
        }

        private bool IsExistingSessionRunning(string requestedApp, AppDescriptorDto launchTarget)
        {
            var executablePath = launchTarget != null && !string.IsNullOrWhiteSpace(launchTarget.ExecutablePath)
                ? launchTarget.ExecutablePath
                : (LooksLikeExecutablePath(requestedApp) ? requestedApp : null);
            if (string.IsNullOrWhiteSpace(executablePath) || !HasRunningExecutableProcess(executablePath))
            {
                return false;
            }

            return true;
        }

        private NativeHostException CreateTrayRestoreRequiredException(string requestedApp, AppDescriptorDto launchTarget)
        {
            var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            details["app"] = requestedApp;
            if (launchTarget != null)
            {
                details["matchedAppId"] = launchTarget.Id;
                if (!string.IsNullOrWhiteSpace(launchTarget.DisplayName))
                {
                    details["matchedDisplayName"] = launchTarget.DisplayName;
                }
                if (!string.IsNullOrWhiteSpace(launchTarget.ExecutablePath))
                {
                    details["matchedExecutablePath"] = launchTarget.ExecutablePath;
                }
            }
            details["taskbarAppId"] = TaskbarAppId;

            var guidance = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            guidance["should_retry"] = true;
            guidance["user_visible_message"] = "The app is already running. Do not cold-launch a second instance.";
            guidance["model_action"] =
                "Call list_apps, select the Windows Taskbar shell target, capture it with get_window_state, and click the matching taskbar or notification-area icon to restore the existing session instead of calling launch_app again.";
            guidance["suggested_tool_call"] = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
            {
                { "method", "list_apps" },
                { "params", new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase) }
            };

            return NativeHostException.PolicyViolation(
                "tray_restore_required",
                "launch_app refused to cold-launch a duplicate instance because the app is already running.",
                details,
                guidance
            );
        }

        private object GetWindowState(IDictionary<string, object> payload)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            var windowPayload = ReadRequiredDictionary(payload, "window");
            var hwnd = new IntPtr(ReadRequiredLong(windowPayload, "id"));
            var requestedApp = ReadOptionalString(windowPayload, "app");
            var includeScreenshot = ReadOptionalBool(payload, "include_screenshot", true);
            var includeText = ReadOptionalBool(payload, "include_text", true);
            var jpegQuality = Math.Max(1, Math.Min(100, ReadOptionalInt(payload, "jpeg_quality", 85)));
            var maxElements = Math.Max(1, Math.Min(10000, ReadOptionalInt(payload, "max_elements", 500)));
            var accessibilityOptions = new AccessibilityCaptureOptions(
                maxElements,
                ReadOptionalStringList(payload, "role_filter"),
                ReadOptionalString(payload, "name_contains")
            );

            var stateWindow = BuildWindowStatePayload(hwnd, requestedApp);
            if (stateWindow == null)
            {
                var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                details["windowId"] = hwnd.ToInt64();
                throw NativeHostException.NativeExecution(
                    "getWindowState",
                    "Could not resolve window state for the requested handle.",
                    details,
                    CreateStaleWindowGuidance()
                );
            }

            var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            result["window"] = stateWindow;

            var capture = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            var degradedReasons = new List<string>();
            capture["screenshotRequested"] = includeScreenshot;
            capture["textRequested"] = includeText;

            if (includeScreenshot)
            {
                var screenshot = CaptureWindowJpeg(hwnd, jpegQuality);
                result["screenshot"] = screenshot;
                capture["screenshotSource"] = screenshot["source"];
                object screenshotDegradedReason;
                if (screenshot.TryGetValue("degradedReason", out screenshotDegradedReason) &&
                    screenshotDegradedReason != null)
                {
                    degradedReasons.Add(screenshotDegradedReason.ToString());
                    capture["screenshotDegradedReason"] = screenshotDegradedReason;
                }
            }

            if (includeText)
            {
                var text = BuildAccessibilityTree(hwnd, accessibilityOptions);
                result["text"] = text.Root;
                var textSource = text.MatchedCount == 0 ? "uia_empty" : "uia";
                capture["textSource"] = textSource;
                capture["elementsReturned"] = text.ReturnedCount;
                capture["elementsTotal"] = text.TotalCount;
                capture["elementsMatched"] = text.MatchedCount;
                capture["truncated"] = text.Truncated;
                capture["partial"] = text.Truncated;
                if (textSource == "uia_empty")
                {
                    degradedReasons.Add("uia_empty");
                }
                if (text.Truncated)
                {
                    degradedReasons.Add("uia_truncated");
                }
                if (text.HasLastReturnedIndex)
                {
                    capture["lastReturnedIndex"] = text.LastReturnedIndex;
                }
            }

            if (degradedReasons.Count > 0)
            {
                capture["degradedReasons"] = degradedReasons;
            }
            result["capture"] = capture;
            return result;
        }

        private void ClickElement(IDictionary<string, object> payload)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            var hwnd = GetWindowHandle(payload);
            var element = ResolveElementByIndex(hwnd, ReadRequiredInt(payload, "element_index"));
            var clickCount = Math.Max(1, ReadOptionalInt(payload, "click_count", 1));
            var button = ReadOptionalString(payload, "mouse_button") ?? "left";

            for (var count = 0; count < clickCount; count++)
            {
                ThrowIfInterrupted();
                if (TryInvokeElement(element) || TrySelectElement(element))
                {
                    continue;
                }

                var bounds = element.Current.BoundingRectangle;
                if (bounds.IsEmpty)
                {
                    throw NativeHostException.NativeExecution(
                        "UIAutomation.InvokePattern",
                        "Element does not support InvokePattern or SelectionItemPattern and has no bounds for pointer fallback.",
                        CreateDetails("elementIndex", ReadRequiredInt(payload, "element_index")),
                        CreateUiaFallbackGuidance()
                    );
                }

                SendPointerClick(new PointerClickDto
                {
                    X = (int)Math.Round(bounds.Left + bounds.Width / 2),
                    Y = (int)Math.Round(bounds.Top + bounds.Height / 2),
                    Button = NormalizeButton(button),
                    ClickCount = 1
                });
            }
        }

        private void SetValue(IDictionary<string, object> payload)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            var element = ResolveElementByIndex(GetWindowHandle(payload), ReadRequiredInt(payload, "element_index"));
            object pattern;
            if (!element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern))
            {
                throw NativeHostException.NativeExecution(
                    "UIAutomation.ValuePattern",
                    "Element does not support ValuePattern.",
                    CreateDetails("elementIndex", ReadRequiredInt(payload, "element_index")),
                    CreateUiaFallbackGuidance()
                );
            }

            ((ValuePattern)pattern).SetValue(ReadRequiredString(payload, "value"));
        }

        private void PerformSecondaryAction(IDictionary<string, object> payload)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            var hwnd = GetWindowHandle(payload);
            var elementIndex = ReadRequiredInt(payload, "element_index");
            var element = ResolveElementByIndex(hwnd, elementIndex);
            var action = ReadRequiredString(payload, "action").ToLowerInvariant();

            switch (action)
            {
                case "raise":
                    element.SetFocus();
                    return;
                case "scroll up":
                    InvokeScrollPattern(element, ScrollAmount.NoAmount, ScrollAmount.SmallDecrement, elementIndex);
                    return;
                case "scroll left":
                    InvokeScrollPattern(element, ScrollAmount.SmallDecrement, ScrollAmount.NoAmount, elementIndex);
                    return;
                case "scroll down":
                    InvokeScrollPattern(element, ScrollAmount.NoAmount, ScrollAmount.SmallIncrement, elementIndex);
                    return;
                case "scroll right":
                    InvokeScrollPattern(element, ScrollAmount.SmallIncrement, ScrollAmount.NoAmount, elementIndex);
                    return;
                case "expand":
                    InvokeExpandCollapsePattern(element, true, elementIndex);
                    return;
                case "collapse":
                    InvokeExpandCollapsePattern(element, false, elementIndex);
                    return;
                default:
                    throw NativeHostException.InvalidRequest("Unknown secondary action: " + action);
            }
        }

        private List<Dictionary<string, object>> EnumerateWindows()
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            var windows = new List<Dictionary<string, object>>();
            var callback = new EnumWindowsProc(delegate(IntPtr hwnd, IntPtr lParam)
            {
                try
                {
                    ThrowIfInterrupted();
                    var payload = BuildWindowPayload(hwnd, null);
                    if (payload != null)
                    {
                        windows.Add(payload);
                    }
                }
                catch (NativeHostException)
                {
                    return false;
                }

                return true;
            });

            if (!EnumWindows(callback, IntPtr.Zero))
            {
                var error = Marshal.GetLastWin32Error();
                if (error != 0)
                {
                    ThrowLastWin32Error("EnumWindows", "Failed while enumerating visible windows.");
                }
            }

            windows.Sort(delegate(Dictionary<string, object> left, Dictionary<string, object> right)
            {
                return Convert.ToInt64(left["id"]).CompareTo(Convert.ToInt64(right["id"]));
            });

            return windows;
        }

        private Dictionary<string, object> BuildWindowPayload(IntPtr hwnd, string requestedApp)
        {
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd))
            {
                return null;
            }

            if (IsTaskbarRequested(requestedApp))
            {
                return BuildTaskbarWindowPayload(hwnd);
            }

            if (!IsWindowVisible(hwnd) || IsWindowCloaked(hwnd) || IsFilteredClassName(hwnd))
            {
                return null;
            }

            if (IsIconic(hwnd))
            {
                return null;
            }

            uint processId;
            GetWindowThreadProcessId(hwnd, out processId);
            if (processId == 0 && !IsTaskbarRequested(requestedApp))
            {
                return null;
            }

            var title = GetWindowTitle(hwnd);
            var processPath = GetProcessPath(processId);
            var appId = IsTaskbarRequested(requestedApp)
                ? TaskbarAppId
                : (string.IsNullOrWhiteSpace(processPath) ? requestedApp : processPath);
            if (string.IsNullOrWhiteSpace(appId))
            {
                return null;
            }

            var payload = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            payload["id"] = hwnd.ToInt64();
            payload["app"] = appId;
            if (!string.IsNullOrWhiteSpace(title))
            {
                payload["title"] = title;
            }

            return payload;
        }

        private Dictionary<string, object> BuildWindowStatePayload(IntPtr hwnd, string requestedApp)
        {
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd))
            {
                return null;
            }

            RECT rect;
            if (!TryGetWindowBounds(hwnd, out rect))
            {
                return null;
            }

            uint processId;
            GetWindowThreadProcessId(hwnd, out processId);
            var processPath = processId == 0 ? null : GetProcessPath(processId);
            var appId = IsTaskbarRequested(requestedApp)
                ? TaskbarAppId
                : (string.IsNullOrWhiteSpace(processPath) ? requestedApp : processPath);
            if (string.IsNullOrWhiteSpace(appId))
            {
                appId = "unknown";
            }

            var payload = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            payload["id"] = hwnd.ToInt64();
            payload["app"] = appId;
            payload["title"] = IsTaskbarRequested(requestedApp)
                ? TaskbarWindowTitle
                : (GetWindowTitle(hwnd) ?? string.Empty);
            payload["rect"] = RectToPayload(rect);
            payload["visible"] = IsWindowVisible(hwnd) && !IsWindowCloaked(hwnd);
            payload["minimized"] = IsIconic(hwnd);
            var foregroundWindow = GetForegroundWindow();
            payload["focused"] = foregroundWindow != IntPtr.Zero && foregroundWindow == hwnd;
            payload["focusedSource"] = "GetForegroundWindow";
            if (foregroundWindow != IntPtr.Zero)
            {
                payload["foregroundWindowId"] = foregroundWindow.ToInt64();
            }
            payload["rectCoordinateSpace"] = "virtual_screen";
            payload["rectOnVirtualScreen"] = IsRectOnVirtualScreen(rect);
            payload["health"] = BuildWindowHealthPayload(hwnd);
            return payload;
        }

        private Dictionary<string, object> BuildWindowHealthPayload(IntPtr hwnd)
        {
            var hung = IsHungAppWindow(hwnd);
            var health = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            health["hung"] = hung;
            health["isResponding"] = !hung;
            health["lastInputIdleMs"] = GetLastInputIdleMs();
            return health;
        }

        private static long GetLastInputIdleMs()
        {
            var info = new LASTINPUTINFO();
            info.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
            if (!GetLastInputInfo(ref info))
            {
                return -1;
            }

            var elapsed = unchecked((uint)Environment.TickCount - info.dwTime);
            return elapsed;
        }

        private bool IsRectOnVirtualScreen(RECT rect)
        {
            var originX = GetSystemMetrics(76);
            var originY = GetSystemMetrics(77);
            var right = originX + Math.Max(2, GetSystemMetrics(78));
            var bottom = originY + Math.Max(2, GetSystemMetrics(79));

            return rect.Right > originX &&
                rect.Left < right &&
                rect.Bottom > originY &&
                rect.Top < bottom;
        }

        private Dictionary<string, object> CaptureWindowJpeg(IntPtr hwnd, int jpegQuality)
        {
            RECT rect = new RECT();
            Dictionary<string, object> result = null;

            WithDpiGuard(delegate
            {
                if (!TryGetWindowBounds(hwnd, out rect))
                {
                    throw NativeHostException.NativeExecution(
                        "DwmGetWindowAttribute",
                        "Could not resolve bounds for window capture.",
                        CreateDetails("windowId", hwnd.ToInt64()),
                        CreateCaptureGuidance()
                    );
                }

                result = TryCaptureWindowWithWindowsGraphicsCapture(hwnd, jpegQuality);
                if (result == null)
                {
                    result = CaptureWindowJpegWithGdi(rect, jpegQuality);
                    result["degradedReason"] = "wgc_failed";
                    result["gdiFallbackAt"] = DateTimeOffset.UtcNow.ToString("o");
                }
            });

            return result;
        }

        private Dictionary<string, object> TryCaptureWindowWithWindowsGraphicsCapture(IntPtr hwnd, int jpegQuality)
        {
            try
            {
                return CaptureWindowJpegWithWindowsGraphicsCapture(hwnd, jpegQuality);
            }
            catch (Exception wgcError)
            {
                Console.Error.WriteLine($"[WGC-DIAG] suppressed WGC failure: type={wgcError.GetType().FullName} hwnd={hwnd.ToInt64()} msg={wgcError.Message}");
                if (wgcError.InnerException != null)
                {
                    Console.Error.WriteLine($"[WGC-DIAG]   inner: {wgcError.InnerException.GetType().FullName}: {wgcError.InnerException.Message}");
                }
                Console.Error.WriteLine($"[WGC-DIAG]   stack: {wgcError.StackTrace}");
                return null;
            }
        }

        private Dictionary<string, object> CaptureWindowJpegWithWindowsGraphicsCapture(IntPtr hwnd, int jpegQuality)
        {
            if (!GraphicsCaptureSession.IsSupported())
            {
                return null;
            }

            var item = default(GraphicsCaptureItem);
            var device = default(IDirect3DDevice);
            var framePool = default(Direct3D11CaptureFramePool);
            var session = default(GraphicsCaptureSession);
            var capturedFrame = default(Direct3D11CaptureFrame);
            var frameReady = new ManualResetEventSlim(false);
            TypedEventHandler<Direct3D11CaptureFramePool, object> frameHandler = null;

            try
            {
                item = CreateGraphicsCaptureItemForWindow(hwnd);
                if (item == null || item.Size.Width <= 0 || item.Size.Height <= 0)
                {
                    return null;
                }

                device = CreateDirect3DDevice();
                framePool = Direct3D11CaptureFramePool.CreateFreeThreaded(
                    device,
                    DirectXPixelFormat.B8G8R8A8UIntNormalized,
                    1,
                    item.Size
                );
                session = framePool.CreateCaptureSession(item);
                frameHandler = delegate(Direct3D11CaptureFramePool sender, object args)
                {
                    if (capturedFrame == null)
                    {
                        capturedFrame = sender.TryGetNextFrame();
                        frameReady.Set();
                    }
                };
                framePool.FrameArrived += frameHandler;
                session.StartCapture();

                if (!frameReady.Wait(3000) || capturedFrame == null)
                {
                    return null;
                }

                using (var softwareBitmap = SoftwareBitmap.CreateCopyFromSurfaceAsync(capturedFrame.Surface).AsTask().GetAwaiter().GetResult())
                {
                    if (softwareBitmap == null)
                    {
                        return null;
                    }

                    return CreateScreenshotPayloadFromSoftwareBitmap(softwareBitmap, jpegQuality, "wgc");
                }
            }
            finally
            {
                if (framePool != null && frameHandler != null)
                {
                    framePool.FrameArrived -= frameHandler;
                }

                if (capturedFrame != null)
                {
                    capturedFrame.Dispose();
                }
                if (session != null)
                {
                    session.Dispose();
                }
                if (framePool != null)
                {
                    framePool.Dispose();
                }
                if (device != null)
                {
                    if (Marshal.IsComObject(device))
                    {
                        Marshal.ReleaseComObject(device);
                    }
                    else
                    {
                        device.Dispose();
                    }
                }

                frameReady.Dispose();
            }
        }

        private Dictionary<string, object> CaptureWindowJpegWithGdi(RECT rect, int jpegQuality)
        {
            var width = Math.Max(1, rect.Right - rect.Left);
            var height = Math.Max(1, rect.Bottom - rect.Top);
            using (var bitmap = new Bitmap(width, height))
            {
                using (var graphics = Graphics.FromImage(bitmap))
                {
                    graphics.CopyFromScreen(rect.Left, rect.Top, 0, 0, new System.Drawing.Size(width, height));
                }

                return CreateScreenshotPayloadFromBitmap(bitmap, jpegQuality);
            }
        }

        private GraphicsCaptureItem CreateGraphicsCaptureItemForWindow(IntPtr hwnd)
        {
            IntPtr classNamePointer = IntPtr.Zero;
            IntPtr factoryPointer = IntPtr.Zero;
            IntPtr itemPointer = IntPtr.Zero;
            try
            {
                var className = "Windows.Graphics.Capture.GraphicsCaptureItem";
                var hr = WindowsCreateString(className, className.Length, out classNamePointer);
                if (IsFailed(hr))
                {
                    throw NativeHostException.FromHResult(
                        "WindowsCreateString",
                        hr,
                        "Failed to create the WinRT class name for WGC capture."
                    );
                }

                var factoryGuid = typeof(IGraphicsCaptureItemInterop).GUID;
                hr = RoGetActivationFactory(classNamePointer, ref factoryGuid, out factoryPointer);
                if (IsFailed(hr))
                {
                    throw NativeHostException.FromHResult(
                        "RoGetActivationFactory",
                        hr,
                        "Failed to resolve the GraphicsCaptureItem interop factory."
                    );
                }

                var interop = (IGraphicsCaptureItemInterop)Marshal.GetObjectForIUnknown(factoryPointer);
                var iid = GraphicsCaptureItemGuid;
                hr = interop.CreateForWindow(hwnd, ref iid, out itemPointer);
                if (IsFailed(hr))
                {
                    throw NativeHostException.FromHResult(
                        "IGraphicsCaptureItemInterop.CreateForWindow",
                        hr,
                        "Failed to create a GraphicsCaptureItem for the target window."
                    );
                }

                return GraphicsCaptureItem.FromAbi(itemPointer);
            }
            finally
            {
                if (factoryPointer != IntPtr.Zero)
                {
                    Marshal.Release(factoryPointer);
                }
                if (classNamePointer != IntPtr.Zero)
                {
                    WindowsDeleteString(classNamePointer);
                }
            }
        }

        private IDirect3DDevice CreateDirect3DDevice()
        {
            IntPtr d3dDevicePointer;
            IntPtr immediateContextPointer;
            uint featureLevel;
            var hr = D3D11CreateDevice(
                IntPtr.Zero,
                D3dDriverTypeHardware,
                IntPtr.Zero,
                D3d11CreateDeviceBgraSupport,
                IntPtr.Zero,
                0,
                D3d11SdkVersion,
                out d3dDevicePointer,
                out featureLevel,
                out immediateContextPointer
            );

            if (IsFailed(hr))
            {
                hr = D3D11CreateDevice(
                    IntPtr.Zero,
                    D3dDriverTypeWarp,
                    IntPtr.Zero,
                    D3d11CreateDeviceBgraSupport,
                    IntPtr.Zero,
                    0,
                    D3d11SdkVersion,
                    out d3dDevicePointer,
                    out featureLevel,
                    out immediateContextPointer
                );
            }

            if (IsFailed(hr))
            {
                throw NativeHostException.FromHResult("D3D11CreateDevice", hr, "Failed to create a Direct3D11 device for WGC capture.");
            }

            IntPtr dxgiDevicePointer = IntPtr.Zero;
            IntPtr inspectablePointer = IntPtr.Zero;
            try
            {
                var dxgiGuid = DxgiDeviceGuid;
                hr = Marshal.QueryInterface(d3dDevicePointer, ref dxgiGuid, out dxgiDevicePointer);
                if (IsFailed(hr))
                {
                    throw NativeHostException.FromHResult("IDXGIDevice", hr, "Failed to query IDXGIDevice for WGC capture.");
                }

                hr = CreateDirect3D11DeviceFromDXGIDevice(dxgiDevicePointer, out inspectablePointer);
                if (IsFailed(hr))
                {
                    throw NativeHostException.FromHResult(
                        "CreateDirect3D11DeviceFromDXGIDevice",
                        hr,
                        "Failed to wrap the Direct3D11 device for WGC capture."
                    );
                }

                var device = MarshalInterface<IDirect3DDevice>.FromAbi(inspectablePointer);
                if (device == null)
                {
                    throw NativeHostException.NativeExecution(
                        "IDirect3DDevice",
                        "Failed to materialize the WinRT Direct3D device for WGC capture.",
                        new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
                    );
                }

                return device;
            }
            finally
            {
                if (inspectablePointer != IntPtr.Zero)
                {
                    Marshal.Release(inspectablePointer);
                }
                if (dxgiDevicePointer != IntPtr.Zero)
                {
                    Marshal.Release(dxgiDevicePointer);
                }
                if (immediateContextPointer != IntPtr.Zero)
                {
                    Marshal.Release(immediateContextPointer);
                }
                if (d3dDevicePointer != IntPtr.Zero)
                {
                    Marshal.Release(d3dDevicePointer);
                }
            }
        }

        private Dictionary<string, object> CreateScreenshotPayloadFromSoftwareBitmap(
            SoftwareBitmap softwareBitmap,
            int jpegQuality,
            string source
        )
        {
            var width = softwareBitmap.PixelWidth;
            var height = softwareBitmap.PixelHeight;
            var rawBytes = EncodeSoftwareBitmap(softwareBitmap, BitmapEncoder.PngEncoderId, null);
            var jpegBytes = EncodeSoftwareBitmap(softwareBitmap, BitmapEncoder.JpegEncoderId, CreateJpegQualityPropertySet(jpegQuality));
            return CreateScreenshotPayload(rawBytes, jpegBytes, width, height, source);
        }

        private Dictionary<string, object> CreateScreenshotPayloadFromBitmap(Bitmap bitmap, int jpegQuality)
        {
            byte[] rawBytes;
            using (var rawStream = new MemoryStream())
            {
                bitmap.Save(rawStream, ImageFormat.Png);
                rawBytes = rawStream.ToArray();
            }

            byte[] jpegBytes;
            using (var jpegStream = new MemoryStream())
            {
                var encoder = FindJpegEncoder();
                if (encoder == null)
                {
                    bitmap.Save(jpegStream, ImageFormat.Jpeg);
                }
                else
                {
                    using (var encoderParameters = new EncoderParameters(1))
                    {
                        encoderParameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, jpegQuality);
                        bitmap.Save(jpegStream, encoder, encoderParameters);
                    }
                }

                jpegBytes = jpegStream.ToArray();
            }

            return CreateScreenshotPayload(rawBytes, jpegBytes, bitmap.Width, bitmap.Height, "gdi_fallback");
        }

        private Dictionary<string, object> CreateScreenshotPayload(
            byte[] rawBytes,
            byte[] jpegBytes,
            int width,
            int height,
            string source
        )
        {
            var raw = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            raw["data"] = Convert.ToBase64String(rawBytes);
            raw["mime"] = "image/png";
            raw["byteLength"] = rawBytes.Length;

            var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            result["raw"] = raw;
            result["data"] = Convert.ToBase64String(jpegBytes);
            result["mime"] = "image/jpeg";
            result["width"] = width;
            result["height"] = height;
            result["byteLength"] = jpegBytes.Length;
            result["source"] = source;
            return result;
        }

        private byte[] EncodeSoftwareBitmap(
            SoftwareBitmap softwareBitmap,
            Guid encoderId,
            BitmapPropertySet properties
        )
        {
            using (var stream = new InMemoryRandomAccessStream())
            {
                BitmapEncoder encoder;
                if (properties == null)
                {
                    encoder = BitmapEncoder.CreateAsync(encoderId, stream).AsTask().GetAwaiter().GetResult();
                }
                else
                {
                    encoder = BitmapEncoder.CreateAsync(encoderId, stream, properties).AsTask().GetAwaiter().GetResult();
                }

                encoder.SetSoftwareBitmap(softwareBitmap);
                encoder.FlushAsync().AsTask().GetAwaiter().GetResult();
                return ReadRandomAccessStreamBytes(stream);
            }
        }

        private BitmapPropertySet CreateJpegQualityPropertySet(int jpegQuality)
        {
            var properties = new BitmapPropertySet();
            var normalizedQuality = Math.Max(0.01f, Math.Min(1.0f, jpegQuality / 100.0f));
            properties.Add("ImageQuality", new BitmapTypedValue(normalizedQuality, PropertyType.Single));
            return properties;
        }

        private byte[] ReadRandomAccessStreamBytes(IRandomAccessStream stream)
        {
            stream.Seek(0);
            using (var input = stream.GetInputStreamAt(0))
            using (var reader = new DataReader(input))
            {
                reader.LoadAsync((uint)stream.Size).AsTask().GetAwaiter().GetResult();
                var bytes = new byte[(int)stream.Size];
                reader.ReadBytes(bytes);
                return bytes;
            }
        }

        private AccessibilityCaptureResult BuildAccessibilityTree(
            IntPtr hwnd,
            AccessibilityCaptureOptions options
        )
        {
            var root = AutomationElement.FromHandle(hwnd);
            if (root == null)
            {
                throw NativeHostException.NativeExecution(
                    "UIAutomation.ElementFromHandle",
                    "Failed to resolve the UIA root element for the target window.",
                    CreateDetails("windowId", hwnd.ToInt64()),
                    CreateUiaRefreshGuidance()
                );
            }

            if (options.HasFilter)
            {
                return BuildFilteredAccessibilityTree(root, options);
            }

            return BuildFullAccessibilityTree(root, options);
        }

        private AccessibilityCaptureResult BuildFullAccessibilityTree(
            AutomationElement root,
            AccessibilityCaptureOptions options
        )
        {
            var result = new AccessibilityCaptureResult();
            var nextIndex = 0;
            result.Root = SerializeFullElement(root, ref nextIndex, options, result);
            return result;
        }

        private Dictionary<string, object> SerializeFullElement(
            AutomationElement element,
            ref int nextIndex,
            AccessibilityCaptureOptions options,
            AccessibilityCaptureResult result
        )
        {
            ThrowIfInterrupted();

            var elementIndex = nextIndex++;
            result.TotalCount++;
            result.MatchedCount++;

            Dictionary<string, object> payload = null;
            List<Dictionary<string, object>> children = null;
            if (result.ReturnedCount < options.MaxElements)
            {
                payload = CreateAccessibilityNodePayload(element, elementIndex);
                children = new List<Dictionary<string, object>>();
                payload["children"] = children;
                result.MarkReturned(elementIndex);
            }
            else
            {
                result.Truncated = true;
            }

            var walker = TreeWalker.ControlViewWalker;
            var child = walker.GetFirstChild(element);
            while (child != null)
            {
                var childPayload = SerializeFullElement(child, ref nextIndex, options, result);
                if (payload != null && childPayload != null)
                {
                    children.Add(childPayload);
                }
                child = walker.GetNextSibling(child);
            }

            return payload;
        }

        private AccessibilityCaptureResult BuildFilteredAccessibilityTree(
            AutomationElement root,
            AccessibilityCaptureOptions options
        )
        {
            var result = new AccessibilityCaptureResult();
            var nextIndex = 0;
            var rootIndex = nextIndex++;
            result.TotalCount++;

            result.Root = CreateAccessibilityNodePayload(root, rootIndex);
            var children = new List<Dictionary<string, object>>();
            result.Root["children"] = children;
            result.MarkReturned(rootIndex);

            if (ElementMatchesFilter(root, options))
            {
                result.MatchedCount++;
            }

            var walker = TreeWalker.ControlViewWalker;
            var child = walker.GetFirstChild(root);
            while (child != null)
            {
                AppendFilteredAccessibilityNodes(child, ref nextIndex, options, result, children);
                child = walker.GetNextSibling(child);
            }

            return result;
        }

        private void AppendFilteredAccessibilityNodes(
            AutomationElement element,
            ref int nextIndex,
            AccessibilityCaptureOptions options,
            AccessibilityCaptureResult result,
            IList<Dictionary<string, object>> matches
        )
        {
            ThrowIfInterrupted();

            var elementIndex = nextIndex++;
            result.TotalCount++;
            if (ElementMatchesFilter(element, options))
            {
                result.MatchedCount++;
                if (result.ReturnedCount < options.MaxElements)
                {
                    var payload = CreateAccessibilityNodePayload(element, elementIndex);
                    payload["children"] = new List<Dictionary<string, object>>();
                    matches.Add(payload);
                    result.MarkReturned(elementIndex);
                }
                else
                {
                    result.Truncated = true;
                }
            }

            var walker = TreeWalker.ControlViewWalker;
            var child = walker.GetFirstChild(element);
            while (child != null)
            {
                AppendFilteredAccessibilityNodes(child, ref nextIndex, options, result, matches);
                child = walker.GetNextSibling(child);
            }
        }

        private Dictionary<string, object> CreateAccessibilityNodePayload(
            AutomationElement element,
            int elementIndex
        )
        {
            var payload = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            payload["index"] = elementIndex;
            payload["role"] = CleanControlTypeName(element.Current.ControlType);
            if (!string.IsNullOrWhiteSpace(element.Current.Name))
            {
                payload["name"] = element.Current.Name;
            }
            if (!string.IsNullOrWhiteSpace(element.Current.HelpText))
            {
                payload["description"] = element.Current.HelpText;
            }

            var bounds = element.Current.BoundingRectangle;
            if (!bounds.IsEmpty)
            {
                payload["bounds"] = RectToPayload(bounds);
            }

            payload["enabled"] = element.Current.IsEnabled;
            payload["offscreen"] = element.Current.IsOffscreen;

            var value = ReadElementValue(element);
            if (!string.IsNullOrEmpty(value))
            {
                payload["value"] = value;
            }

            var patterns = ReadPatternNames(element);
            if (patterns.Count > 0)
            {
                payload["patterns"] = patterns;
                payload["secondaryActions"] = BuildSecondaryActions(patterns);
            }

            if (!payload.ContainsKey("children"))
            {
                payload["children"] = new List<Dictionary<string, object>>();
            }

            return payload;
        }

        private static bool ElementMatchesFilter(
            AutomationElement element,
            AccessibilityCaptureOptions options
        )
        {
            var role = CleanControlTypeName(element.Current.ControlType);
            if (options.RoleFilter.Count > 0 && !options.RoleFilter.Contains(role))
            {
                return false;
            }

            if (!string.IsNullOrWhiteSpace(options.NameContains))
            {
                var name = element.Current.Name ?? string.Empty;
                if (name.IndexOf(options.NameContains, StringComparison.OrdinalIgnoreCase) < 0)
                {
                    return false;
                }
            }

            return true;
        }

        private AutomationElement ResolveElementByIndex(IntPtr hwnd, int elementIndex)
        {
            if (elementIndex < 0)
            {
                throw NativeHostException.InvalidRequest("element_index must be non-negative.");
            }

            var root = AutomationElement.FromHandle(hwnd);
            if (root == null)
            {
                throw NativeHostException.NativeExecution(
                    "UIAutomation.ElementFromHandle",
                    "Failed to resolve the UIA root element for the target window.",
                    CreateDetails("windowId", hwnd.ToInt64())
                );
            }

            var nextIndex = 0;
            var resolved = FindElementByIndex(root, elementIndex, ref nextIndex);
            if (resolved == null)
            {
                throw NativeHostException.NativeExecution(
                    "UIAutomation.FindElement",
                    "Could not find an element for the requested element_index.",
                    CreateDetails("elementIndex", elementIndex),
                    CreateUiaRefreshGuidance()
                );
            }

            return resolved;
        }

        private AutomationElement FindElementByIndex(AutomationElement element, int targetIndex, ref int nextIndex)
        {
            ThrowIfInterrupted();
            if (nextIndex == targetIndex)
            {
                return element;
            }

            nextIndex++;
            var walker = TreeWalker.ControlViewWalker;
            var child = walker.GetFirstChild(element);
            while (child != null)
            {
                var match = FindElementByIndex(child, targetIndex, ref nextIndex);
                if (match != null)
                {
                    return match;
                }
                child = walker.GetNextSibling(child);
            }

            return null;
        }

        private static bool TryInvokeElement(AutomationElement element)
        {
            object pattern;
            if (!element.TryGetCurrentPattern(InvokePattern.Pattern, out pattern))
            {
                return false;
            }

            ((InvokePattern)pattern).Invoke();
            return true;
        }

        private static bool TrySelectElement(AutomationElement element)
        {
            object pattern;
            if (!element.TryGetCurrentPattern(SelectionItemPattern.Pattern, out pattern))
            {
                return false;
            }

            ((SelectionItemPattern)pattern).Select();
            return true;
        }

        private static void InvokeScrollPattern(
            AutomationElement element,
            ScrollAmount horizontal,
            ScrollAmount vertical,
            int elementIndex
        )
        {
            object pattern;
            if (!element.TryGetCurrentPattern(ScrollPattern.Pattern, out pattern))
            {
                throw NativeHostException.NativeExecution(
                    "UIAutomation.ScrollPattern",
                    "Element does not support ScrollPattern.",
                    CreateDetails("elementIndex", elementIndex),
                    CreateUiaFallbackGuidance()
                );
            }

            ((ScrollPattern)pattern).Scroll(horizontal, vertical);
        }

        private static void InvokeExpandCollapsePattern(AutomationElement element, bool expand, int elementIndex)
        {
            object pattern;
            if (!element.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out pattern))
            {
                throw NativeHostException.NativeExecution(
                    "UIAutomation.ExpandCollapsePattern",
                    "Element does not support ExpandCollapsePattern.",
                    CreateDetails("elementIndex", elementIndex),
                    CreateUiaFallbackGuidance()
                );
            }

            if (expand)
            {
                ((ExpandCollapsePattern)pattern).Expand();
            }
            else
            {
                ((ExpandCollapsePattern)pattern).Collapse();
            }
        }

        private static string ReadElementValue(AutomationElement element)
        {
            object pattern;
            if (element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern))
            {
                try
                {
                    var value = ((ValuePattern)pattern).Current.Value;
                    if (!string.IsNullOrEmpty(value))
                    {
                        return value;
                    }
                }
                catch
                {
                }
            }

            if (element.TryGetCurrentPattern(TextPattern.Pattern, out pattern))
            {
                try
                {
                    return ((TextPattern)pattern).DocumentRange.GetText(4096);
                }
                catch
                {
                    return null;
                }
            }

            return null;
        }

        private static List<string> ReadPatternNames(AutomationElement element)
        {
            var names = new List<string>();
            foreach (var pattern in element.GetSupportedPatterns())
            {
                if (pattern == InvokePattern.Pattern)
                {
                    names.Add("InvokePattern");
                }
                else if (pattern == SelectionItemPattern.Pattern)
                {
                    names.Add("SelectionItemPattern");
                }
                else if (pattern == ValuePattern.Pattern)
                {
                    names.Add("ValuePattern");
                }
                else if (pattern == ScrollPattern.Pattern)
                {
                    names.Add("ScrollPattern");
                }
                else if (pattern == ExpandCollapsePattern.Pattern)
                {
                    names.Add("ExpandCollapsePattern");
                }
                else if (pattern == TextPattern.Pattern)
                {
                    names.Add("TextPattern");
                }
            }

            return names;
        }

        private static List<string> BuildSecondaryActions(IList<string> patterns)
        {
            var actions = new List<string>();
            if (patterns.Contains("InvokePattern") || patterns.Contains("SelectionItemPattern"))
            {
                actions.Add("raise");
            }
            if (patterns.Contains("ScrollPattern"))
            {
                actions.Add("scroll up");
                actions.Add("scroll left");
                actions.Add("scroll down");
                actions.Add("scroll right");
            }
            if (patterns.Contains("ExpandCollapsePattern"))
            {
                actions.Add("expand");
                actions.Add("collapse");
            }

            return actions;
        }

        private static string CleanControlTypeName(ControlType controlType)
        {
            var name = controlType.ProgrammaticName;
            const string prefix = "ControlType.";
            return name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ? name.Substring(prefix.Length) : name;
        }

        private static Dictionary<string, object> RectToPayload(RECT rect)
        {
            var payload = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            payload["left"] = rect.Left;
            payload["top"] = rect.Top;
            payload["right"] = rect.Right;
            payload["bottom"] = rect.Bottom;
            return payload;
        }

        private static Dictionary<string, object> RectToPayload(System.Windows.Rect rect)
        {
            var payload = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            payload["left"] = (int)Math.Round(rect.Left);
            payload["top"] = (int)Math.Round(rect.Top);
            payload["right"] = (int)Math.Round(rect.Right);
            payload["bottom"] = (int)Math.Round(rect.Bottom);
            return payload;
        }

        private static ImageCodecInfo FindJpegEncoder()
        {
            foreach (var encoder in ImageCodecInfo.GetImageEncoders())
            {
                if (string.Equals(encoder.MimeType, "image/jpeg", StringComparison.OrdinalIgnoreCase))
                {
                    return encoder;
                }
            }

            return null;
        }

        private static string NormalizeButton(string button)
        {
            switch (button)
            {
                case "l":
                case "left":
                    return "left";
                case "r":
                case "right":
                    return "right";
                case "m":
                case "middle":
                    return "middle";
                default:
                    throw NativeHostException.InvalidRequest("Unsupported mouse button: " + button);
            }
        }

        private List<AppDescriptorDto> EnumerateShellApps()
        {
            var apps = new List<AppDescriptorDto>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            try
            {
                var shellType = Type.GetTypeFromProgID("Shell.Application");
                if (shellType == null)
                {
                    return apps;
                }

                var shell = Activator.CreateInstance(shellType);
                if (shell == null)
                {
                    return apps;
                }

                var folder = InvokeCom(shell, "NameSpace", "shell:AppsFolder");
                if (folder == null)
                {
                    return apps;
                }

                var items = InvokeCom(folder, "Items");
                if (items == null)
                {
                    return apps;
                }

                var count = Convert.ToInt32(GetCom(items, "Count"));
                for (var index = 0; index < count; index++)
                {
                    ThrowIfInterrupted();

                    var item = InvokeCom(items, "Item", index);
                    if (item == null)
                    {
                        continue;
                    }

                    var displayName = ReadComString(item, "Name");
                    var appId = ReadExtendedProperty(item, "System.AppUserModel.ID");
                    var pathValue = ReadComString(item, "Path");
                    var executablePath = LooksLikeExecutablePath(pathValue) ? pathValue : null;
                    var identifier = !string.IsNullOrWhiteSpace(appId) ? appId : executablePath;
                    if (string.IsNullOrWhiteSpace(identifier) || seen.Contains(identifier))
                    {
                        continue;
                    }

                    seen.Add(identifier);
                    apps.Add(new AppDescriptorDto
                    {
                        Id = identifier,
                        DisplayName = displayName,
                        ExecutablePath = executablePath,
                        ActivationModel = !string.IsNullOrWhiteSpace(appId) ? "app_user_model_id" : "executable_path"
                    });
                }
            }
            catch
            {
                return apps;
            }

            return apps;
        }

        private Dictionary<string, object> BuildAppPayload(
            AppDescriptorDto app,
            IDictionary<string, List<Dictionary<string, object>>> windowsByApp,
            ISet<string> runningExecutablePaths
        )
        {
            List<Dictionary<string, object>> windows;
            windowsByApp.TryGetValue(app.Id, out windows);
            var hasVisibleWindow = windows != null && windows.Count > 0;
            var hasRunningProcess = HasRunningExecutableProcess(app, runningExecutablePaths);

            var payload = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            payload["id"] = app.Id;
            payload["windows"] = windows ?? new List<Dictionary<string, object>>();
            payload["isRunning"] = hasVisibleWindow || hasRunningProcess;
            payload["activationModel"] = app.ActivationModel;

            if (!string.IsNullOrWhiteSpace(app.DisplayName))
            {
                payload["displayName"] = app.DisplayName;
            }

            if (!string.IsNullOrWhiteSpace(app.ExecutablePath))
            {
                payload["executablePath"] = app.ExecutablePath;
            }

            return payload;
        }

        private bool HasRunningExecutableProcess(AppDescriptorDto app, ISet<string> runningExecutablePaths)
        {
            if (!string.IsNullOrWhiteSpace(app.ExecutablePath) && runningExecutablePaths.Contains(app.ExecutablePath))
            {
                return true;
            }

            return LooksLikeExecutablePath(app.Id) && runningExecutablePaths.Contains(app.Id);
        }

        private HashSet<string> EnumerateRunningExecutablePaths()
        {
            var running = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var process in Process.GetProcesses())
            {
                try
                {
                    var processPath = GetProcessPath((uint)process.Id);
                    if (!string.IsNullOrWhiteSpace(processPath))
                    {
                        running.Add(processPath);
                    }
                }
                catch
                {
                }
                finally
                {
                    process.Dispose();
                }
            }

            return running;
        }

        private bool HasRunningExecutableProcess(string executablePath)
        {
            foreach (var process in Process.GetProcesses())
            {
                try
                {
                    var processPath = GetProcessPath((uint)process.Id);
                    if (string.Equals(processPath, executablePath, StringComparison.OrdinalIgnoreCase))
                    {
                        return true;
                    }
                }
                catch
                {
                }
                finally
                {
                    process.Dispose();
                }
            }

            return false;
        }

        private static object InvokeCom(object target, string name, params object[] args)
        {
            try
            {
                return target.GetType().InvokeMember(
                    name,
                    System.Reflection.BindingFlags.InvokeMethod,
                    null,
                    target,
                    args
                );
            }
            catch
            {
                return null;
            }
        }

        private static object GetCom(object target, string name)
        {
            try
            {
                return target.GetType().InvokeMember(
                    name,
                    System.Reflection.BindingFlags.GetProperty,
                    null,
                    target,
                    null
                );
            }
            catch
            {
                return null;
            }
        }

        private static string ReadComString(object target, string propertyName)
        {
            var value = GetCom(target, propertyName);
            return value == null ? null : Convert.ToString(value);
        }

        private static string ReadExtendedProperty(object item, string propertyName)
        {
            var value = InvokeCom(item, "ExtendedProperty", propertyName);
            return value == null ? null : Convert.ToString(value);
        }

        private void LaunchProcess(string applicationName, string commandLine, string workingDirectory)
        {
            ThrowIfInterrupted();

            var startupInfo = new STARTUPINFO();
            startupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFO));

            var processInformation = new PROCESS_INFORMATION();
            var commandBuffer = string.IsNullOrWhiteSpace(commandLine) ? null : new StringBuilder(commandLine);
            var created = CreateProcessW(
                applicationName,
                commandBuffer,
                IntPtr.Zero,
                IntPtr.Zero,
                false,
                0,
                IntPtr.Zero,
                string.IsNullOrWhiteSpace(workingDirectory) ? null : workingDirectory,
                ref startupInfo,
                out processInformation
            );

            if (!created)
            {
                ThrowLastWin32Error(
                    "CreateProcessW",
                    "Failed to launch the requested application.",
                    CreateLaunchGuidance()
                );
            }

            try
            {
                // The helper mirrors the official behavior by returning after launch succeeds.
            }
            finally
            {
                if (processInformation.hProcess != IntPtr.Zero)
                {
                    CloseHandle(processInformation.hProcess);
                }

                if (processInformation.hThread != IntPtr.Zero)
                {
                    CloseHandle(processInformation.hThread);
                }
            }
        }

        private void EnsureTurnInitialized()
        {
            if (!turnInitialized)
            {
                throw NativeHostException.Lifecycle("Turn lifecycle has not been initialized. Call beginTurn first.");
            }
        }

        private void ThrowIfInterrupted()
        {
            if (escapeHook != null)
            {
                escapeHook.ThrowIfTriggered();
            }
        }

        private static void WithDpiGuard(Action action)
        {
            var savedContext = SetThreadDpiAwarenessContext(DpiAwarenessContextPerMonitorAwareV2);
            if (savedContext == IntPtr.Zero)
            {
                savedContext = SetThreadDpiAwarenessContext(DpiAwarenessContextPerMonitorAware);
            }

            try
            {
                action();
            }
            finally
            {
                if (savedContext != IntPtr.Zero)
                {
                    SetThreadDpiAwarenessContext(savedContext);
                }
            }
        }

        private static Dictionary<string, object> ReadRequiredDictionary(IDictionary<string, object> values, string key)
        {
            object value;
            if (!values.TryGetValue(key, out value) || value == null)
            {
                throw NativeHostException.InvalidRequest("Native-host payload is missing '" + key + "'.");
            }

            var dictionary = value as Dictionary<string, object>;
            if (dictionary == null)
            {
                throw NativeHostException.InvalidRequest("Native-host payload '" + key + "' must be an object.");
            }

            return dictionary;
        }

        private static int ReadRequiredInt(IDictionary<string, object> values, string key)
        {
            object value;
            if (!values.TryGetValue(key, out value))
            {
                throw NativeHostException.InvalidRequest("Native-host payload is missing '" + key + "'.");
            }

            return Convert.ToInt32(value);
        }

        private static long ReadRequiredLong(IDictionary<string, object> values, string key)
        {
            object value;
            if (!values.TryGetValue(key, out value))
            {
                throw NativeHostException.InvalidRequest("Native-host payload is missing '" + key + "'.");
            }

            return Convert.ToInt64(value);
        }

        private static string ReadRequiredString(IDictionary<string, object> values, string key)
        {
            object value;
            if (!values.TryGetValue(key, out value) || value == null)
            {
                throw NativeHostException.InvalidRequest("Native-host payload is missing '" + key + "'.");
            }

            var text = value.ToString();
            if (string.IsNullOrWhiteSpace(text))
            {
                throw NativeHostException.InvalidRequest("Native-host payload '" + key + "' is empty.");
            }

            return text;
        }

        private static string ReadRequiredLiteralText(IDictionary<string, object> values, string key)
        {
            object value;
            if (!values.TryGetValue(key, out value) || value == null)
            {
                throw NativeHostException.InvalidRequest("Native-host payload is missing '" + key + "'.");
            }

            return value.ToString() ?? string.Empty;
        }

        private static string ReadOptionalString(IDictionary<string, object> values, string key)
        {
            object value;
            if (!values.TryGetValue(key, out value) || value == null)
            {
                return null;
            }

            var text = value.ToString();
            return string.IsNullOrWhiteSpace(text) ? null : text.Trim();
        }

        private static IList<string> ReadOptionalStringList(IDictionary<string, object> values, string key)
        {
            object value;
            if (!values.TryGetValue(key, out value) || value == null)
            {
                return new List<string>();
            }

            if (value is string)
            {
                throw NativeHostException.InvalidRequest("Native-host payload '" + key + "' must be an array.");
            }

            var items = value as IEnumerable;
            if (items == null)
            {
                throw NativeHostException.InvalidRequest("Native-host payload '" + key + "' must be an array.");
            }

            var result = new List<string>();
            foreach (var item in items)
            {
                if (item == null)
                {
                    continue;
                }

                var text = item.ToString();
                if (!string.IsNullOrWhiteSpace(text))
                {
                    result.Add(text.Trim());
                }
            }

            return result;
        }

        private static bool ReadOptionalBool(IDictionary<string, object> values, string key, bool defaultValue)
        {
            object value;
            if (!values.TryGetValue(key, out value) || value == null)
            {
                return defaultValue;
            }

            return Convert.ToBoolean(value);
        }

        private static int ReadOptionalInt(IDictionary<string, object> values, string key, int defaultValue)
        {
            object value;
            if (!values.TryGetValue(key, out value) || value == null)
            {
                return defaultValue;
            }

            return Convert.ToInt32(value);
        }

        private static IntPtr GetWindowHandle(IDictionary<string, object> payload)
        {
            var window = ReadRequiredDictionary(payload, "window");
            return new IntPtr(ReadRequiredLong(window, "id"));
        }

        private static long? ReadOptionalWindowId(IDictionary<string, object> window)
        {
            if (window == null)
            {
                return null;
            }

            object value;
            if (!window.TryGetValue("id", out value) || value == null)
            {
                return null;
            }

            return Convert.ToInt64(value);
        }

        private static IList<KeyboardInputDto> GetKeyboardInputs(IDictionary<string, object> payload)
        {
            object rawInputs;
            if (!payload.TryGetValue("inputs", out rawInputs) || rawInputs == null)
            {
                throw NativeHostException.InvalidRequest("Keyboard input payload must include 'inputs'.");
            }

            var array = rawInputs as ArrayList;
            if (array == null)
            {
                throw NativeHostException.InvalidRequest("Keyboard input payload must provide an array of inputs.");
            }

            var inputs = new List<KeyboardInputDto>(array.Count);
            foreach (var item in array)
            {
                var dictionary = item as Dictionary<string, object>;
                if (dictionary == null)
                {
                    throw NativeHostException.InvalidRequest("Keyboard input items must be objects.");
                }

                object scanCodeValue;
                dictionary.TryGetValue("scanCode", out scanCodeValue);
                inputs.Add(new KeyboardInputDto
                {
                    VkCode = (ushort)ReadRequiredInt(dictionary, "vkCode"),
                    ScanCode = scanCodeValue == null ? (ushort)0 : (ushort)Convert.ToInt32(scanCodeValue),
                    Flags = (uint)ReadRequiredInt(dictionary, "flags")
                });
            }

            return inputs;
        }

        private static PointerClickDto GetPointerClick(IDictionary<string, object> payload)
        {
            var click = ReadRequiredDictionary(payload, "click");
            return new PointerClickDto
            {
                X = ReadRequiredInt(click, "x"),
                Y = ReadRequiredInt(click, "y"),
                Button = ReadRequiredString(click, "button"),
                ClickCount = Math.Max(1, ReadRequiredInt(click, "clickCount"))
            };
        }

        private static PointerScrollDto GetPointerScroll(IDictionary<string, object> payload)
        {
            var scroll = ReadRequiredDictionary(payload, "scroll");
            return new PointerScrollDto
            {
                X = ReadRequiredInt(scroll, "x"),
                Y = ReadRequiredInt(scroll, "y"),
                ScrollX = ReadRequiredInt(scroll, "scrollX"),
                ScrollY = ReadRequiredInt(scroll, "scrollY")
            };
        }

        private static PointerDragDto GetPointerDrag(IDictionary<string, object> payload)
        {
            var drag = ReadRequiredDictionary(payload, "drag");
            return new PointerDragDto
            {
                FromX = ReadRequiredInt(drag, "fromX"),
                FromY = ReadRequiredInt(drag, "fromY"),
                ToX = ReadRequiredInt(drag, "toX"),
                ToY = ReadRequiredInt(drag, "toY"),
                Button = ReadRequiredString(drag, "button"),
                DurationMs = Math.Max(0, ReadRequiredInt(drag, "durationMs")),
                Steps = Math.Max(1, ReadRequiredInt(drag, "steps"))
            };
        }

        private static TurnContext ParseTurnContext(IDictionary<string, object> payload)
        {
            var meta = ReadOptionalDictionary(payload, "meta");
            if (meta == null)
            {
                return null;
            }

            var codexTurnMetadata = ReadOptionalDictionary(meta, "codexTurnMetadata");
            if (codexTurnMetadata == null)
            {
                return null;
            }

            var sessionId = ReadOptionalString(codexTurnMetadata, "session_id");
            var turnId = ReadOptionalString(codexTurnMetadata, "turn_id");
            if (string.IsNullOrWhiteSpace(sessionId) || string.IsNullOrWhiteSpace(turnId))
            {
                return null;
            }

            return new TurnContext(sessionId, turnId, ResolveCodexHome());
        }

        private static Dictionary<string, object> ReadOptionalDictionary(IDictionary<string, object> values, string key)
        {
            object value;
            if (!values.TryGetValue(key, out value) || value == null)
            {
                return null;
            }

            return value as Dictionary<string, object>;
        }

        private static string ResolveCodexHome()
        {
            var env = Environment.GetEnvironmentVariable("CODEX_HOME");
            if (!string.IsNullOrWhiteSpace(env))
            {
                return env;
            }

            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".codex"
            );
        }

        private static void EnsureWindow(IntPtr hwnd)
        {
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd))
            {
                var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                details["windowId"] = hwnd.ToInt64();
                throw NativeHostException.NativeExecution(
                    "IsWindow",
                    "The requested window handle is not valid.",
                    details
                );
            }
        }

        private static bool IsForegroundWindow(IntPtr hwnd)
        {
            var foreground = GetForegroundWindow();
            return foreground != IntPtr.Zero && foreground == hwnd;
        }

        private static void TryAttachThreadInput(
            uint sourceThreadId,
            uint targetThreadId,
            IList<ThreadAttachment> attachments
        )
        {
            if (sourceThreadId == 0 || targetThreadId == 0 || sourceThreadId == targetThreadId)
            {
                return;
            }

            if (!AttachThreadInput(sourceThreadId, targetThreadId, true))
            {
                var error = Marshal.GetLastWin32Error();
                if (error != 0)
                {
                    var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                    details["sourceThreadId"] = sourceThreadId;
                    details["targetThreadId"] = targetThreadId;
                    details["win32Error"] = error;
                    details["win32Message"] = new Win32Exception(error).Message;
                    throw NativeHostException.NativeExecution(
                        "AttachThreadInput",
                        "Failed to attach the foreground thread input queues.",
                        details
                    );
                }
            }

            attachments.Add(new ThreadAttachment(sourceThreadId, targetThreadId));
        }

        private static void SendEscapeUnlock()
        {
            keybd_event(0x1B, 0, 0, UIntPtr.Zero);
            keybd_event(0x1B, 0, 0x0002, UIntPtr.Zero);
        }

        private static void SendAltUnlock()
        {
            var nativeInputs = new[]
            {
                new INPUT
                {
                    type = 1,
                    U = new INPUTUNION
                    {
                        ki = new KEYBDINPUT
                        {
                            wVk = 0x12,
                            wScan = 0,
                            dwFlags = 0
                        }
                    }
                },
                new INPUT
                {
                    type = 1,
                    U = new INPUTUNION
                    {
                        ki = new KEYBDINPUT
                        {
                            wVk = 0x12,
                            wScan = 0,
                            dwFlags = 0x0002
                        }
                    }
                }
            };

            var sent = (int)SendInput((uint)nativeInputs.Length, nativeInputs, Marshal.SizeOf(typeof(INPUT)));
            if (sent != nativeInputs.Length)
            {
                ThrowLastWin32Error("SendInput", "Failed to send the Alt unlock sequence.");
            }
        }

        private static void SendPasteShortcut()
        {
            var nativeInputs = new[]
            {
                CreateKeyboardInput(0x11, 0, 0),
                CreateKeyboardInput(0x56, 0, 0),
                CreateKeyboardInput(0x56, 0, 0x0002),
                CreateKeyboardInput(0x11, 0, 0x0002)
            };

            var sent = (int)SendInput((uint)nativeInputs.Length, nativeInputs, Marshal.SizeOf(typeof(INPUT)));
            if (sent != nativeInputs.Length)
            {
                ThrowLastWin32Error("SendInput", "Failed to send the Ctrl+V paste shortcut.");
            }
        }

        private static ClipboardSnapshot CaptureClipboardSnapshot()
        {
            OpenClipboardWithRetry();
            try
            {
                var snapshot = new ClipboardSnapshot();
                snapshot.FormatCount = CountClipboardFormats();
                if (IsClipboardFormatAvailable(CfUnicodeText))
                {
                    snapshot.HadUnicodeText = true;
                    snapshot.Text = ReadClipboardUnicodeTextUnsafe();
                }

                return snapshot;
            }
            finally
            {
                CloseClipboard();
            }
        }

        private static string ReadClipboardUnicodeTextUnsafe()
        {
            var handle = GetClipboardData(CfUnicodeText);
            if (handle == IntPtr.Zero)
            {
                ThrowLastWin32Error("GetClipboardData", "Failed to read Unicode text from the clipboard.");
            }

            var locked = GlobalLock(handle);
            if (locked == IntPtr.Zero)
            {
                ThrowLastWin32Error("GlobalLock", "Failed to lock the clipboard text payload.");
            }

            try
            {
                return Marshal.PtrToStringUni(locked) ?? string.Empty;
            }
            finally
            {
                GlobalUnlock(handle);
            }
        }

        private static void SetClipboardUnicodeText(string text)
        {
            OpenClipboardWithRetry();
            IntPtr handle = IntPtr.Zero;
            IntPtr locked = IntPtr.Zero;

            try
            {
                if (!EmptyClipboard())
                {
                    ThrowLastWin32Error("EmptyClipboard", "Failed to clear the clipboard before pasting text.");
                }

                var bytes = Encoding.Unicode.GetBytes(text + '\0');
                handle = GlobalAlloc(GmemMoveable, (UIntPtr)bytes.Length);
                if (handle == IntPtr.Zero)
                {
                    ThrowLastWin32Error("GlobalAlloc", "Failed to allocate clipboard storage for pasted text.");
                }

                locked = GlobalLock(handle);
                if (locked == IntPtr.Zero)
                {
                    ThrowLastWin32Error("GlobalLock", "Failed to lock clipboard storage for pasted text.");
                }

                Marshal.Copy(bytes, 0, locked, bytes.Length);
                GlobalUnlock(handle);
                locked = IntPtr.Zero;

                if (SetClipboardData(CfUnicodeText, handle) == IntPtr.Zero)
                {
                    ThrowLastWin32Error("SetClipboardData", "Failed to publish pasted text to the clipboard.");
                }

                handle = IntPtr.Zero;
            }
            finally
            {
                if (locked != IntPtr.Zero)
                {
                    GlobalUnlock(handle);
                }

                if (handle != IntPtr.Zero)
                {
                    GlobalFree(handle);
                }

                CloseClipboard();
            }
        }

        private static void TryRestoreClipboardUnicodeText(string text)
        {
            try
            {
                SetClipboardUnicodeText(text);
            }
            catch
            {
            }
        }

        private static void TryClearClipboard()
        {
            try
            {
                OpenClipboardWithRetry();
                try
                {
                    EmptyClipboard();
                }
                finally
                {
                    CloseClipboard();
                }
            }
            catch
            {
            }
        }

        private static void OpenClipboardWithRetry()
        {
            for (var attempt = 0; attempt < 5; attempt++)
            {
                if (OpenClipboard(IntPtr.Zero))
                {
                    return;
                }

                Thread.Sleep(20);
            }

            ThrowLastWin32Error("OpenClipboard", "Failed to acquire the clipboard for text paste.");
        }

        private static bool TrySwitchToInputDesktop()
        {
            var inputDesktop = OpenInputDesktop(0, false, DesktopSwitchDesktop | DesktopReadObjects);
            if (inputDesktop == IntPtr.Zero)
            {
                return false;
            }

            try
            {
                return SwitchDesktop(inputDesktop);
            }
            finally
            {
                CloseDesktop(inputDesktop);
            }
        }

        private static bool IsWindowCloaked(IntPtr hwnd)
        {
            int cloaked = 0;
            var hr = DwmGetWindowAttribute(hwnd, DwmaCloaked, out cloaked, Marshal.SizeOf(typeof(int)));
            return hr == 0 && cloaked != 0;
        }

        private static bool TryGetWindowBounds(IntPtr hwnd, out RECT rect)
        {
            rect = new RECT();
            var hr = DwmGetWindowAttribute(hwnd, DwmaExtendedFrameBounds, out rect, Marshal.SizeOf(typeof(RECT)));
            if (hr == 0 && rect.Right > rect.Left && rect.Bottom > rect.Top)
            {
                return true;
            }

            if (!GetWindowRect(hwnd, out rect))
            {
                return false;
            }

            return rect.Right > rect.Left && rect.Bottom > rect.Top;
        }

        private static string GetWindowTitle(IntPtr hwnd)
        {
            var length = GetWindowTextLengthW(hwnd);
            if (length <= 0)
            {
                return null;
            }

            var builder = new StringBuilder(length + 1);
            var copied = GetWindowTextW(hwnd, builder, builder.Capacity);
            if (copied <= 0)
            {
                return null;
            }

            return builder.ToString();
        }

        private static string GetProcessPath(uint processId)
        {
            var handle = OpenProcess(ProcessQueryLimitedInformation, false, processId);
            if (handle == IntPtr.Zero)
            {
                return null;
            }

            try
            {
                var capacity = 32768;
                var builder = new StringBuilder(capacity);
                var size = capacity;
                if (!QueryFullProcessImageNameW(handle, 0, builder, ref size))
                {
                    return null;
                }

                return builder.ToString(0, size);
            }
            finally
            {
                CloseHandle(handle);
            }
        }

        private static string GetWindowProcessName(IntPtr hwnd)
        {
            uint processId;
            GetWindowThreadProcessId(hwnd, out processId);
            if (processId == 0)
            {
                return null;
            }

            try
            {
                using (var process = Process.GetProcessById((int)processId))
                {
                    return process.ProcessName;
                }
            }
            catch
            {
                return null;
            }
        }

        private static bool IsFilteredClassName(IntPtr hwnd)
        {
            var builder = new StringBuilder(256);
            var copied = GetClassNameW(hwnd, builder, builder.Capacity);
            if (copied <= 0)
            {
                return false;
            }

            var className = builder.ToString();
            foreach (var candidate in HiddenClassNames)
            {
                if (string.Equals(candidate, className, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        private static bool LooksLikeExecutablePath(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return false;
            }

            return value.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) &&
                (Path.IsPathRooted(value) || value.StartsWith("\\\\", StringComparison.OrdinalIgnoreCase));
        }

        private static INPUT CreateMouseInput(uint flags)
        {
            return CreateMouseInput(flags, 0, 0, 0);
        }

        private static INPUT CreateKeyboardInput(ushort vkCode, ushort scanCode, uint flags)
        {
            return new INPUT
            {
                type = 1,
                U = new INPUTUNION
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = vkCode,
                        wScan = scanCode,
                        dwFlags = flags,
                        time = 0,
                        dwExtraInfo = UIntPtr.Zero
                    }
                }
            };
        }

        private static INPUT CreateMouseInput(uint flags, int mouseData)
        {
            return CreateMouseInput(flags, mouseData, 0, 0);
        }

        private static INPUT CreateMouseInput(uint flags, int mouseData, int dx, int dy)
        {
            return new INPUT
            {
                type = 0,
                U = new INPUTUNION
                {
                    mi = new MOUSEINPUT
                    {
                        dx = dx,
                        dy = dy,
                        mouseData = (uint)mouseData,
                        dwFlags = flags,
                        time = 0,
                        dwExtraInfo = UIntPtr.Zero
                    }
                }
            };
        }

        private static int NormalizeAbsolute(double coordinate, int origin, int size)
        {
            if (size < 2)
            {
                return 0;
            }

            return (int)Math.Round(((coordinate - origin) * 0xffff) / (size - 1));
        }

        private static bool IsFailed(int hresult)
        {
            return hresult < 0;
        }

        private static void ThrowLastWin32Error(string api, string message)
        {
            ThrowLastWin32Error(api, message, null);
        }

        private static void ThrowLastWin32Error(string api, string message, Dictionary<string, object> guidance)
        {
            var error = Marshal.GetLastWin32Error();
            var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            details["win32Error"] = error;
            details["win32Message"] = new Win32Exception(error).Message;
            throw NativeHostException.NativeExecution(api, message, details, guidance);
        }

        private static Dictionary<string, object> CreateDetails(string key, object value)
        {
            var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            details[key] = value;
            return details;
        }

        private static Dictionary<string, object> CreateGuidance(
            bool shouldRetry,
            string userVisibleMessage,
            string modelAction,
            string suggestedMethod,
            Dictionary<string, object> suggestedParams
        )
        {
            var guidance = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            guidance["should_retry"] = shouldRetry;
            guidance["user_visible_message"] = userVisibleMessage;
            guidance["model_action"] = modelAction;
            if (!string.IsNullOrWhiteSpace(suggestedMethod))
            {
                guidance["suggested_tool_call"] = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
                {
                    { "method", suggestedMethod },
                    { "params", suggestedParams ?? new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase) }
                };
            }

            return guidance;
        }

        private static Dictionary<string, object> CreateStaleWindowGuidance()
        {
            return CreateGuidance(
                true,
                "The target window handle could not be resolved.",
                "Refresh the target with list_apps or get_window using the last known id/app, then retry with the returned window object.",
                "list_apps",
                new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
            );
        }

        private static Dictionary<string, object> CreateLaunchGuidance()
        {
            return CreateGuidance(
                true,
                "The requested application could not be launched.",
                "Call list_apps to verify the app id. If using a path, verify that the executable path and working directory exist; if the app is already running, use the taskbar restore guidance instead of retrying forcefully.",
                "list_apps",
                new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
            );
        }

        private static Dictionary<string, object> CreateCaptureGuidance()
        {
            return CreateGuidance(
                true,
                "The target window could not be captured from its current state.",
                "If the window may be minimized, call activate_window, refresh with get_window_state, and retry. Otherwise refresh the window object with list_apps/get_window.",
                null,
                null
            );
        }

        private static Dictionary<string, object> CreatePointerInputGuidance()
        {
            return CreateGuidance(
                true,
                "Pointer input could not be delivered at the requested coordinates.",
                "Refresh get_window_state and use the returned state.window rect. Check rectCoordinateSpace/rectOnVirtualScreen before retrying window-relative click, scroll, or drag coordinates.",
                null,
                null
            );
        }

        private static Dictionary<string, object> CreateKeyboardInputGuidance()
        {
            return CreateGuidance(
                true,
                "Keyboard input was not fully delivered.",
                "Refresh focus with activate_window or click a stable editable point, then retry. For IME-heavy or gdi_fallback windows, prefer press_key character-by-character over type_text.",
                null,
                null
            );
        }

        private static Dictionary<string, object> CreateTextInputGuidance(string userVisibleMessage, string modelAction)
        {
            return CreateGuidance(
                false,
                userVisibleMessage,
                modelAction,
                null,
                null
            );
        }

        private static Dictionary<string, object> CreateUiaRefreshGuidance()
        {
            return CreateGuidance(
                true,
                "The requested accessibility element could not be resolved.",
                "Call get_window_state with include_text:true again and use an element_index from that latest response. Element indexes are snapshot-scoped.",
                null,
                null
            );
        }

        private static Dictionary<string, object> CreateUiaFallbackGuidance()
        {
            return CreateGuidance(
                true,
                "The requested accessibility pattern is not available for this element.",
                "Use the latest screenshot to click stable window-relative coordinates, or use keyboard navigation/press_key after focusing the relevant control.",
                null,
                null
            );
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool BringWindowToTop(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetFocus(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        [DllImport("user32.dll")]
        private static extern IntPtr WindowFromPoint(POINT point);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);

        [DllImport("user32.dll")]
        private static extern bool IsHungAppWindow(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool GetLastInputInfo(ref LASTINPUTINFO info);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint cInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool OpenClipboard(IntPtr newOwner);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool CloseClipboard();

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool EmptyClipboard();

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr GetClipboardData(uint format);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetClipboardData(uint format, IntPtr memoryHandle);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool IsClipboardFormatAvailable(uint format);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern int CountClipboardFormats();

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetCursorPos(int x, int y);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool GetCursorPos(out POINT point);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr FindWindow(string className, string windowName);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern int GetWindowTextLengthW(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int maxCount);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern int GetClassNameW(IntPtr hWnd, StringBuilder className, int maxCount);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int index);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint desiredAccess);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SwitchDesktop(IntPtr desktopHandle);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool CloseDesktop(IntPtr desktopHandle);

        [DllImport("dwmapi.dll")]
        private static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);

        [DllImport("dwmapi.dll")]
        private static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out RECT rect, int size);

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool QueryFullProcessImageNameW(
            IntPtr processHandle,
            int flags,
            StringBuilder exeName,
            ref int size
        );

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint desiredAccess, bool inheritHandle, uint processId);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GlobalLock(IntPtr memoryHandle);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GlobalUnlock(IntPtr memoryHandle);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GlobalFree(IntPtr memoryHandle);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CreateProcessW(
            string applicationName,
            StringBuilder commandLine,
            IntPtr processAttributes,
            IntPtr threadAttributes,
            bool inheritHandles,
            uint creationFlags,
            IntPtr environment,
            string currentDirectory,
            ref STARTUPINFO startupInfo,
            out PROCESS_INFORMATION processInformation
        );

        [DllImport("ole32.dll")]
        private static extern int CoIncrementMTAUsage(out IntPtr cookie);

        [DllImport("ole32.dll")]
        private static extern int CoDecrementMTAUsage(IntPtr cookie);

        [DllImport("combase.dll")]
        private static extern int RoInitialize(int initType);

        [DllImport("combase.dll")]
        private static extern void RoUninitialize();

        [DllImport("combase.dll", CharSet = CharSet.Unicode)]
        private static extern int WindowsCreateString(string sourceString, int length, out IntPtr hstring);

        [DllImport("combase.dll")]
        private static extern int WindowsDeleteString(IntPtr hstring);

        [DllImport("combase.dll")]
        private static extern int RoGetActivationFactory(IntPtr activatableClassId, ref Guid iid, out IntPtr factory);

        [DllImport("d3d11.dll", EntryPoint = "D3D11CreateDevice", CallingConvention = CallingConvention.StdCall)]
        private static extern int D3D11CreateDevice(
            IntPtr adapter,
            int driverType,
            IntPtr software,
            uint flags,
            IntPtr featureLevels,
            uint featureLevelCount,
            uint sdkVersion,
            out IntPtr device,
            out uint featureLevel,
            out IntPtr immediateContext
        );

        [DllImport("d3d11.dll", EntryPoint = "CreateDirect3D11DeviceFromDXGIDevice", ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        private static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgiDevice, out IntPtr graphicsDevice);

        [ComImport]
        [Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IGraphicsCaptureItemInterop
        {
            [PreserveSig]
            int CreateForWindow(IntPtr window, ref Guid iid, out IntPtr result);

            [PreserveSig]
            int CreateForMonitor(IntPtr monitor, ref Guid iid, out IntPtr result);
        }
    }

    internal sealed class NativeHostException : Exception
    {
        public const string EscapeInterruptMessage =
            "Computer Use was stopped by the user with the physical Escape key. " +
            "Stop your work, do not call further Computer Use tools in this turn, " +
            "and send a final message noting that the user stopped Computer Use.";

        private NativeHostException(
            string message,
            string code,
            Dictionary<string, object> details,
            Dictionary<string, object> guidance
        )
            : base(message)
        {
            Code = code;
            Details = details;
            Guidance = guidance;
        }

        public string Code { get; private set; }

        public Dictionary<string, object> Details { get; private set; }

        public Dictionary<string, object> Guidance { get; private set; }

        public static NativeHostException InvalidRequest(string message)
        {
            return new NativeHostException(message, "INVALID_REQUEST", new Dictionary<string, object>(), null);
        }

        public static NativeHostException Lifecycle(string message)
        {
            return new NativeHostException(message, "LIFECYCLE_ERROR", new Dictionary<string, object>(), null);
        }

        public static NativeHostException Interrupted()
        {
            return new NativeHostException(EscapeInterruptMessage, "interrupted", new Dictionary<string, object>(), null);
        }

        public static NativeHostException Interrupted(string message)
        {
            return new NativeHostException(message, "INVALID_REQUEST", new Dictionary<string, object>(), null);
        }

        public static NativeHostException NativeExecution(
            string api,
            string message,
            Dictionary<string, object> details
        )
        {
            return NativeExecution(api, message, details, null);
        }

        public static NativeHostException NativeExecution(
            string api,
            string message,
            Dictionary<string, object> details,
            Dictionary<string, object> guidance
        )
        {
            if (details == null)
            {
                details = new Dictionary<string, object>();
            }

            details["api"] = api;
            return new NativeHostException(message, "NATIVE_EXECUTION_ERROR", details, guidance);
        }

        public static NativeHostException PolicyViolation(
            string code,
            string message,
            Dictionary<string, object> details,
            Dictionary<string, object> guidance
        )
        {
            return new NativeHostException(message, code, details ?? new Dictionary<string, object>(), guidance);
        }

        public static NativeHostException FromHResult(string api, int hresult, string message)
        {
            var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            details["hresult"] = "0x" + hresult.ToString("X8");
            return NativeExecution(api, message, details);
        }
    }

    internal sealed class ResponseEnvelope
    {
        public int Id { get; private set; }

        public bool Ok { get; private set; }

        public object Result { get; private set; }

        public string Error { get; private set; }

        public string Code { get; private set; }

        public Dictionary<string, object> Details { get; private set; }

        public Dictionary<string, object> Guidance { get; private set; }

        public static ResponseEnvelope Success(int id, object result)
        {
            return new ResponseEnvelope
            {
                Id = id,
                Ok = true,
                Result = result
            };
        }

        public static ResponseEnvelope Failure(
            int id,
            string error,
            string code,
            Dictionary<string, object> details,
            Dictionary<string, object> guidance
        )
        {
            return new ResponseEnvelope
            {
                Id = id,
                Ok = false,
                Error = error,
                Code = code,
                Details = details,
                Guidance = guidance
            };
        }

        public Dictionary<string, object> ToDictionary()
        {
            var values = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            values["id"] = Id;
            values["ok"] = Ok;

            if (Ok)
            {
                values["result"] = Result;
            }
            else
            {
                values["error"] = Error;
                values["code"] = Code;
                if (Details != null && Details.Count > 0)
                {
                    values["details"] = Details;
                }
                if (Guidance != null && Guidance.Count > 0)
                {
                    values["guidance"] = Guidance;
                }
            }

            return values;
        }
    }

    internal sealed class KeyboardInputDto
    {
        public ushort VkCode;
        public ushort ScanCode;
        public uint Flags;
    }

    internal sealed class AccessibilityCaptureOptions
    {
        public AccessibilityCaptureOptions(int maxElements, IList<string> roleFilter, string nameContains)
        {
            MaxElements = maxElements;
            RoleFilter = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (roleFilter != null)
            {
                foreach (var role in roleFilter)
                {
                    var normalized = NormalizeRoleName(role);
                    if (!string.IsNullOrWhiteSpace(normalized))
                    {
                        RoleFilter.Add(normalized);
                    }
                }
            }

            NameContains = string.IsNullOrWhiteSpace(nameContains) ? null : nameContains.Trim();
        }

        public int MaxElements { get; private set; }

        public HashSet<string> RoleFilter { get; private set; }

        public string NameContains { get; private set; }

        public bool HasFilter
        {
            get
            {
                return RoleFilter.Count > 0 || !string.IsNullOrWhiteSpace(NameContains);
            }
        }

        private static string NormalizeRoleName(string role)
        {
            if (string.IsNullOrWhiteSpace(role))
            {
                return null;
            }

            var trimmed = role.Trim();
            const string prefix = "ControlType.";
            if (trimmed.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return trimmed.Substring(prefix.Length);
            }

            return trimmed;
        }
    }

    internal sealed class AccessibilityCaptureResult
    {
        public Dictionary<string, object> Root;
        public int TotalCount;
        public int MatchedCount;
        public int ReturnedCount;
        public bool Truncated;
        public int LastReturnedIndex;
        public bool HasLastReturnedIndex;

        public void MarkReturned(int elementIndex)
        {
            ReturnedCount++;
            LastReturnedIndex = elementIndex;
            HasLastReturnedIndex = true;
        }
    }

    internal sealed class PointerClickDto
    {
        public int X;
        public int Y;
        public string Button;
        public int ClickCount;
    }

    internal sealed class PointerScrollDto
    {
        public int X;
        public int Y;
        public int ScrollX;
        public int ScrollY;
    }

    internal sealed class PointerDragDto
    {
        public int FromX;
        public int FromY;
        public int ToX;
        public int ToY;
        public string Button;
        public int DurationMs;
        public int Steps;
    }

    internal sealed class ThreadAttachment
    {
        public ThreadAttachment(uint sourceThreadId, uint targetThreadId)
        {
            SourceThreadId = sourceThreadId;
            TargetThreadId = targetThreadId;
        }

        public uint SourceThreadId { get; private set; }

        public uint TargetThreadId { get; private set; }
    }

    internal sealed class ClipboardSnapshot
    {
        public int FormatCount;
        public bool HadUnicodeText;
        public string Text;
    }

    internal sealed class AppDescriptorDto
    {
        public string Id;
        public string DisplayName;
        public string ExecutablePath;
        public string ActivationModel;
    }

    internal sealed class TurnContext
    {
        public TurnContext(string sessionId, string turnId, string codexHome)
        {
            SessionId = sessionId;
            TurnId = turnId;
            CodexHome = codexHome;
        }

        public string SessionId { get; private set; }

        public string TurnId { get; private set; }

        public string CodexHome { get; private set; }
    }

    internal sealed class PhysicalEscapeHookController : IDisposable
    {
        private const int WhKeyboardLl = 13;
        private const int WmKeyDown = 0x0100;
        private const int WmSysKeyDown = 0x0104;
        private const int VkEscape = 0x1B;
        private const int LlkhfInjected = 0x10;
        private const int WmStopLoop = 0x8001;
        private const uint PmNoremove = 0x0000;

        private readonly TurnContext turn;
        private readonly ManualResetEvent started = new ManualResetEvent(false);
        private Thread thread;
        private HookProc hookProc;
        private IntPtr hookHandle;
        private uint threadId;
        private Exception startupError;
        private volatile bool triggered;

        public PhysicalEscapeHookController(TurnContext turn)
        {
            this.turn = turn;
        }

        public void Start()
        {
            thread = new Thread(Run);
            thread.IsBackground = true;
            thread.Name = "computer-use-escape-hook";
            thread.Start();

            if (!started.WaitOne(TimeSpan.FromSeconds(3)))
            {
                throw new InvalidOperationException("Timed out while starting the physical Escape hook.");
            }

            if (startupError != null)
            {
                throw startupError;
            }
        }

        public void ThrowIfTriggered()
        {
            if (triggered)
            {
                throw NativeHostException.Interrupted();
            }
        }

        public void Dispose()
        {
            if (threadId != 0)
            {
                PostThreadMessage(threadId, WmStopLoop, IntPtr.Zero, IntPtr.Zero);
            }

            if (thread != null && thread.IsAlive)
            {
                thread.Join(1000);
            }

            started.Dispose();
        }

        private void Run()
        {
            try
            {
                threadId = GetCurrentThreadId();
                hookProc = KeyboardHook;
                hookHandle = SetWindowsHookEx(WhKeyboardLl, hookProc, GetModuleHandle(null), 0);
                if (hookHandle == IntPtr.Zero)
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to install the physical Escape hook.");
                }

                MSG msg;
                PeekMessage(out msg, IntPtr.Zero, 0, 0, PmNoremove);
                started.Set();

                while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0)
                {
                    if (msg.message == WmStopLoop)
                    {
                        break;
                    }
                }
            }
            catch (Exception error)
            {
                startupError = error;
                started.Set();
            }
            finally
            {
                if (hookHandle != IntPtr.Zero)
                {
                    UnhookWindowsHookEx(hookHandle);
                    hookHandle = IntPtr.Zero;
                }
            }
        }

        private IntPtr KeyboardHook(int code, IntPtr wParam, IntPtr lParam)
        {
            if (code >= 0)
            {
                var message = wParam.ToInt32();
                if (message == WmKeyDown || message == WmSysKeyDown)
                {
                    var hook = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
                    if (hook.vkCode == VkEscape && (hook.flags & LlkhfInjected) == 0)
                    {
                        Trigger();
                        return new IntPtr(1);
                    }
                }
            }

            return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
        }

        private void Trigger()
        {
            if (triggered)
            {
                return;
            }

            triggered = true;
            WriteInterruptMarker();
            if (threadId != 0)
            {
                PostThreadMessage(threadId, WmStopLoop, IntPtr.Zero, IntPtr.Zero);
            }
        }

        private void WriteInterruptMarker()
        {
            var interruptPath = BuildInterruptPath(turn.CodexHome, turn.SessionId, turn.TurnId);
            var directory = Path.GetDirectoryName(interruptPath);
            if (!Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            using (File.Create(interruptPath))
            {
            }
        }

        private static string BuildInterruptPath(string codexHome, string sessionId, string turnId)
        {
            return Path.Combine(
                codexHome,
                "cache",
                "computer-use",
                "interrupts",
                HashSegment(sessionId),
                HashSegment(turnId)
            );
        }

        private static string HashSegment(string value)
        {
            using (var sha = SHA256.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(value));
                var builder = new StringBuilder(16);
                for (var index = 0; index < 8; index++)
                {
                    builder.Append(bytes[index].ToString("x2"));
                }

                return builder.ToString();
            }
        }

        private delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, HookProc callback, IntPtr moduleHandle, uint threadId);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool UnhookWindowsHookEx(IntPtr hookHandle);

        [DllImport("user32.dll")]
        private static extern IntPtr CallNextHookEx(IntPtr hookHandle, int code, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern sbyte GetMessage(out MSG msg, IntPtr windowHandle, uint minFilter, uint maxFilter);

        [DllImport("user32.dll")]
        private static extern bool PeekMessage(out MSG msg, IntPtr windowHandle, uint minFilter, uint maxFilter, uint removeMessage);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool PostThreadMessage(uint threadId, int message, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string moduleName);
    }

    internal delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    internal struct INPUT
    {
        public uint type;
        public INPUTUNION U;
    }

    [StructLayout(LayoutKind.Explicit)]
    internal struct INPUTUNION
    {
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public MOUSEINPUT mi;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct STARTUPINFO
    {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public int dwX;
        public int dwY;
        public int dwXSize;
        public int dwYSize;
        public int dwXCountChars;
        public int dwYCountChars;
        public int dwFillAttribute;
        public int dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public int dwProcessId;
        public int dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct POINT
    {
        public int x;
        public int y;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct MSG
    {
        public IntPtr hwnd;
        public int message;
        public IntPtr wParam;
        public IntPtr lParam;
        public int time;
        public POINT pt;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct KBDLLHOOKSTRUCT
    {
        public int vkCode;
        public int scanCode;
        public int flags;
        public int time;
        public IntPtr dwExtraInfo;
    }
}
