namespace ComputerUse.NativeHost
{
    internal sealed partial class NativeHostService
    {
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
            var runningProcesses = EnumerateRunningProcesses();
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
            var claimedWindowAppIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var claimedExecutablePaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var app in EnumerateShellApps())
            {
                ThrowIfInterrupted();
                EnrichAppIdentity(app, windowsByApp, runningProcesses);
                merged[app.Id] = BuildAppPayload(app, windowsByApp, runningProcesses);
                ClaimExecutablePaths(claimedExecutablePaths, app);
                foreach (var claimedWindowAppId in ResolveAppWindowAppIds(app, windowsByApp))
                {
                    claimedWindowAppIds.Add(claimedWindowAppId);
                    if (LooksLikeExecutablePath(claimedWindowAppId))
                    {
                        claimedExecutablePaths.Add(claimedWindowAppId);
                    }
                }
            }

            foreach (var entry in windowsByApp)
            {
                if (merged.ContainsKey(entry.Key) || claimedWindowAppIds.Contains(entry.Key))
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
                EnrichAppIdentity(app, windowsByApp, runningProcesses);
                merged[app.Id] = BuildAppPayload(app, windowsByApp, runningProcesses);
                ClaimExecutablePaths(claimedExecutablePaths, app);
            }

            foreach (var entry in runningProcesses)
            {
                ThrowIfInterrupted();
                if (claimedExecutablePaths.Contains(entry.Key) || merged.ContainsKey(entry.Key))
                {
                    continue;
                }

                var process = entry.Value;
                var app = new AppDescriptorDto
                {
                    Id = process.ExecutablePath,
                    DisplayName = Path.GetFileNameWithoutExtension(process.ExecutablePath),
                    ExecutablePath = process.ExecutablePath,
                    ProcessNames = new List<string> { process.ProcessName },
                    ProcessIds = new List<int>(process.ProcessIds),
                    ActivationModel = "executable_path"
                };
                AddAlias(app, process.ExecutablePath);
                merged[app.Id] = BuildAppPayload(app, windowsByApp, runningProcesses);
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
                ValidateExecutableLaunchTarget(normalized);
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

            var emptyWindowsByApp = new Dictionary<string, List<Dictionary<string, object>>>(StringComparer.OrdinalIgnoreCase);
            var runningProcesses = EnumerateRunningProcesses();
            var requestedDescriptor = new AppDescriptorDto
            {
                Id = app,
                DisplayName = app,
                ActivationModel = "app_user_model_id"
            };
            foreach (var candidate in EnumerateShellApps())
            {
                if (string.Equals(candidate.Id, app, StringComparison.OrdinalIgnoreCase))
                {
                    EnrichAppIdentity(candidate, emptyWindowsByApp, runningProcesses);
                    return candidate;
                }

                if (!string.IsNullOrWhiteSpace(candidate.ExecutablePath) &&
                    string.Equals(candidate.ExecutablePath, app, StringComparison.OrdinalIgnoreCase))
                {
                    EnrichAppIdentity(candidate, emptyWindowsByApp, runningProcesses);
                    return candidate;
                }

                if (!string.IsNullOrWhiteSpace(candidate.DisplayName) &&
                    string.Equals(candidate.DisplayName, app, StringComparison.OrdinalIgnoreCase))
                {
                    EnrichAppIdentity(candidate, emptyWindowsByApp, runningProcesses);
                    return candidate;
                }

                if (LooksLikeSameProduct(candidate, app) || LooksLikeSameProduct(requestedDescriptor, candidate.Id))
                {
                    EnrichAppIdentity(candidate, emptyWindowsByApp, runningProcesses);
                    return candidate;
                }
            }

            EnrichAppIdentity(requestedDescriptor, emptyWindowsByApp, runningProcesses);
            return requestedDescriptor;
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
            if (IsCursorStatusOverlayWindow(title))
            {
                return null;
            }

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
            payload["className"] = GetWindowClassName(hwnd);
            if (!string.IsNullOrWhiteSpace(title))
            {
                payload["title"] = title;
            }
            AddWindowRelationshipPayload(payload, hwnd);

            return payload;
        }

