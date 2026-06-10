import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const debugOverlayCapture = isTruthy(process.env.COMPUTER_USE_STATUS_OVERLAY_DEBUG);
const nativeHostDll = path.join(
  rootDir,
  "native-host",
  "ComputerUse.NativeHost",
  "bin",
  "Release",
  "net8.0-windows10.0.19041.0",
  "ComputerUse.NativeHost.dll"
);

const host = spawn("dotnet", [nativeHostDll], {
  cwd: rootDir,
  stdio: ["pipe", "pipe", "pipe"]
});
const debugBackdrop = debugOverlayCapture ? spawnDebugBackdrop() : undefined;
let buffer = "";
const responses = new Map();

host.stdout.setEncoding("utf8");
host.stdout.on("data", (chunk) => {
  buffer += chunk;
  while (buffer.includes("\n")) {
    const newlineIndex = buffer.indexOf("\n");
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (line.length > 0) {
      const response = JSON.parse(line);
      responses.set(response.id, response);
    }
  }
});

host.stderr.setEncoding("utf8");
host.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

try {
  if (debugBackdrop) {
    await wait(1800);
  }

  send({ id: 1, method: "beginTurn", payload: { meta: null } });
  await waitForResponse(1);
  send({
    id: 2,
    method: "updateStatus",
    payload: {
      title: "activate_window",
      detail: "\u6b63\u5728\u6fc0\u6d3b QQ \u7a97\u53e3"
    }
  });
  await waitForResponse(2);

  process.stdout.write("HUD visible for 8000ms. Move the mouse near the screen edge to test clamping.\n");
  await wait(8000);

  send({ id: 3, method: "listWindows", payload: {} });
  const listResponse = await waitForResponse(3);
  const overlayWindow = listResponse.result?.find((window) =>
    String(window.title ?? "").includes("Computer Use Status Overlay")
  );
  if (debugOverlayCapture) {
    if (!overlayWindow) {
      throw new Error("Debug overlay capture is enabled, but the cursor status overlay was not discoverable.");
    }

    send({
      id: 4,
      method: "getWindowState",
      payload: {
        params: {
          window: overlayWindow,
          include_screenshot: true,
          include_text: false
        }
      }
    });
    const stateResponse = await waitForResponse(4);
    const screenshot = stateResponse.result?.screenshot;
    if (!screenshot?.data) {
      throw new Error("Debug overlay screenshot was not captured.");
    }

    const outputDir = path.join(rootDir, ".tmp");
    fs.mkdirSync(outputDir, { recursive: true });
    const raw = screenshot.raw;
    const outputPath = path.join(
      outputDir,
      raw?.data ? "cursor-status-overlay-debug.png" : "cursor-status-overlay-debug.jpg"
    );
    fs.writeFileSync(outputPath, Buffer.from(raw?.data ?? screenshot.data, "base64"));
    process.stdout.write(`Saved debug overlay screenshot: ${outputPath}\n`);

    const renderPath = path.join(outputDir, "cursor-status-overlay-render.png");
    const checkerPath = path.join(outputDir, "cursor-status-overlay-render-checker.png");
    if (fs.existsSync(renderPath)) {
      process.stdout.write(`Saved debug overlay render: ${renderPath}\n`);
    }
    if (fs.existsSync(checkerPath)) {
      process.stdout.write(`Saved debug overlay checker render: ${checkerPath}\n`);
    }
  } else {
    if (overlayWindow) {
      throw new Error("Cursor status overlay should be hidden from agent-facing window discovery.");
    }

    process.stdout.write("Cursor status overlay stayed human-visible and hidden from listWindows.\n");
  }
} finally {
  try {
    send({ id: 5, method: "endTurn", payload: {} });
    await waitForResponse(5).catch(() => undefined);
  } finally {
    host.stdin.end();
    host.kill();
    if (debugBackdrop && !debugBackdrop.killed) {
      debugBackdrop.kill();
    }
  }
}

function send(payload) {
  host.stdin.write(`${JSON.stringify(payload)}\n`, "utf8");
}

async function waitForResponse(id) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (responses.has(id)) {
      return responses.get(id);
    }
    await wait(100);
  }

  throw new Error(`Timed out waiting for native-host response ${id}.`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? ""));
}

function spawnDebugBackdrop() {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$cursor = [System.Windows.Forms.Cursor]::Position
$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.ShowInTaskbar = $false
$form.TopMost = $true
$form.Width = 720
$form.Height = 190
$form.Left = [Math]::Max(0, $cursor.X - 360)
$form.Top = [Math]::Max(0, $cursor.Y - 175)
$form.BackColor = [System.Drawing.Color]::FromArgb(255, 20, 184, 166)
$bitmap = New-Object System.Drawing.Bitmap $form.Width, $form.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::FromArgb(255, 20, 184, 166))
$colors = @(
  [System.Drawing.Color]::FromArgb(255, 20, 184, 166),
  [System.Drawing.Color]::FromArgb(255, 59, 130, 246),
  [System.Drawing.Color]::FromArgb(255, 99, 102, 241),
  [System.Drawing.Color]::FromArgb(255, 244, 114, 182)
)
$bandWidth = [Math]::Ceiling($form.Width / $colors.Count)
for ($i = 0; $i -lt $colors.Count; $i += 1) {
  $brush = New-Object System.Drawing.SolidBrush $colors[$i]
  $graphics.FillRectangle($brush, $i * $bandWidth, 0, $bandWidth + 2, $form.Height)
  $brush.Dispose()
}
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(150, 255, 255, 255)), 4
for ($x = -180; $x -lt $form.Width + 180; $x += 36) {
  $graphics.DrawLine($pen, $x, $form.Height, $x + 180, 0)
}
$pen.Dispose()
$graphics.Dispose()
$form.BackgroundImage = $bitmap
$form.BackgroundImageLayout = [System.Windows.Forms.ImageLayout]::Stretch
$form.Add_FormClosed({ $bitmap.Dispose() })
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 15000
$timer.Add_Tick({ $timer.Stop(); $form.Close() })
$timer.Start()
[System.Windows.Forms.Application]::Run($form)
`;
  return spawn("powershell.exe", ["-NoProfile", "-Sta", "-Command", script], {
    stdio: ["ignore", "ignore", "inherit"]
  });
}
