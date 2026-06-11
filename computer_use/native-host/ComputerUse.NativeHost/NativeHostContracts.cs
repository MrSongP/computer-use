namespace ComputerUse.NativeHost
{
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
        public List<string> Aliases;
        public List<string> ProcessNames;
        public List<int> ProcessIds;
        public string TaskbarLabel;
        public string ActivationModel;
    }

    internal sealed class RunningProcessInfo
    {
        public string ExecutablePath;
        public string ProcessName;
        public List<int> ProcessIds;
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
