import type { AppDescriptor, AppIdentifier } from "../../contracts/app.js";
import type { LaunchAppMode } from "../../contracts/discovery.js";
import { HookRejectionError } from "../hook-rejection-error.js";
import {
  TASKBAR_APP_ID,
  TASKBAR_DISPLAY_NAME,
  isTaskbarAppId
} from "../shell/taskbar-target.js";

export interface LaunchAppPolicyContext {
  app: AppIdentifier;
  launchMode: LaunchAppMode;
  matchedApp?: AppDescriptor;
}

export function enforceLaunchAppPolicy(context: LaunchAppPolicyContext): void {
  if (context.launchMode === "force_new") {
    return;
  }

  if (isTaskbarAppId(context.app)) {
    throw new HookRejectionError({
      code: "invalid_shell_launch_target",
      message: "launch_app cannot be used on the Windows Taskbar shell target.",
      details: {
        app: context.app,
        shellTarget: TASKBAR_APP_ID
      },
      guidance: {
        should_retry: true,
        user_visible_message: "The Windows Taskbar target is for inspection and clicking, not for launch_app.",
        model_action: "Use get_window_state, click, or scroll with the taskbar window instead of launch_app.",
        suggested_tool_call: {
          method: "list_apps",
          params: {}
        }
      }
    });
  }

  const matchedApp = context.matchedApp;
  if (!matchedApp?.isRunning) {
    return;
  }

  const matchedExecutablePath = resolveAppExecutablePath(matchedApp);
  const taskbarLabel = matchedApp.taskbarLabel ?? buildTaskbarLabelHint(matchedApp);
  throw new HookRejectionError({
    code: "tray_restore_required",
    message: "launch_app refused to cold-launch a duplicate instance because the app is already running.",
    details: {
      app: context.app,
      matchedAppId: matchedApp.id,
      matchedDisplayName: matchedApp.displayName,
      matchedExecutablePath,
      matchedAliases: matchedApp.aliases,
      matchedProcessNames: matchedApp.processNames,
      matchedProcessIds: matchedApp.processIds,
      taskbarLabelHint: taskbarLabel,
      detectedState: matchedApp.windows.length > 0 ? "running_with_visible_window" : "running_without_visible_window",
      existingWindowIds: matchedApp.windows.map((window) => window.id),
      taskbarAppId: TASKBAR_APP_ID,
      followUpActions: [
        {
          action: "restoreFromTaskbar",
          taskbarAppId: TASKBAR_APP_ID,
          ...(taskbarLabel ? { taskbarLabel } : {}),
          app: matchedApp.id,
          ...(matchedExecutablePath ? { executablePath: matchedExecutablePath } : {})
        },
        {
          action: "pollListApps",
          timeoutMs: 1500,
          intervalMs: 100
        }
      ]
    },
    guidance: {
      should_retry: true,
      user_visible_message: "The app is already running. Do not cold-launch a second instance.",
      model_action: `Call list_apps, select ${TASKBAR_DISPLAY_NAME} (${TASKBAR_APP_ID}), capture it with get_window_state, and click the matching taskbar or notification-area icon${taskbarLabel ? ` such as "${taskbarLabel}"` : ""} to restore the existing session instead of cold-launching.`,
      suggested_tool_call: {
        method: "list_apps",
        params: {}
      }
    }
  });
}

function resolveAppExecutablePath(app: AppDescriptor): string | undefined {
  if (looksLikeExecutablePath(app.executablePath)) {
    return app.executablePath;
  }

  for (const alias of app.aliases ?? []) {
    if (looksLikeExecutablePath(alias)) {
      return alias;
    }
  }

  for (const window of app.windows) {
    if (looksLikeExecutablePath(window.app)) {
      return window.app;
    }
  }

  return looksLikeExecutablePath(app.id) ? app.id : undefined;
}

function looksLikeExecutablePath(value: string | undefined): value is string {
  return typeof value === "string" && (/\.exe$/i.test(value) || /^[a-z]:\\/i.test(value) || /^\\\\/i.test(value));
}

function buildTaskbarLabelHint(app: AppDescriptor): string | undefined {
  const label = app.displayName ?? stripExeExtension(app.processNames?.[0]) ?? stripExeExtension(resolveAppExecutablePath(app));
  return label ? `${label} - 1 running window` : undefined;
}

function stripExeExtension(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const fileName = value.split(/[\\/]/).pop() ?? value;
  return fileName.replace(/\.exe$/i, "");
}
