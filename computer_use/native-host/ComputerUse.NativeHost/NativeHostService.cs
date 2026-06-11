namespace ComputerUse.NativeHost
{
    internal sealed partial class NativeHostService : IDisposable
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
        private const string CursorStatusOverlayWindowTitle = "Computer Use Status Overlay";
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
        private CursorStatusOverlay statusOverlay;
        private bool statusOverlayUnavailable;

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
                case "clearStatus":
                    ClearStatus();
                    return null;
                case "updateStatus":
                    UpdateStatus(payload);
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
            payload["supportsCursorStatusOverlay"] = true;
            return payload;
        }

        private void BeginTurn(IDictionary<string, object> payload)
        {
            if (turnInitialized)
            {
                currentTurn = ParseTurnContext(payload);
                EnsureEscapeHook();
                EnsureStatusOverlay();
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
            EnsureStatusOverlay();
        }

        private void EndTurn()
        {
            if (statusOverlay != null)
            {
                statusOverlay.Dispose();
                statusOverlay = null;
            }

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

        private void ClearStatus()
        {
            if (statusOverlay != null)
            {
                statusOverlay.UpdateStatus("computer_use", "\u6b63\u5728\u64cd\u4f5c\u5e94\u7528");
            }
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

        private void EnsureStatusOverlay()
        {
            if (statusOverlayUnavailable)
            {
                return;
            }

            if (statusOverlay == null)
            {
                try
                {
                    statusOverlay = new CursorStatusOverlay();
                }
                catch
                {
                    statusOverlay = null;
                    statusOverlayUnavailable = true;
                    return;
                }
            }

            statusOverlay.UpdateStatus("computer_use", "正在操作应用");
        }

        private void UpdateStatus(IDictionary<string, object> payload)
        {
            EnsureTurnInitialized();
            EnsureStatusOverlay();
            var title = ReadOptionalString(payload, "title") ?? "computer_use";
            var detail = ReadOptionalString(payload, "detail") ?? "\u6b63\u5728\u64cd\u4f5c\u5e94\u7528";
            if (statusOverlay != null)
            {
                statusOverlay.UpdateStatus(title, detail);
            }
        }
    }
}