        private static bool IsCursorStatusOverlayWindow(string title)
        {
            return !IsCursorStatusOverlayDebugEnabled() &&
                string.Equals(title, CursorStatusOverlayWindowTitle, StringComparison.Ordinal);
        }

        private static bool IsCursorStatusOverlayDebugEnabled()
        {
            return IsTruthyEnvironmentVariable("COMPUTER_USE_STATUS_OVERLAY_DEBUG");
        }

        private static bool IsTruthyEnvironmentVariable(string name)
        {
            var value = Environment.GetEnvironmentVariable(name);
            return string.Equals(value, "1", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(value, "true", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(value, "yes", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(value, "on", StringComparison.OrdinalIgnoreCase);
        }

        private Dictionary<string, object> BuildWindowStatePayload(IntPtr hwnd, string requestedApp)
        {
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd))
            {
                return null;
            }

            if (IsCursorStatusOverlayWindow(GetWindowTitle(hwnd)))
            {
                return null;
            }

            RECT rect;
            if (!TryGetInteractiveWindowBounds(hwnd, requestedApp, out rect))
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
            payload["className"] = GetWindowClassName(hwnd);
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
            AddWindowRelationshipPayload(payload, hwnd);
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
            IDictionary<string, RunningProcessInfo> runningProcesses
        )
        {
            var windows = ResolveAppWindows(app, windowsByApp);
            var hasVisibleWindow = windows != null && windows.Count > 0;
            var hasRunningProcess = HasRunningExecutableProcess(app, runningProcesses);

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

            if (app.Aliases != null && app.Aliases.Count > 0)
            {
                payload["aliases"] = app.Aliases;
            }

            if (app.ProcessNames != null && app.ProcessNames.Count > 0)
            {
                payload["processNames"] = app.ProcessNames;
            }

            if (app.ProcessIds != null && app.ProcessIds.Count > 0)
            {
                payload["processIds"] = app.ProcessIds;
            }

            if (!string.IsNullOrWhiteSpace(app.TaskbarLabel))
            {
                payload["taskbarLabel"] = app.TaskbarLabel;
            }

            return payload;
        }

        private void EnrichAppIdentity(
            AppDescriptorDto app,
            IDictionary<string, List<Dictionary<string, object>>> windowsByApp,
            IDictionary<string, RunningProcessInfo> runningProcesses
        )
        {
            var executablePath = ResolveAppExecutablePath(app, windowsByApp, runningProcesses);
            if (!string.IsNullOrWhiteSpace(executablePath))
            {
                if (string.IsNullOrWhiteSpace(app.ExecutablePath))
                {
                    app.ExecutablePath = executablePath;
                }
                AddAlias(app, executablePath);
                AddProcessName(app, executablePath);
                RunningProcessInfo process;
                if (runningProcesses.TryGetValue(executablePath, out process))
                {
                    AddProcessInfo(app, process);
                }
            }

            if (!string.IsNullOrWhiteSpace(app.Id))
            {
                AddAlias(app, app.Id);
            }

            if (!string.IsNullOrWhiteSpace(app.DisplayName) && string.IsNullOrWhiteSpace(app.TaskbarLabel))
            {
                app.TaskbarLabel = app.DisplayName;
            }
        }

        private List<Dictionary<string, object>> ResolveAppWindows(
            AppDescriptorDto app,
            IDictionary<string, List<Dictionary<string, object>>> windowsByApp
        )
        {
            var windows = new List<Dictionary<string, object>>();
            foreach (var appId in ResolveAppWindowAppIds(app, windowsByApp))
            {
                List<Dictionary<string, object>> appWindows;
                if (windowsByApp.TryGetValue(appId, out appWindows))
                {
                    windows.AddRange(appWindows);
                }
            }

            return windows;
        }

        private List<string> ResolveAppWindowAppIds(
            AppDescriptorDto app,
            IDictionary<string, List<Dictionary<string, object>>> windowsByApp
        )
        {
            var result = new List<string>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var key in BuildAppIdentityKeys(app))
            {
                if (windowsByApp.ContainsKey(key) && seen.Add(key))
                {
                    result.Add(key);
                }
            }

            foreach (var entry in windowsByApp)
            {
                if (seen.Contains(entry.Key))
                {
                    continue;
                }
                if (LooksLikeSameProduct(app, entry.Key) && seen.Add(entry.Key))
                {
                    result.Add(entry.Key);
                }
            }

            return result;
        }

