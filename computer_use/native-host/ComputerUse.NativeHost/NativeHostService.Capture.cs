namespace ComputerUse.NativeHost
{
    internal sealed partial class NativeHostService
    {
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
                var screenshot = CaptureWindowJpeg(hwnd, jpegQuality, requestedApp);
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

            if (includeText && IsHungAppWindow(hwnd))
            {
                capture["textSource"] = "app_hung";
                capture["elementsReturned"] = 0;
                capture["elementsTotal"] = 0;
                capture["elementsMatched"] = 0;
                capture["truncated"] = false;
                capture["partial"] = true;
                degradedReasons.Add("app_hung");
            }
            else if (includeText && ShouldBlockAccessibilityText(stateWindow))
            {
                capture["textSource"] = "uia_blocked_chromium_im";
                capture["elementsReturned"] = 0;
                capture["elementsTotal"] = 0;
                capture["elementsMatched"] = 0;
                capture["truncated"] = false;
                capture["partial"] = true;
                degradedReasons.Add("uia_blocked_chromium_im");
            }
            else if (includeText)
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

        private Dictionary<string, object> CaptureWindowJpeg(IntPtr hwnd, int jpegQuality, string requestedApp)
        {
            RECT rect = new RECT();
            Dictionary<string, object> result = null;

            WithDpiGuard(delegate
            {
                if (!TryGetInteractiveWindowBounds(hwnd, requestedApp, out rect))
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
                    using (statusOverlay == null ? null : statusOverlay.SuspendForScreenCapture())
                    {
                        result = CaptureWindowJpegWithGdi(rect, jpegQuality);
                    }
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
    }
}
