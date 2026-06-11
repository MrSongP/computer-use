namespace ComputerUse.NativeHost
{
    internal sealed partial class NativeHostService
    {
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
    }
}
