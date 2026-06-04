import type { AppDescriptor } from "../../contracts/app.js";
import type { WindowRef } from "../../contracts/window.js";

export const TASKBAR_APP_ID = "windows.shell.taskbar";
export const TASKBAR_DISPLAY_NAME = "Windows Taskbar";
export const TASKBAR_WINDOW_TITLE = "Windows Taskbar";

export function isTaskbarAppId(appId: string | undefined): boolean {
  return typeof appId === "string" && appId.trim().toLowerCase() === TASKBAR_APP_ID;
}

export function createTaskbarWindow(windowId: number): WindowRef {
  return {
    id: windowId,
    app: TASKBAR_APP_ID,
    title: TASKBAR_WINDOW_TITLE
  };
}

export function createTaskbarApp(windowId: number): AppDescriptor {
  return {
    id: TASKBAR_APP_ID,
    displayName: TASKBAR_DISPLAY_NAME,
    isRunning: true,
    activationModel: "executable_path",
    windows: [createTaskbarWindow(windowId)]
  };
}
