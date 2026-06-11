namespace ComputerUse.NativeHost
{
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
}
