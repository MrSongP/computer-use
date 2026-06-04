import test from "node:test";
import assert from "node:assert/strict";
import {
  AppLaunchService,
  classifyAppLaunchStrategy,
  normalizeLaunchAppMode,
  validateLaunchAppIdentifier
} from "../../src/windows/launch/app-launch-service.js";
import { HookRejectionError } from "../../src/core/hooks/hook-rejection-error.js";
import { TASKBAR_APP_ID } from "../../src/core/hooks/shell/taskbar-target.js";

test("AppLaunchService rejects duplicate cold-launches and returns taskbar guidance", async () => {
  const launched: Array<{ app: string; launchMode?: string }> = [];
  const service = new AppLaunchService({
    async listApps() {
      return {
        apps: [
          {
            id: "C:\\Windows\\notepad.exe",
            displayName: "Notepad",
            executablePath: "C:\\Windows\\notepad.exe",
            isRunning: true,
            activationModel: "executable_path",
            windows: [{ id: 42, app: "C:\\Windows\\notepad.exe", title: "notes.txt - Notepad" }]
          }
        ]
      };
    },
    async launchApp(app, options) {
      launched.push({ app, launchMode: options?.launchMode });
    }
  });

  await assert.rejects(
    service.launch({ app: "C:\\Windows\\notepad.exe" }),
    (error: unknown) => {
      assert.equal(error instanceof HookRejectionError, true);
      const rejection = error as HookRejectionError;
      assert.equal(rejection.code, "tray_restore_required");
      assert.equal(rejection.details?.taskbarAppId, TASKBAR_APP_ID);
      assert.equal(typeof rejection.guidance?.model_action, "string");
      return true;
    }
  );
  assert.deepEqual(launched, []);
});

test("AppLaunchService rejects launch_app on the taskbar shell target", async () => {
  const service = new AppLaunchService({
    async listApps() {
      return [];
    },
    async launchApp() {
      throw new Error("launchApp should not run for the taskbar shell target");
    }
  });

  await assert.rejects(
    service.launch({ app: TASKBAR_APP_ID }),
    (error: unknown) => {
      assert.equal(error instanceof HookRejectionError, true);
      const rejection = error as HookRejectionError;
      assert.equal(rejection.code, "invalid_shell_launch_target");
      return true;
    }
  );
});

test("AppLaunchService can bypass the reuse hook when a new instance is explicitly requested", async () => {
  const launched: Array<{ app: string; launchMode?: string }> = [];
  const service = new AppLaunchService({
    async listApps() {
      throw new Error("force_new should bypass listApps");
    },
    async launchApp(app, options) {
      launched.push({ app, launchMode: options?.launchMode });
    }
  });

  assert.deepEqual(await service.launch({
    app: "C:\\Windows\\notepad.exe",
    launch_mode: "force_new"
  }), {
    app: "C:\\Windows\\notepad.exe",
    strategy: "executable_path",
    launchMode: "force_new",
    disposition: "delegated_launch"
  });
  assert.deepEqual(launched, [
    { app: "C:\\Windows\\notepad.exe", launchMode: "force_new" }
  ]);
});

test("AppLaunchService delegates to the bridge when no existing session is found", async () => {
  const launched: Array<{ app: string; launchMode?: string }> = [];
  const service = new AppLaunchService({
    async listApps() {
      return [];
    },
    async launchApp(app, options) {
      launched.push({ app, launchMode: options?.launchMode });
    }
  });

  assert.deepEqual(await service.launch({ app: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App" }), {
    app: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
    strategy: "app_user_model_id",
    launchMode: "reuse_or_launch",
    disposition: "delegated_launch"
  });
  assert.deepEqual(launched, [
    { app: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App", launchMode: "reuse_or_launch" }
  ]);
});

test("launch app validators reject pid identifiers", () => {
  assert.equal(classifyAppLaunchStrategy("C:\\Windows\\notepad.exe"), "executable_path");
  assert.equal(
    classifyAppLaunchStrategy("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"),
    "app_user_model_id"
  );
  assert.equal(normalizeLaunchAppMode(undefined), "reuse_or_launch");
  assert.equal(normalizeLaunchAppMode("force_new"), "force_new");
  assert.throws(() => validateLaunchAppIdentifier("pid:1234"), /does not support pid app identifiers/);
});
