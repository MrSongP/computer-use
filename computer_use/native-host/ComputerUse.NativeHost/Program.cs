using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;
using Windows.Foundation;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace ComputerUse.NativeHost
{
    internal static class Program
    {
        private static int Main()
        {
            Console.InputEncoding = Encoding.UTF8;
            Console.OutputEncoding = Encoding.UTF8;

            var serializer = new JavaScriptSerializer
            {
                MaxJsonLength = int.MaxValue
            };

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
                        request = serializer.Deserialize<Dictionary<string, object>>(line);
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
                        WriteResponse(serializer, ResponseEnvelope.Failure(requestId, error.Message, error.Code, error.Details));
                    }
                    catch (Exception error)
                    {
                        WriteResponse(
                            serializer,
                            ResponseEnvelope.Failure(
                                requestId,
                                error.Message,
                                "INTERNAL_ERROR",
                                CreateDetails("type", error.GetType().FullName)
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

        private static void WriteResponse(JavaScriptSerializer serializer, ResponseEnvelope response)
        {
            Console.WriteLine(serializer.Serialize(response.ToDictionary()));
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
        private const int D3dDriverTypeHardware = 1;
        private const int D3dDriverTypeWarp = 5;
        private const uint D3d11CreateDeviceBgraSupport = 0x20;
        private const uint D3d11SdkVersion = 7;
        private static readonly IntPtr DpiAwarenessContextPerMonitorAwareV2 = new IntPtr(-4);
        private static readonly IntPtr DpiAwarenessContextPerMonitorAware = new IntPtr(-3);
        private static readonly Guid GraphicsCaptureItemGuid = new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760");
        private static readonly Guid DxgiDeviceGuid = new Guid("54EC77FA-1377-44E6-8C32-88FD5F44C84C");
        private static readonly string[] HiddenClassNames =
        {
            "Progman",
            "Button",
            "Shell_TrayWnd",
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
                    ActivateWindow(GetWindowHandle(payload));
                    return null;
                case "sendKeyboardInputs":
                    SendKeyboardInputs(GetKeyboardInputs(payload));
                    return null;
                case "sendPointerClick":
                    SendPointerClick(GetPointerClick(payload));
                    return null;
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
                    LaunchApp(ReadRequiredString(payload, "app"));
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

        private void ActivateWindow(IntPtr hwnd)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

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
                            return;
                        }

                        BringWindowToTop(hwnd);
                        SetForegroundWindow(hwnd);
                        SetFocus(hwnd);
                        Thread.Sleep(50);

                        if (IsForegroundWindow(hwnd))
                        {
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
                    throw NativeHostException.NativeExecution(
                        "SetForegroundWindow",
                        "Failed to activate the target window after 20 foreground retries.",
                        details
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
                        "SendInput only sent " + sent + " of " + nativeInputs.Length + " keyboard input records."
                    );
                }
            });
        }

        private void SendPointerClick(PointerClickDto click)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            WithDpiGuard(delegate
            {
                if (!SetCursorPos(click.X, click.Y))
                {
                    ThrowLastWin32Error("SetCursorPos", "Failed to move the system cursor to the requested coordinates.");
                }

                Thread.Sleep(10);
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
                            "SendInput only sent " + sent + " of " + nativeInputs.Length + " pointer input records."
                        );
                    }

                    if (count + 1 < click.ClickCount)
                    {
                        Thread.Sleep(50);
                    }
                }
            });
        }

        private void SendPointerScroll(PointerScrollDto scroll)
        {
            EnsureTurnInitialized();
            ThrowIfInterrupted();

            WithDpiGuard(delegate
            {
                if (!SetCursorPos(scroll.X, scroll.Y))
                {
                    ThrowLastWin32Error("SetCursorPos", "Failed to move the system cursor to the requested scroll point.");
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
                        "SendInput only sent " + sent + " of " + nativeInputs.Length + " scroll input records."
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
                    ThrowLastWin32Error("SetCursorPos", "Failed to move the system cursor to the drag start point.");
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
                        ThrowLastWin32Error("SendInput", "Failed while sending a drag input record.");
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
                merged[app.Id] = BuildAppPayload(app, windowsByApp);
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
                merged[app.Id] = BuildAppPayload(app, windowsByApp);
            }

            var result = new List<Dictionary<string, object>>(merged.Values);
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

        private void LaunchApp(string app)
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

            if (LooksLikeExecutablePath(normalized))
            {
                LaunchProcess(normalized, null, Path.GetDirectoryName(normalized));
                return;
            }

            var explorerPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
            var shellTarget = "shell:AppsFolder\\" + normalized;
            LaunchProcess(explorerPath, "\"" + shellTarget + "\"", null);
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

            var stateWindow = BuildWindowStatePayload(hwnd, requestedApp);
            if (stateWindow == null)
            {
                var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                details["windowId"] = hwnd.ToInt64();
                throw NativeHostException.NativeExecution(
                    "getWindowState",
                    "Could not resolve window state for the requested handle.",
                    details
                );
            }

            var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            result["window"] = stateWindow;

            var capture = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            capture["screenshotRequested"] = includeScreenshot;
            capture["textRequested"] = includeText;

            if (includeScreenshot)
            {
                var screenshot = CaptureWindowJpeg(hwnd, jpegQuality);
                result["screenshot"] = screenshot;
                capture["screenshotSource"] = screenshot["source"];
            }

            if (includeText)
            {
                var text = BuildAccessibilityTree(hwnd, maxElements);
                result["text"] = text;
                capture["textSource"] = "uia";
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
                        CreateDetails("elementIndex", ReadRequiredInt(payload, "element_index"))
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
                    CreateDetails("elementIndex", ReadRequiredInt(payload, "element_index"))
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
            if (processId == 0)
            {
                return null;
            }

            var title = GetWindowTitle(hwnd);
            var processPath = GetProcessPath(processId);
            var appId = string.IsNullOrWhiteSpace(processPath) ? requestedApp : processPath;
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
            var appId = string.IsNullOrWhiteSpace(processPath) ? requestedApp : processPath;
            if (string.IsNullOrWhiteSpace(appId))
            {
                appId = "unknown";
            }

            var payload = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            payload["id"] = hwnd.ToInt64();
            payload["app"] = appId;
            payload["title"] = GetWindowTitle(hwnd) ?? string.Empty;
            payload["rect"] = RectToPayload(rect);
            payload["visible"] = IsWindowVisible(hwnd) && !IsWindowCloaked(hwnd);
            payload["minimized"] = IsIconic(hwnd);
            payload["focused"] = IsForegroundWindow(hwnd);
            return payload;
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
                        CreateDetails("windowId", hwnd.ToInt64())
                    );
                }

                result = TryCaptureWindowWithWindowsGraphicsCapture(hwnd, jpegQuality);
                if (result == null)
                {
                    result = CaptureWindowJpegWithGdi(rect, jpegQuality);
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
            catch
            {
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
                    Marshal.ReleaseComObject(device);
                }
                if (item != null)
                {
                    Marshal.ReleaseComObject(item);
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
            var factory = WindowsRuntimeMarshal.GetActivationFactory(typeof(GraphicsCaptureItem));
            var interop = (IGraphicsCaptureItemInterop)factory;
            var iid = GraphicsCaptureItemGuid;
            var itemPointer = interop.CreateForWindow(hwnd, ref iid);
            try
            {
                return Marshal.GetObjectForIUnknown(itemPointer) as GraphicsCaptureItem;
            }
            finally
            {
                if (itemPointer != IntPtr.Zero)
                {
                    Marshal.Release(itemPointer);
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

                var device = Marshal.GetObjectForIUnknown(inspectablePointer) as IDirect3DDevice;
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

        private Dictionary<string, object> BuildAccessibilityTree(IntPtr hwnd, int maxElements)
        {
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
            return SerializeElement(root, ref nextIndex, maxElements);
        }

        private Dictionary<string, object> SerializeElement(AutomationElement element, ref int nextIndex, int maxElements)
        {
            ThrowIfInterrupted();

            var payload = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            payload["index"] = nextIndex++;
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

            var children = new List<Dictionary<string, object>>();
            if (nextIndex < maxElements)
            {
                var walker = TreeWalker.ControlViewWalker;
                var child = walker.GetFirstChild(element);
                while (child != null && nextIndex < maxElements)
                {
                    children.Add(SerializeElement(child, ref nextIndex, maxElements));
                    child = walker.GetNextSibling(child);
                }
            }

            payload["children"] = children;
            return payload;
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
                    CreateDetails("elementIndex", elementIndex)
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
                    CreateDetails("elementIndex", elementIndex)
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
                    CreateDetails("elementIndex", elementIndex)
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
            if (!element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern))
            {
                return null;
            }

            try
            {
                return ((ValuePattern)pattern).Current.Value;
            }
            catch
            {
                return null;
            }
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
            IDictionary<string, List<Dictionary<string, object>>> windowsByApp
        )
        {
            List<Dictionary<string, object>> windows;
            windowsByApp.TryGetValue(app.Id, out windows);

            var payload = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            payload["id"] = app.Id;
            payload["windows"] = windows ?? new List<Dictionary<string, object>>();
            payload["isRunning"] = windows != null && windows.Count > 0;
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
                ThrowLastWin32Error("CreateProcessW", "Failed to launch the requested application.");
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
            var error = Marshal.GetLastWin32Error();
            var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            details["win32Error"] = error;
            details["win32Message"] = new Win32Exception(error).Message;
            throw NativeHostException.NativeExecution(api, message, details);
        }

        private static Dictionary<string, object> CreateDetails(string key, object value)
        {
            var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            details[key] = value;
            return details;
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

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint cInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetCursorPos(int x, int y);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

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
            IntPtr CreateForWindow(IntPtr window, ref Guid iid);

            IntPtr CreateForMonitor(IntPtr monitor, ref Guid iid);
        }
    }

    internal sealed class NativeHostException : Exception
    {
        public const string EscapeInterruptMessage =
            "Computer Use was stopped by the user with the physical Escape key. " +
            "Stop your work, do not call further Computer Use tools in this turn, " +
            "and send a final message noting that the user stopped Computer Use.";

        private NativeHostException(string message, string code, Dictionary<string, object> details)
            : base(message)
        {
            Code = code;
            Details = details;
        }

        public string Code { get; private set; }

        public Dictionary<string, object> Details { get; private set; }

        public static NativeHostException InvalidRequest(string message)
        {
            return new NativeHostException(message, "INVALID_REQUEST", new Dictionary<string, object>());
        }

        public static NativeHostException Lifecycle(string message)
        {
            return new NativeHostException(message, "LIFECYCLE_ERROR", new Dictionary<string, object>());
        }

        public static NativeHostException Interrupted()
        {
            return new NativeHostException(EscapeInterruptMessage, "interrupted", new Dictionary<string, object>());
        }

        public static NativeHostException Interrupted(string message)
        {
            return new NativeHostException(message, "INVALID_REQUEST", new Dictionary<string, object>());
        }

        public static NativeHostException NativeExecution(
            string api,
            string message,
            Dictionary<string, object> details
        )
        {
            if (details == null)
            {
                details = new Dictionary<string, object>();
            }

            details["api"] = api;
            return new NativeHostException(message, "NATIVE_EXECUTION_ERROR", details);
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
            Dictionary<string, object> details
        )
        {
            return new ResponseEnvelope
            {
                Id = id,
                Ok = false,
                Error = error,
                Code = code,
                Details = details
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
