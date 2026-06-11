namespace ComputerUse.NativeHost
{
    internal sealed class CursorStatusOverlay : IDisposable
    {
        private const string OverlayWindowTitle = "Computer Use Status Overlay";
        private const int WmClose = 0x0010;
        private readonly ManualResetEventSlim started = new ManualResetEventSlim(false);
        private Thread thread;
        private StatusForm form;
        private Exception startupError;
        private bool disposed;

        public CursorStatusOverlay()
        {
            CloseExistingOverlayWindow();
            thread = new Thread(Run);
            thread.IsBackground = true;
            thread.Name = "computer-use-cursor-status";
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();

            if (!started.Wait(TimeSpan.FromSeconds(3)))
            {
                throw new InvalidOperationException("Timed out while starting the cursor status overlay.");
            }

            if (startupError != null)
            {
                throw startupError;
            }
        }

        public void UpdateStatus(string title, string detail)
        {
            if (disposed || form == null || form.IsDisposed)
            {
                return;
            }

            form.BeginInvoke(new Action(delegate
            {
                if (!form.IsDisposed)
                {
                    form.UpdateStatus(title, detail);
                }
            }));
        }

        public void Hide()
        {
            var overlayForm = form;
            if (disposed || overlayForm == null || overlayForm.IsDisposed)
            {
                return;
            }

            try
            {
                var hide = new Action(delegate
                {
                    if (!overlayForm.IsDisposed)
                    {
                        overlayForm.Hide();
                    }
                });

                if (overlayForm.InvokeRequired)
                {
                    overlayForm.Invoke(hide);
                }
                else
                {
                    hide();
                }
            }
            catch
            {
            }
        }

        public IDisposable SuspendForScreenCapture()
        {
            var overlayForm = form;
            if (disposed || overlayForm == null || overlayForm.IsDisposed)
            {
                return CaptureSuppression.Empty;
            }

            try
            {
                if (overlayForm.InvokeRequired)
                {
                    return (IDisposable)overlayForm.Invoke(new Func<IDisposable>(overlayForm.SuspendForScreenCapture));
                }

                return overlayForm.SuspendForScreenCapture();
            }
            catch
            {
                return CaptureSuppression.Empty;
            }
        }

        public void Dispose()
        {
            if (disposed)
            {
                return;
            }

            disposed = true;

            var overlayForm = form;
            if (overlayForm != null && !overlayForm.IsDisposed)
            {
                try
                {
                    overlayForm.BeginInvoke(new Action(delegate
                    {
                        overlayForm.Close();
                    }));
                }
                catch
                {
                }
            }

            if (thread != null && thread.IsAlive)
            {
                thread.Join(1000);
            }

            started.Dispose();
        }

        private void Run()
        {
            var savedDpiContext = SetThreadDpiAwarenessContext(DpiAwarenessContextPerMonitorAwareV2);
            if (savedDpiContext == IntPtr.Zero)
            {
                savedDpiContext = SetThreadDpiAwarenessContext(DpiAwarenessContextPerMonitorAware);
            }

            try
            {
                System.Windows.Forms.Application.SetHighDpiMode(System.Windows.Forms.HighDpiMode.PerMonitorV2);
                System.Windows.Forms.Application.EnableVisualStyles();
                form = new StatusForm();
                form.HandleCreated += delegate { started.Set(); };
                form.Shown += delegate { started.Set(); };
                System.Windows.Forms.Application.Run(form);
            }
            catch (Exception error)
            {
                startupError = error;
                started.Set();
            }
            finally
            {
                if (savedDpiContext != IntPtr.Zero)
                {
                    SetThreadDpiAwarenessContext(savedDpiContext);
                }
            }
        }

        private static void CloseExistingOverlayWindow()
        {
            try
            {
                var hwnd = FindWindow(null, OverlayWindowTitle);
                if (hwnd != IntPtr.Zero)
                {
                    PostMessage(hwnd, WmClose, IntPtr.Zero, IntPtr.Zero);
                }
            }
            catch
            {
            }
        }

        [DllImport("user32.dll", SetLastError = false, CharSet = CharSet.Unicode)]
        private static extern IntPtr FindWindow(string className, string windowName);

        [DllImport("user32.dll", SetLastError = false)]
        private static extern bool PostMessage(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam);

        private static readonly IntPtr DpiAwarenessContextPerMonitorAwareV2 = new IntPtr(-4);
        private static readonly IntPtr DpiAwarenessContextPerMonitorAware = new IntPtr(-3);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);

        private sealed class CaptureSuppression : IDisposable
        {
            public static readonly IDisposable Empty = new CaptureSuppression(null);
            private Action restore;

            public CaptureSuppression(Action restore)
            {
                this.restore = restore;
            }

            public void Dispose()
            {
                var action = restore;
                restore = null;
                if (action != null)
                {
                    action();
                }
            }
        }

        private sealed class StatusForm : System.Windows.Forms.Form
        {
            private const int MarginToCursorDip = 18;
            private const int ScreenMarginDip = 8;
            private const int MinimumWidthDip = 132;
            private const int CapsuleHeightDip = 40;
            private const int HorizontalPaddingDip = 18;
            private const int DotSizeDip = 6;
            private const int DotHaloSizeDip = 9;
            private const int DotTextGapDip = 6;
            private const int TextGapDip = 4;
            private const int TextWidthSlackDip = 6;
            private const double FullOpacity = 1.0;
            private const uint WdaExcludeFromCapture = 0x00000011;
            private const int DwmaWindowCornerPreference = 33;
            private const int DwmWindowCornerPreferenceRound = 2;
            private const uint SwpNoSize = 0x0001;
            private const uint SwpNoMove = 0x0002;
            private const uint SwpNoActivate = 0x0010;
            private static readonly IntPtr HwndTopMost = new IntPtr(-1);
            private readonly System.Windows.Forms.Timer followTimer;
            private readonly Font titleFont = CreateUIFont(
                9.5f,
                FontStyle.Regular,
                new[] {
                    "Inter Semi Bold",
                    "Inter Semibold",
                    "Segoe UI Semibold",
                    "Segoe UI Variable Text",
                    "Segoe UI",
                    "Arial"
                });
            private readonly Font detailFont = CreateUIFont(
                9.5f,
                FontStyle.Regular,
                new[] {
                    "PingFang SC",
                    "Microsoft YaHei UI",
                    "Microsoft YaHei",
                    "Segoe UI Variable Text",
                    "Segoe UI",
                    "Arial"
                });
            private string title = "computer_use";
            private bool excludedFromCapture;
            private string detail = "\u6b63\u5728\u64cd\u4f5c\u5e94\u7528";

            public StatusForm()
            {
                AutoScaleMode = System.Windows.Forms.AutoScaleMode.None;
                BackColor = Color.Black;
                DoubleBuffered = true;
                FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
                Opacity = FullOpacity;
                ShowInTaskbar = false;
                Size = new System.Drawing.Size(ScalePx(MinimumWidthDip), ScalePx(CapsuleHeightDip));
                StartPosition = System.Windows.Forms.FormStartPosition.Manual;
                Text = OverlayWindowTitle;
                TopMost = true;

                followTimer = new System.Windows.Forms.Timer();
                followTimer.Interval = 33;
                followTimer.Tick += delegate { TickOverlay(); };
                followTimer.Start();

                RebuildRegion();
                RepositionNearCursor();
            }

            protected override void OnHandleCreated(EventArgs e)
            {
                base.OnHandleCreated(e);
                ApplyCaptureExclusion();
                ApplyNativeGlassHints();
                EnsureTopMostLayer();
                RefreshLayeredWindow();
            }

            protected override bool ShowWithoutActivation
            {
                get { return true; }
            }

            protected override System.Windows.Forms.CreateParams CreateParams
            {
                get
                {
                    const int WsExToolWindow = 0x00000080;
                    const int WsExTransparent = 0x00000020;
                    const int WsExNoActivate = 0x08000000;
                    const int WsExLayered = 0x00080000;
                    var createParams = base.CreateParams;
                    createParams.ExStyle |= WsExToolWindow | WsExTransparent | WsExNoActivate | WsExLayered;
                    return createParams;
                }
            }

            public void UpdateStatus(string nextTitle, string nextDetail)
            {
                title = NormalizeStatusTitle(nextTitle);
                Opacity = FullOpacity;
                detail = NormalizeDisplayText(nextDetail, "\u6b63\u5728\u64cd\u4f5c\u5e94\u7528");

                var detailWidth = MeasureTextWidth(detail, detailFont);
                var titleWidth = MeasureTextWidth(title, titleFont);
                var desiredWidth =
                    ScalePx(HorizontalPaddingDip) +
                    ScalePx(DotHaloSizeDip) +
                    ScalePx(DotTextGapDip) +
                    titleWidth +
                    ScalePx(TextGapDip) +
                    detailWidth +
                    ScalePx(TextWidthSlackDip) +
                    ScalePx(HorizontalPaddingDip);

                Width = Math.Max(ScalePx(MinimumWidthDip), Math.Min(GetMaximumOverlayWidth(), desiredWidth));
                Height = ScalePx(CapsuleHeightDip);
                RebuildRegion();
                RepositionNearCursor();
                RefreshLayeredWindow();

                if (!Visible)
                {
                    Show();
                }
                EnsureTopMostLayer();
            }

            public IDisposable SuspendForScreenCapture()
            {
                if (excludedFromCapture || !Visible || IsDisposed)
                {
                    return CaptureSuppression.Empty;
                }

                var wasVisible = Visible;
                var previousOpacity = Opacity;
                Hide();

                return new CaptureSuppression(delegate
                {
                    RestoreAfterScreenCapture(wasVisible, previousOpacity);
                });
            }

            private void RestoreAfterScreenCapture(bool wasVisible, double previousOpacity)
            {
                if (!wasVisible)
                {
                    return;
                }

                try
                {
                    var restore = new Action(delegate
                    {
                        if (IsDisposed)
                        {
                            return;
                        }

                        Opacity = previousOpacity;
                        RepositionNearCursor();
                        Show();
                        EnsureTopMostLayer();
                        RefreshLayeredWindow();
                    });

                    if (IsDisposed)
                    {
                        return;
                    }

                    if (InvokeRequired)
                    {
                        BeginInvoke(restore);
                    }
                    else
                    {
                        restore();
                    }
                }
                catch
                {
                }
            }

            protected override void OnPaint(System.Windows.Forms.PaintEventArgs e)
            {
                // The visible surface is supplied by UpdateLayeredWindow. Letting
                // WinForms paint too can leave a rectangular backing layer.
            }

            protected override void OnPaintBackground(System.Windows.Forms.PaintEventArgs e)
            {
            }

            protected override void OnResize(EventArgs e)
            {
                base.OnResize(e);
                RebuildRegion();
                RefreshLayeredWindow();
            }

            private void ApplyCaptureExclusion()
            {
                if (IsStatusOverlayDebugEnabled())
                {
                    excludedFromCapture = false;
                    return;
                }

                try
                {
                    excludedFromCapture = SetWindowDisplayAffinity(Handle, WdaExcludeFromCapture);
                }
                catch
                {
                    excludedFromCapture = false;
                }
            }

            private void ApplyNativeGlassHints()
            {
                if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000))
                {
                    return;
                }

                TrySetDwmAttribute(DwmaWindowCornerPreference, DwmWindowCornerPreferenceRound);
            }

            private void TrySetDwmAttribute(int attribute, int value)
            {
                try
                {
                    var nextValue = value;
                    DwmSetWindowAttribute(Handle, attribute, ref nextValue, Marshal.SizeOf(typeof(int)));
                }
                catch
                {
                }
            }

            private void RefreshLayeredWindow()
            {
                if (!IsHandleCreated || Width <= 0 || Height <= 0)
                {
                    return;
                }

                using (var bitmap = new Bitmap(Width, Height, PixelFormat.Format32bppPArgb))
                {
                    bitmap.SetResolution(CurrentDpi, CurrentDpi);
                    using (var graphics = Graphics.FromImage(bitmap))
                    {
                        graphics.Clear(Color.Transparent);
                        DrawOverlay(graphics);
                    }

                    SaveDebugRender(bitmap);
                    UpdateLayeredWindowFromBitmap(bitmap);
                }
            }

            private void SaveDebugRender(Bitmap bitmap)
            {
                if (!IsStatusOverlayDebugEnabled())
                {
                    return;
                }

                try
                {
                    var outputDir = Path.Combine(Environment.CurrentDirectory, ".tmp");
                    Directory.CreateDirectory(outputDir);
                    bitmap.Save(Path.Combine(outputDir, "cursor-status-overlay-render.png"), ImageFormat.Png);

                    using (var composite = new Bitmap(bitmap.Width, bitmap.Height, PixelFormat.Format32bppPArgb))
                    {
                        using (var graphics = Graphics.FromImage(composite))
                        {
                            DrawDebugCheckerboard(graphics, bitmap.Width, bitmap.Height);
                            graphics.DrawImageUnscaled(bitmap, 0, 0);
                        }

                        composite.Save(
                            Path.Combine(outputDir, "cursor-status-overlay-render-checker.png"),
                            ImageFormat.Png
                        );
                    }
                }
                catch
                {
                }
            }

            private void DrawOverlay(Graphics graphics)
            {
                graphics.SmoothingMode = SmoothingMode.AntiAlias;
                graphics.CompositingQuality = CompositingQuality.HighQuality;
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;

                var bounds = new Rectangle(1, 1, Width - 2, Height - 2);
                var palette = ResolvePalette();
                DrawPremiumShadow(graphics, bounds, palette);
                using (var path = CreateRoundRectPath(bounds, ScalePx(18)))
                {
                    DrawPremiumBody(graphics, bounds, path, palette);
                }

                DrawStatusContent(graphics, palette);
            }

            private void DrawStatusContent(Graphics graphics, OverlayPalette palette)
            {
                var horizontalPadding = ScalePx(HorizontalPaddingDip);
                var dotHaloSize = ScalePx(DotHaloSizeDip);
                var dotSize = ScalePx(DotSizeDip);
                var dotTextGap = ScalePx(DotTextGapDip);
                var textGap = ScalePx(TextGapDip);
                var dotX = horizontalPadding;
                var haloY = (Height - dotHaloSize) / 2;
                var dotY = (Height - dotSize) / 2;
                using (var dotBrush = new SolidBrush(palette.Dot))
                using (var dotGlow = new SolidBrush(palette.DotGlow))
                {
                    graphics.FillEllipse(dotGlow, dotX, haloY, dotHaloSize, dotHaloSize);
                    graphics.FillEllipse(dotBrush, dotX + ((dotHaloSize - dotSize) / 2.0f), dotY, dotSize, dotSize);
                }

                var textX = dotX + dotHaloSize + dotTextGap;
                var textHeight = (int)Math.Ceiling(Math.Max(
                    titleFont.GetHeight(graphics),
                    detailFont.GetHeight(graphics))) + ScalePx(2);
                var textY = Math.Max(0, (Height - textHeight) / 2);

                var titleWidth = MeasureTextWidth(title, titleFont);
                var titleRect = new RectangleF(textX, textY, titleWidth, textHeight);
                var detailX = titleRect.Right + textGap;
                var detailRect = new RectangleF(
                    detailX,
                    textY,
                    Math.Max(1, Width - detailX - horizontalPadding),
                    textHeight
                );

                using (var titleBrush = new SolidBrush(palette.TitleText))
                using (var detailBrush = new SolidBrush(palette.DetailText))
                using (var format = CreateTextFormat())
                {
                    graphics.DrawString(title, titleFont, titleBrush, titleRect, format);
                    graphics.DrawString(detail, detailFont, detailBrush, detailRect, format);
                }
            }

            private void UpdateLayeredWindowFromBitmap(Bitmap bitmap)
            {
                var screenDc = GetDC(IntPtr.Zero);
                var memoryDc = CreateCompatibleDC(screenDc);
                var bitmapHandle = IntPtr.Zero;
                var oldBitmap = IntPtr.Zero;

                try
                {
                    bitmapHandle = CreatePremultipliedAlphaBitmap(bitmap);
                    oldBitmap = SelectObject(memoryDc, bitmapHandle);

                    var size = new LayeredSize { cx = bitmap.Width, cy = bitmap.Height };
                    var source = new LayeredPoint { x = 0, y = 0 };
                    var top = new LayeredPoint { x = Left, y = Top };
                    var blend = new BlendFunction
                    {
                        BlendOp = 0,
                        BlendFlags = 0,
                        SourceConstantAlpha = 255,
                        AlphaFormat = 1
                    };

                    UpdateLayeredWindow(Handle, screenDc, ref top, ref size, memoryDc, ref source, 0, ref blend, 2);
                }
                finally
                {
                    if (oldBitmap != IntPtr.Zero)
                    {
                        SelectObject(memoryDc, oldBitmap);
                    }
                    if (bitmapHandle != IntPtr.Zero)
                    {
                        DeleteObject(bitmapHandle);
                    }
                    if (memoryDc != IntPtr.Zero)
                    {
                        DeleteDC(memoryDc);
                    }
                    if (screenDc != IntPtr.Zero)
                    {
                        ReleaseDC(IntPtr.Zero, screenDc);
                    }
                }
            }

            private static IntPtr CreatePremultipliedAlphaBitmap(Bitmap bitmap)
            {
                var bitmapInfo = new BitmapInfo
                {
                    Header = new BitmapInfoHeader
                    {
                        Size = Marshal.SizeOf(typeof(BitmapInfoHeader)),
                        Width = bitmap.Width,
                        Height = -bitmap.Height,
                        Planes = 1,
                        BitCount = 32,
                        Compression = 0,
                        SizeImage = bitmap.Width * bitmap.Height * 4,
                        XPelsPerMeter = 0,
                        YPelsPerMeter = 0,
                        ClrUsed = 0,
                        ClrImportant = 0
                    }
                };

                var bitmapHandle = CreateDIBSection(IntPtr.Zero, ref bitmapInfo, 0, out var bits, IntPtr.Zero, 0);
                if (bitmapHandle == IntPtr.Zero || bits == IntPtr.Zero)
                {
                    throw new InvalidOperationException("Failed to create layered-window DIB section.");
                }

                var bounds = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
                var data = bitmap.LockBits(bounds, ImageLockMode.ReadOnly, PixelFormat.Format32bppPArgb);
                try
                {
                    var targetStride = bitmap.Width * 4;
                    var row = new byte[targetStride];
                    for (var y = 0; y < bitmap.Height; y += 1)
                    {
                        Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), row, 0, targetStride);
                        Marshal.Copy(row, 0, IntPtr.Add(bits, y * targetStride), targetStride);
                    }
                }
                finally
                {
                    bitmap.UnlockBits(data);
                }

                return bitmapHandle;
            }

            private void DrawPremiumShadow(Graphics graphics, Rectangle bounds, OverlayPalette palette)
            {
                using (var broadPath = CreateRoundRectPath(
                    new Rectangle(
                        ScalePx(5),
                        ScalePx(8),
                        bounds.Width - ScalePx(10),
                        bounds.Height - ScalePx(11)),
                    ScalePx(18)))
                using (var broadBrush = new SolidBrush(palette.ShadowBroad))
                using (var closePath = CreateRoundRectPath(
                    new Rectangle(
                        ScalePx(3),
                        ScalePx(4),
                        bounds.Width - ScalePx(6),
                        bounds.Height - ScalePx(7)),
                    ScalePx(18)))
                using (var closeBrush = new SolidBrush(palette.ShadowClose))
                {
                    graphics.FillPath(broadBrush, broadPath);
                    graphics.FillPath(closeBrush, closePath);
                }
            }

            private void DrawPremiumBody(Graphics graphics, Rectangle bounds, GraphicsPath path, OverlayPalette palette)
            {
                using (var background = new LinearGradientBrush(
                    bounds,
                    palette.FillTop,
                    palette.FillBottom,
                    LinearGradientMode.Vertical))
                using (var border = new Pen(palette.OuterBorder, 1.0f))
                using (var innerBorder = new Pen(palette.InnerBorder, 1.0f))
                {
                    graphics.FillPath(background, path);
                    graphics.DrawPath(border, path);
                    using (var innerPath = CreateRoundRectPath(
                        new Rectangle(bounds.Left + 1, bounds.Top + 1, bounds.Width - 2, bounds.Height - 2),
                        ScalePx(17)))
                    {
                        graphics.DrawPath(innerBorder, innerPath);
                    }
                }
            }

            private static void DrawDebugCheckerboard(Graphics graphics, int width, int height)
            {
                var cell = 12;
                using (var light = new SolidBrush(Color.FromArgb(255, 236, 244, 255)))
                using (var cool = new SolidBrush(Color.FromArgb(255, 20, 184, 166)))
                using (var blue = new SolidBrush(Color.FromArgb(255, 99, 102, 241)))
                using (var warm = new SolidBrush(Color.FromArgb(255, 244, 114, 182)))
                {
                    graphics.FillRectangle(light, 0, 0, width, height);
                    for (var y = 0; y < height; y += cell)
                    {
                        for (var x = 0; x < width; x += cell)
                        {
                            if (((x / cell) + (y / cell)) % 2 == 0)
                            {
                                graphics.FillRectangle(cool, x, y, cell, cell);
                            }
                        }
                    }

                    graphics.FillRectangle(blue, width / 3, 0, Math.Max(1, width / 3), height);
                    graphics.FillRectangle(warm, (width * 2) / 3, 0, Math.Max(1, width / 3), height);
                }
            }

            protected override void Dispose(bool disposing)
            {
                if (disposing)
                {
                    followTimer.Stop();
                    followTimer.Dispose();
                    titleFont.Dispose();
                    detailFont.Dispose();
                }

                base.Dispose(disposing);
            }

            private void RepositionNearCursor()
            {
                var cursor = System.Windows.Forms.Cursor.Position;
                var screen = System.Windows.Forms.Screen.FromPoint(cursor);
                var area = screen.WorkingArea;
                var marginToCursor = ScalePx(MarginToCursorDip);
                var screenMargin = ScalePx(ScreenMarginDip);

                var x = cursor.X - (Width / 2);
                var y = cursor.Y - Height - marginToCursor;
                if (y < area.Top + screenMargin)
                {
                    y = cursor.Y + marginToCursor;
                }

                x = Math.Max(area.Left + screenMargin, Math.Min(x, area.Right - Width - screenMargin));
                y = Math.Max(area.Top + screenMargin, Math.Min(y, area.Bottom - Height - screenMargin));
                Location = new System.Drawing.Point(x, y);
                EnsureTopMostLayer();
            }

            private int GetMaximumOverlayWidth()
            {
                var cursor = System.Windows.Forms.Cursor.Position;
                var area = System.Windows.Forms.Screen.FromPoint(cursor).WorkingArea;
                var screenMargin = ScalePx(ScreenMarginDip);
                return Math.Max(ScalePx(MinimumWidthDip), area.Width - (screenMargin * 2));
            }

            private void TickOverlay()
            {
                RepositionNearCursor();
            }

            private void EnsureTopMostLayer()
            {
                if (!IsHandleCreated || IsDisposed)
                {
                    return;
                }

                TopMost = true;
                SetWindowPos(Handle, HwndTopMost, 0, 0, 0, 0, SwpNoMove | SwpNoSize | SwpNoActivate);
            }

            private void RebuildRegion()
            {
                var previous = Region;
                using (var path = CreateRoundRectPath(new Rectangle(0, 0, Width, Height), Height / 2))
                {
                    Region = new Region(path);
                }

                if (previous != null)
                {
                    previous.Dispose();
                }
            }

            private static OverlayPalette ResolvePalette()
            {
                return OverlayPalette.Light;
            }

            private static bool IsStatusOverlayDebugEnabled()
            {
                var value = Environment.GetEnvironmentVariable("COMPUTER_USE_STATUS_OVERLAY_DEBUG");
                return string.Equals(value, "1", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(value, "true", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(value, "yes", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(value, "on", StringComparison.OrdinalIgnoreCase);
            }

            private static GraphicsPath CreateRoundRectPath(Rectangle bounds, int radius)
            {
                var diameter = radius * 2;
                var path = new GraphicsPath();
                path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
                path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
                path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
                path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
                path.CloseFigure();
                return path;
            }

            private sealed class OverlayPalette
            {
                public static readonly OverlayPalette Light = new OverlayPalette(
                    Color.FromArgb(24, 16, 32, 51),
                    Color.FromArgb(18, 37, 99, 235),
                    Color.FromArgb(246, 255, 255, 255),
                    Color.FromArgb(238, 247, 250, 255),
                    Color.FromArgb(224, 212, 223, 238),
                    Color.FromArgb(150, 255, 255, 255),
                    Color.FromArgb(255, 21, 94, 239),
                    Color.FromArgb(255, 11, 18, 32),
                    Color.FromArgb(255, 47, 124, 246),
                    Color.FromArgb(31, 47, 124, 246)
                );

                public OverlayPalette(
                    Color shadowBroad,
                    Color shadowClose,
                    Color fillTop,
                    Color fillBottom,
                    Color outerBorder,
                    Color innerBorder,
                    Color titleText,
                    Color detailText,
                    Color dot,
                    Color dotGlow)
                {
                    ShadowBroad = shadowBroad;
                    ShadowClose = shadowClose;
                    FillTop = fillTop;
                    FillBottom = fillBottom;
                    OuterBorder = outerBorder;
                    InnerBorder = innerBorder;
                    TitleText = titleText;
                    DetailText = detailText;
                    Dot = dot;
                    DotGlow = dotGlow;
                }

                public Color ShadowBroad { get; private set; }
                public Color ShadowClose { get; private set; }
                public Color FillTop { get; private set; }
                public Color FillBottom { get; private set; }
                public Color OuterBorder { get; private set; }
                public Color InnerBorder { get; private set; }
                public Color TitleText { get; private set; }
                public Color DetailText { get; private set; }
                public Color Dot { get; private set; }
                public Color DotGlow { get; private set; }
            }

            private static string NormalizeDisplayText(string value, string fallback)
            {
                return string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
            }

            private static string NormalizeStatusTitle(string value)
            {
                var normalized = NormalizeDisplayText(value, "computer_use")
                    .Replace("-", "_")
                    .Replace(" ", "_")
                    .Trim()
                    .ToLowerInvariant();

                switch (normalized)
                {
                    case "click":
                    case "click_element":
                    case "clickelement":
                    case "send_pointer_click":
                    case "sendpointerclick":
                        return "Click";
                    case "get_window_state":
                    case "getwindowstate":
                    case "view_state":
                    case "viewstate":
                    case "look":
                    case "view":
                    case "watch":
                        return "View State";
                    case "activate_window":
                    case "activatewindow":
                    case "focus_window":
                    case "focuswindow":
                    case "focus":
                        return "Focus Window";
                    case "type_text":
                    case "typetext":
                    case "send_text":
                    case "sendtext":
                    case "type":
                        return "Type Text";
                    case "press_key":
                    case "presskey":
                    case "send_keyboard_inputs":
                    case "sendkeyboardinputs":
                    case "key":
                        return "Press Key";
                    case "scroll":
                    case "send_pointer_scroll":
                    case "sendpointerscroll":
                        return "Scroll";
                    case "drag":
                    case "send_pointer_drag":
                    case "sendpointerdrag":
                        return "Drag";
                    case "list_windows":
                    case "listwindows":
                    case "find":
                    case "find_windows":
                    case "findwindows":
                        return "Find Windows";
                    case "get_window":
                    case "getwindow":
                    case "window":
                    case "resolve_window":
                    case "resolvewindow":
                        return "Resolve Window";
                    case "list_apps":
                    case "listapps":
                    case "apps":
                    case "find_apps":
                    case "findapps":
                        return "Find Apps";
                    case "launch_app":
                    case "launchapp":
                    case "launch":
                        return "Launch App";
                    case "set_value":
                    case "setvalue":
                    case "set":
                        return "Set Value";
                    case "perform_secondary_action":
                    case "performsecondaryaction":
                    case "action":
                        return "Action";
                    case "screen":
                    case "get_virtual_screen_metrics":
                    case "getvirtualscreenmetrics":
                        return "Screen";
                    case "done":
                    case "complete":
                        return "Done";
                    case "computer_use":
                    case "computeruse":
                        return "Work";
                    default:
                        return ToCompactTitle(value);
                }
            }

            private static string ToCompactTitle(string value)
            {
                var normalized = NormalizeDisplayText(value, "Work")
                    .Replace("-", " ")
                    .Replace("_", " ");
                var builder = new StringBuilder();
                var previousWasSpace = true;
                var wordCount = 0;

                for (var i = 0; i < normalized.Length; i += 1)
                {
                    var character = normalized[i];
                    if (char.IsWhiteSpace(character))
                    {
                        if (!previousWasSpace && wordCount < 2)
                        {
                            builder.Append(' ');
                        }
                        previousWasSpace = true;
                        continue;
                    }

                    if (previousWasSpace)
                    {
                        wordCount += 1;
                        if (wordCount > 2)
                        {
                            break;
                        }
                        builder.Append(char.ToUpperInvariant(character));
                    }
                    else
                    {
                        builder.Append(char.ToLowerInvariant(character));
                    }

                    previousWasSpace = false;
                }

                var compact = builder.ToString().Trim();
                return compact.Length > 0 ? compact : "Work";
            }

            private int MeasureTextWidth(string value, Font font)
            {
                using (var bitmap = new Bitmap(1, 1, PixelFormat.Format32bppPArgb))
                {
                    bitmap.SetResolution(CurrentDpi, CurrentDpi);
                    using (var graphics = Graphics.FromImage(bitmap))
                    using (var format = CreateTextFormat())
                    {
                        graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
                        return (int)Math.Ceiling(graphics.MeasureString(value, font, int.MaxValue, format).Width);
                    }
                }
            }

            private static StringFormat CreateTextFormat()
            {
                var format = (StringFormat)StringFormat.GenericTypographic.Clone();
                format.Alignment = StringAlignment.Near;
                format.LineAlignment = StringAlignment.Center;
                format.FormatFlags |= StringFormatFlags.NoWrap;
                format.Trimming = StringTrimming.EllipsisCharacter;
                return format;
            }

            private int ScalePx(int value)
            {
                return Math.Max(1, (int)Math.Round(value * DpiScale));
            }

            private float DpiScale
            {
                get { return CurrentDpi / 96.0f; }
            }

            private float CurrentDpi
            {
                get { return Math.Max(96, IsHandleCreated ? DeviceDpi : 96); }
            }

            private static Font CreateUIFont(float size, FontStyle style, string[] candidates)
            {
                for (var i = 0; i < candidates.Length; i += 1)
                {
                    try
                    {
                        var font = new Font(candidates[i], size, style, GraphicsUnit.Point);
                        if (string.Equals(font.FontFamily.Name, candidates[i], StringComparison.OrdinalIgnoreCase))
                        {
                            return font;
                        }

                        font.Dispose();
                    }
                    catch
                    {
                    }
                }

                return new Font(SystemFonts.MessageBoxFont.FontFamily, size, style, GraphicsUnit.Point);
            }

            [DllImport("user32.dll", SetLastError = true)]
            private static extern bool SetWindowDisplayAffinity(IntPtr hwnd, uint affinity);

            [DllImport("dwmapi.dll", PreserveSig = true)]
            private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

            [DllImport("user32.dll", SetLastError = true)]
            private static extern IntPtr GetDC(IntPtr hwnd);

            [DllImport("user32.dll", SetLastError = true)]
            private static extern bool SetWindowPos(
                IntPtr hwnd,
                IntPtr hwndInsertAfter,
                int x,
                int y,
                int cx,
                int cy,
                uint flags);

            [DllImport("user32.dll", SetLastError = true)]
            private static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);

            [DllImport("gdi32.dll", SetLastError = true)]
            private static extern IntPtr CreateCompatibleDC(IntPtr hdc);

            [DllImport("gdi32.dll", SetLastError = true)]
            private static extern bool DeleteDC(IntPtr hdc);

            [DllImport("gdi32.dll", SetLastError = true)]
            private static extern IntPtr SelectObject(IntPtr hdc, IntPtr handle);

            [DllImport("gdi32.dll", SetLastError = true)]
            private static extern bool DeleteObject(IntPtr handle);

            [DllImport("gdi32.dll", SetLastError = true)]
            private static extern IntPtr CreateDIBSection(
                IntPtr hdc,
                ref BitmapInfo bitmapInfo,
                uint usage,
                out IntPtr bits,
                IntPtr section,
                uint offset);

            [DllImport("user32.dll", SetLastError = true)]
            private static extern bool UpdateLayeredWindow(
                IntPtr hwnd,
                IntPtr destinationDc,
                ref LayeredPoint destinationPoint,
                ref LayeredSize size,
                IntPtr sourceDc,
                ref LayeredPoint sourcePoint,
                int colorKey,
                ref BlendFunction blend,
                int flags);

            [StructLayout(LayoutKind.Sequential)]
            private struct LayeredPoint
            {
                public int x;
                public int y;
            }

            [StructLayout(LayoutKind.Sequential)]
            private struct LayeredSize
            {
                public int cx;
                public int cy;
            }

            [StructLayout(LayoutKind.Sequential, Pack = 1)]
            private struct BlendFunction
            {
                public byte BlendOp;
                public byte BlendFlags;
                public byte SourceConstantAlpha;
                public byte AlphaFormat;
            }

            [StructLayout(LayoutKind.Sequential)]
            private struct BitmapInfo
            {
                public BitmapInfoHeader Header;
            }

            [StructLayout(LayoutKind.Sequential)]
            private struct BitmapInfoHeader
            {
                public int Size;
                public int Width;
                public int Height;
                public short Planes;
                public short BitCount;
                public int Compression;
                public int SizeImage;
                public int XPelsPerMeter;
                public int YPelsPerMeter;
                public int ClrUsed;
                public int ClrImportant;
            }
        }
    }
}
