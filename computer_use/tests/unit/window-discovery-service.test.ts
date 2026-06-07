import test from "node:test";
import assert from "node:assert/strict";
import {
  WindowDiscoveryService,
  validateAppDescriptor,
  validateGetWindowParams,
  validateWindowRef
} from "../../src/windows/discovery/window-discovery-service.js";

test("WindowDiscoveryService normalizes windows and apps from the bridge", async () => {
  const service = new WindowDiscoveryService({
    async listWindows() {
      return [{ id: 42, app: "C:\\Windows\\notepad.exe", title: "Notes" }];
    },
    async getWindow() {
      return { id: 42, app: "C:\\Windows\\notepad.exe", title: "Notes" };
    },
    async listApps() {
      return [
        {
          id: "C:\\Windows\\notepad.exe",
          displayName: "Notepad",
          executablePath: "C:\\Windows\\notepad.exe",
          activationModel: "executable_path",
          windows: [{ id: 42, app: "C:\\Windows\\notepad.exe", title: "Notes" }]
        }
      ];
    }
  });

  assert.deepEqual(await service.listWindows(), [
    { id: 42, app: "C:\\Windows\\notepad.exe", title: "Notes" }
  ]);
  assert.deepEqual(await service.getWindow({ id: 42 }), {
    id: 42,
    app: "C:\\Windows\\notepad.exe",
    title: "Notes"
  });
  assert.deepEqual(await service.listApps(), {
    apps: [
      {
        id: "C:\\Windows\\notepad.exe",
        displayName: "Notepad",
        executablePath: "C:\\Windows\\notepad.exe",
        activationModel: "executable_path",
        windows: [{ id: 42, app: "C:\\Windows\\notepad.exe", title: "Notes" }]
      }
    ],
    runtime: {
      schemaVersion: "computer-use/list-apps/v1"
    }
  });
});

test("WindowDiscoveryService accepts wrapped apps payloads from the native-host path", async () => {
  const service = new WindowDiscoveryService({
    async listWindows() {
      return [];
    },
    async getWindow() {
      return { id: 42, app: "C:\\Windows\\notepad.exe", title: "Notes" };
    },
    async listApps() {
      return {
        apps: [
          {
            id: "C:\\Windows\\notepad.exe",
            displayName: "Notepad",
            executablePath: "C:\\Windows\\notepad.exe",
            activationModel: "executable_path",
            windows: [{ id: 42, app: "C:\\Windows\\notepad.exe", title: "Notes" }]
          }
        ]
      };
    }
  });

  assert.deepEqual(await service.listApps(), {
    apps: [
      {
        id: "C:\\Windows\\notepad.exe",
        displayName: "Notepad",
        executablePath: "C:\\Windows\\notepad.exe",
        activationModel: "executable_path",
        windows: [{ id: 42, app: "C:\\Windows\\notepad.exe", title: "Notes" }]
      }
    ],
    runtime: {
      schemaVersion: "computer-use/list-apps/v1"
    }
  });
});

test("WindowDiscoveryService preserves app identity hints and runtime capabilities", async () => {
  const port = {
    driverName: "native-host",
    capabilities: {
      lifecycleModel: {
        transport: "embedded"
      }
    },
    async listWindows() {
      return [];
    },
    async getWindow() {
      return { id: 42, app: "D:\\Program Files (x86)\\QQ\\QQ.exe", title: "QQ" };
    },
    async listApps() {
      return [
        {
          id: "QQ",
          displayName: "QQ",
          executablePath: "D:\\Program Files (x86)\\QQ\\QQ.exe",
          aliases: ["QQ", "D:\\Program Files (x86)\\QQ\\QQ.exe"],
          processNames: ["QQ.exe"],
          processIds: [1234],
          taskbarLabel: "QQ",
          isRunning: true,
          activationModel: "app_user_model_id" as const,
          windows: []
        }
      ];
    }
  };
  const service = new WindowDiscoveryService(port);

  assert.deepEqual(await service.listApps(), {
    apps: [
      {
        id: "QQ",
        displayName: "QQ",
        executablePath: "D:\\Program Files (x86)\\QQ\\QQ.exe",
        aliases: ["QQ", "D:\\Program Files (x86)\\QQ\\QQ.exe"],
        processNames: ["QQ.exe"],
        processIds: [1234],
        taskbarLabel: "QQ",
        isRunning: true,
        activationModel: "app_user_model_id",
        windows: []
      }
    ],
    runtime: {
      schemaVersion: "computer-use/list-apps/v1",
      driverName: "native-host",
      capabilities: {
        lifecycleModel: {
          transport: "embedded"
        }
      }
    }
  });
});

test("window discovery validators reject malformed payloads", () => {
  assert.throws(() => validateGetWindowParams({ id: -1 }), /non-negative integer id/);
  assert.throws(() => validateWindowRef({ id: Number.NaN, app: "demo.exe" }), /invalid window id/);
  assert.throws(
    () => validateAppDescriptor({ id: "demo.exe", windows: undefined as never }),
    /invalid app window list/
  );
});
