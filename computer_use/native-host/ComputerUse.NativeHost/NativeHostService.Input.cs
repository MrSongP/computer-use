namespace ComputerUse.NativeHost
{
    internal sealed partial class NativeHostService
    {
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
                var preInputHitTest = BuildPointerHitTest(click, targetWindow);
                if (PointerHitTestMissesTarget(preInputHitTest, targetWindow))
                {
                    throw CreatePointerTargetMismatchException(click, targetWindow, preInputHitTest);
                }

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
            result["hitTest"] = BuildPointerHitTest(click, targetWindow);

            return result;
        }

        private Dictionary<string, object> BuildPointerHitTest(
            PointerClickDto click,
            IDictionary<string, object> targetWindow
        )
        {
            var targetWindowId = ReadOptionalWindowId(targetWindow);
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
            return hitTest;
        }

        private static bool PointerHitTestMissesTarget(
            IDictionary<string, object> hitTest,
            IDictionary<string, object> targetWindow
        )
        {
            if (!ReadOptionalWindowId(targetWindow).HasValue)
            {
                return false;
            }

            object matchesTarget;
            return hitTest.TryGetValue("matchesTarget", out matchesTarget) &&
                matchesTarget is bool &&
                !(bool)matchesTarget;
        }

        private NativeHostException CreatePointerTargetMismatchException(
            PointerClickDto click,
            IDictionary<string, object> targetWindow,
            Dictionary<string, object> hitTest
        )
        {
            var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            details["x"] = click.X;
            details["y"] = click.Y;
            var targetWindowId = ReadOptionalWindowId(targetWindow);
            if (targetWindowId.HasValue)
            {
                details["targetWindowId"] = targetWindowId.Value;
            }
            details["hitTest"] = hitTest;

            return NativeHostException.NativeExecution(
                "WindowFromPoint",
                "Pointer click was refused because the point does not hit the target window.",
                details,
                CreatePointerTargetMismatchGuidance()
            );
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
    }
}
