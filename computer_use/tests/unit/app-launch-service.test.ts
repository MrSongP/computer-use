import test from "node:test";
import assert from "node:assert/strict";
import {
  AppLaunchService,
  classifyAppLaunchStrategy,
  validateLaunchAppIdentifier
} from "../../src/windows/launch/app-launch-service.js";

test("AppLaunchService classifies executable-path and app-id launches", async () => {
  const launched: string[] = [];
  const service = new AppLaunchService({
    async launchApp(app) {
      launched.push(app);
    }
  });

  assert.deepEqual(await service.launch("C:\\Windows\\notepad.exe"), {
    app: "C:\\Windows\\notepad.exe",
    strategy: "executable_path"
  });
  assert.deepEqual(await service.launch("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"), {
    app: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
    strategy: "app_user_model_id"
  });
  assert.deepEqual(launched, [
    "C:\\Windows\\notepad.exe",
    "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"
  ]);
});

test("launch app validators reject pid identifiers", () => {
  assert.equal(classifyAppLaunchStrategy("C:\\Windows\\notepad.exe"), "executable_path");
  assert.equal(
    classifyAppLaunchStrategy("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"),
    "app_user_model_id"
  );
  assert.throws(() => validateLaunchAppIdentifier("pid:1234"), /does not support pid app identifiers/);
});
