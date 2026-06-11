namespace ComputerUse.NativeHost
{
    internal sealed partial class NativeHostService
    {
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

        private static Dictionary<string, object> CreatePointerTargetMismatchGuidance()
        {
            return CreateGuidance(
                true,
                "Pointer input was not sent because the requested point belongs to another window.",
                "Refresh get_window_state and use the returned state.window rect before retrying. If the window is on a secondary monitor, verify rectCoordinateSpace and rectOnVirtualScreen before using window-relative coordinates.",
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
    }
}
