namespace ComputerUse.NativeHost
{
    internal sealed partial class NativeHostService
    {
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
    }
}