        private string ResolveAppExecutablePath(
            AppDescriptorDto app,
            IDictionary<string, List<Dictionary<string, object>>> windowsByApp,
            IDictionary<string, RunningProcessInfo> runningProcesses
        )
        {
            foreach (var key in BuildAppIdentityKeys(app))
            {
                if (LooksLikeExecutablePath(key) && runningProcesses.ContainsKey(key))
                {
                    return key;
                }
            }

            foreach (var appId in ResolveAppWindowAppIds(app, windowsByApp))
            {
                if (LooksLikeExecutablePath(appId))
                {
                    return appId;
                }
            }

            foreach (var runningExecutablePath in runningProcesses.Keys)
            {
                if (LooksLikeSameProduct(app, runningExecutablePath))
                {
                    return runningExecutablePath;
                }
            }

            return null;
        }

        private List<string> BuildAppIdentityKeys(AppDescriptorDto app)
        {
            var keys = new List<string>();
            AddIdentityKey(keys, app.Id);
            AddIdentityKey(keys, app.ExecutablePath);
            if (app.Aliases != null)
            {
                foreach (var alias in app.Aliases)
                {
                    AddIdentityKey(keys, alias);
                }
            }
            return keys;
        }

        private static void AddIdentityKey(List<string> keys, string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return;
            }
            var trimmed = value.Trim();
            if (!keys.Contains(trimmed))
            {
                keys.Add(trimmed);
            }
            foreach (var key in BuildComparableNames(value))
            {
                if (!keys.Contains(key))
                {
                    keys.Add(key);
                }
            }
        }

        private static bool LooksLikeSameProduct(AppDescriptorDto app, string candidate)
        {
            var candidateNames = BuildComparableNames(candidate);
            foreach (var name in BuildComparableNames(app.DisplayName))
            {
                if (candidateNames.Contains(name))
                {
                    return true;
                }
            }
            foreach (var name in BuildComparableNames(app.Id))
            {
                if (candidateNames.Contains(name))
                {
                    return true;
                }
            }
            return false;
        }

        private static List<string> BuildComparableNames(string value)
        {
            var result = new List<string>();
            if (string.IsNullOrWhiteSpace(value))
            {
                return result;
            }

            var trimmed = value.Trim();
            AddComparableName(result, trimmed);
            try
            {
                var fileName = Path.GetFileName(trimmed);
                if (!string.IsNullOrWhiteSpace(fileName))
                {
                    AddComparableName(result, fileName);
                    AddComparableName(result, Path.GetFileNameWithoutExtension(fileName));
                }
            }
            catch
            {
            }

            return result;
        }

        private static void AddComparableName(List<string> result, string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return;
            }
            var normalized = value.Trim().ToLowerInvariant();
            if (normalized.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            {
                normalized = normalized.Substring(0, normalized.Length - 4);
            }
            if (normalized.Length > 0 && !result.Contains(normalized))
            {
                result.Add(normalized);
            }
        }

        private static void AddAlias(AppDescriptorDto app, string alias)
        {
            if (string.IsNullOrWhiteSpace(alias))
            {
                return;
            }
            if (app.Aliases == null)
            {
                app.Aliases = new List<string>();
            }
            if (!app.Aliases.Contains(alias))
            {
                app.Aliases.Add(alias);
            }
        }

        private static void AddProcessName(AppDescriptorDto app, string executablePath)
        {
            if (string.IsNullOrWhiteSpace(executablePath))
            {
                return;
            }
            var processName = Path.GetFileName(executablePath);
            if (string.IsNullOrWhiteSpace(processName))
            {
                return;
            }
            if (app.ProcessNames == null)
            {
                app.ProcessNames = new List<string>();
            }
            if (!app.ProcessNames.Contains(processName))
            {
                app.ProcessNames.Add(processName);
            }
        }

        private static void AddProcessInfo(AppDescriptorDto app, RunningProcessInfo process)
        {
            if (process == null)
            {
                return;
            }

            AddProcessName(app, process.ExecutablePath);
            if (app.ProcessIds == null)
            {
                app.ProcessIds = new List<int>();
            }
            foreach (var processId in process.ProcessIds)
            {
                if (processId > 0 && !app.ProcessIds.Contains(processId))
                {
                    app.ProcessIds.Add(processId);
                }
            }
        }

        private static void ClaimExecutablePaths(ISet<string> claimedExecutablePaths, AppDescriptorDto app)
        {
            if (LooksLikeExecutablePath(app.ExecutablePath))
            {
                claimedExecutablePaths.Add(app.ExecutablePath);
            }
            if (LooksLikeExecutablePath(app.Id))
            {
                claimedExecutablePaths.Add(app.Id);
            }
            if (app.Aliases == null)
            {
                return;
            }
            foreach (var alias in app.Aliases)
            {
                if (LooksLikeExecutablePath(alias))
                {
                    claimedExecutablePaths.Add(alias);
                }
            }
        }

        private bool HasRunningExecutableProcess(AppDescriptorDto app, IDictionary<string, RunningProcessInfo> runningProcesses)
        {
            if (!string.IsNullOrWhiteSpace(app.ExecutablePath) && runningProcesses.ContainsKey(app.ExecutablePath))
            {
                return true;
            }

            foreach (var alias in app.Aliases ?? new List<string>())
            {
                if (LooksLikeExecutablePath(alias) && runningProcesses.ContainsKey(alias))
                {
                    return true;
                }
            }

            return LooksLikeExecutablePath(app.Id) && runningProcesses.ContainsKey(app.Id);
        }

        private HashSet<string> EnumerateRunningExecutablePaths()
        {
            return new HashSet<string>(EnumerateRunningProcesses().Keys, StringComparer.OrdinalIgnoreCase);
        }

        private Dictionary<string, RunningProcessInfo> EnumerateRunningProcesses()
        {
            var running = new Dictionary<string, RunningProcessInfo>(StringComparer.OrdinalIgnoreCase);
            int? currentSessionId = null;
            try
            {
                using (var currentProcess = Process.GetCurrentProcess())
                {
                    currentSessionId = currentProcess.SessionId;
                }
            }
            catch
            {
            }

            foreach (var process in Process.GetProcesses())
            {
                try
                {
                    if (currentSessionId.HasValue && process.SessionId != currentSessionId.Value)
                    {
                        continue;
                    }

                    var processPath = GetProcessPath((uint)process.Id);
                    if (!string.IsNullOrWhiteSpace(processPath))
                    {
                        RunningProcessInfo info;
                        if (!running.TryGetValue(processPath, out info))
                        {
                            info = new RunningProcessInfo
                            {
                                ExecutablePath = processPath,
                                ProcessName = Path.GetFileName(processPath),
                                ProcessIds = new List<int>()
                            };
                            running[processPath] = info;
                        }

                        if (!info.ProcessIds.Contains(process.Id))
                        {
                            info.ProcessIds.Add(process.Id);
                        }
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
            return !string.IsNullOrWhiteSpace(executablePath) &&
                EnumerateRunningProcesses().ContainsKey(executablePath);
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

        private void ValidateExecutableLaunchTarget(string executablePath)
        {
            var workingDirectory = Path.GetDirectoryName(executablePath);
            var executableExists = File.Exists(executablePath);
            var workingDirectoryExists = !string.IsNullOrWhiteSpace(workingDirectory) &&
                Directory.Exists(workingDirectory);

            if (executableExists && workingDirectoryExists)
            {
                return;
            }

            var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            details["app"] = executablePath;
            details["executableExists"] = executableExists;
            details["workingDirectory"] = string.IsNullOrWhiteSpace(workingDirectory) ? string.Empty : workingDirectory;
            details["workingDirectoryExists"] = workingDirectoryExists;

            throw NativeHostException.NativeExecution(
                "launch_app",
                "The requested executable path or its working directory does not exist.",
                details,
                CreateLaunchGuidance()
            );
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

        private static bool TryGetInteractiveWindowBounds(IntPtr hwnd, string requestedApp, out RECT rect)
        {
            if (IsTaskbarRequested(requestedApp))
            {
                return TryGetWindowRectBounds(hwnd, out rect);
            }

            return TryGetWindowBounds(hwnd, out rect);
        }

        private static bool TryGetWindowRectBounds(IntPtr hwnd, out RECT rect)
        {
            rect = new RECT();
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
            var className = GetWindowClassName(hwnd);
            foreach (var candidate in HiddenClassNames)
            {
                if (string.Equals(candidate, className, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        private static string GetWindowClassName(IntPtr hwnd)
        {
            var builder = new StringBuilder(256);
            var copied = GetClassNameW(hwnd, builder, builder.Capacity);
            return copied <= 0 ? string.Empty : builder.ToString();
        }

        private static void AddWindowRelationshipPayload(Dictionary<string, object> payload, IntPtr hwnd)
        {
            var owner = GetWindow(hwnd, 4);
            if (owner != IntPtr.Zero)
            {
                payload["ownerWindowId"] = owner.ToInt64();
                payload["modalForWindowId"] = owner.ToInt64();
            }

            var parent = GetParent(hwnd);
            if (parent != IntPtr.Zero)
            {
                payload["parentWindowId"] = parent.ToInt64();
            }
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

        private static bool ShouldBlockAccessibilityText(IDictionary<string, object> window)
        {
            if (window == null)
            {
                return false;
            }

            return IsRiskyChromiumImExecutable(ReadOptionalString(window, "app")) &&
                !IsStandardCommonDialogWindow(window);
        }

        private static bool IsStandardCommonDialogWindow(IDictionary<string, object> window)
        {
            var className = ReadOptionalString(window, "className");
            if (!string.Equals(className, "#32770", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            var title = (ReadOptionalString(window, "title") ?? string.Empty).Trim();
            return title.IndexOf("Open", StringComparison.OrdinalIgnoreCase) >= 0 ||
                title.IndexOf("Save", StringComparison.OrdinalIgnoreCase) >= 0 ||
                title.IndexOf("Browse", StringComparison.OrdinalIgnoreCase) >= 0 ||
                title.IndexOf("Select", StringComparison.OrdinalIgnoreCase) >= 0 ||
                title.IndexOf("Print", StringComparison.OrdinalIgnoreCase) >= 0 ||
                title.IndexOf("打开", StringComparison.OrdinalIgnoreCase) >= 0 ||
                title.IndexOf("保存", StringComparison.OrdinalIgnoreCase) >= 0 ||
                title.IndexOf("另存为", StringComparison.OrdinalIgnoreCase) >= 0 ||
                title.IndexOf("选择", StringComparison.OrdinalIgnoreCase) >= 0 ||
                title.IndexOf("浏览", StringComparison.OrdinalIgnoreCase) >= 0 ||
                title.IndexOf("打印", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static bool IsRiskyChromiumImExecutable(string app)
        {
            if (string.IsNullOrWhiteSpace(app))
            {
                return false;
            }

            var fileName = Path.GetFileName(app.Trim());
            return string.Equals(fileName, "QQ.exe", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(fileName, "QQNT.exe", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(fileName, "Weixin.exe", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(fileName, "WeChat.exe", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(fileName, "WXWork.exe", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(fileName, "Feishu.exe", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(fileName, "Lark.exe", StringComparison.OrdinalIgnoreCase);
        }
    }
}
